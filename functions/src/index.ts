import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// ============================================================
// Helpers
// ============================================================
const TOPIC_FUNCIONARIOS = "funcionarios";
const TOPIC_ADMIN = "admin";

async function sendToTopic(topic: string, title: string, body: string, data?: Record<string, string>) {
  const message = {
    topic,
    notification: { title, body },
    data: data || {},
    android: {
      priority: "high" as const,
      notification: {
        channelId: "cardapio_notifications",
        icon: "ic_notification",
        color: "#2563EB",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
  };
  try {
    const response = await messaging.send(message);
    functions.logger.info(`Notificação enviada para ${topic}: ${response}`);
    return response;
  } catch (error) {
    functions.logger.error(`Erro ao enviar para ${topic}:`, error);
    throw error;
  }
}

async function sendToTokens(tokens: string[], title: string, body: string, data?: Record<string, string>) {
  if (tokens.length === 0) return;
  const message = {
    tokens,
    notification: { title, body },
    data: data || {},
    android: {
      priority: "high" as const,
      notification: {
        channelId: "cardapio_notifications",
        icon: "ic_notification",
        color: "#2563EB",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
  };
  try {
    const response = await messaging.sendEachForMulticast(message);
    functions.logger.info(`Enviado para ${response.successCount}/${tokens.length} tokens`);
    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const err = resp.error;
          if (err && (err.code === "messaging/invalid-registration-token" || err.code === "messaging/registration-token-not-registered")) {
            failedTokens.push(tokens[idx]);
          }
        }
      });
      if (failedTokens.length > 0) {
        await db.collection("deviceTokens").where(admin.firestore.FieldPath.documentId(), "in", failedTokens).get()
          .then(snap => {
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            return batch.commit();
          });
      }
    }
    return response;
  } catch (error) {
    functions.logger.error("Erro ao enviar multicast:", error);
    throw error;
  }
}

async function getAdminTokens(): Promise<string[]> {
  const snap = await db.collection("deviceTokens")
    .where("role", "==", "admin")
    .where("active", "==", true)
    .get();
  return snap.docs.map(d => d.id);
}

async getFuncionarioTokens(): Promise<string[]> {
  const snap = await db.collection("deviceTokens")
    .where("role", "==", "funcionario")
    .where("active", "==", true)
    .get();
  return snap.docs.map(d => d.id);
}

// ============================================================
// 1. NOVO CARDÁPIO -> notifica todos os funcionários
// ============================================================
export const onNewCardapio = functions.firestore
  .document("cardapioSemana/{docId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    if (!data) return;

    const isNextWeek = !!data.nextMenuImageBase64;
    const title = isNextWeek
      ? "📅 Cardápio da Próxima Semana Disponível!"
      : "🍽️ Novo Cardápio da Semana!";
    const body = isNextWeek
      ? "O cardápio antecipado já está no app. Escolha seus pratos!"
      : "O cardápio desta semana foi atualizado. Faça seu pedido.";

    // Send to topic (all subscribed funcionarios)
    await sendToTopic(TOPIC_FUNCIONARIOS, title, body, {
      type: "new_cardapio",
      isNextWeek: String(isNextWeek),
      timestamp: String(Date.now()),
    });

    // Also send to individual tokens as fallback (some may not be subscribed to topic)
    const tokens = await getFuncionarioTokens();
    if (tokens.length > 0) {
      await sendToTokens(tokens, title, body, {
        type: "new_cardapio",
        isNextWeek: String(isNextWeek),
        timestamp: String(Date.now()),
      });
    }
  });

// ============================================================
// 2. NOVO PEDIDO -> notifica admin se for pedido antecipado
// ============================================================
export const onNewOrder = functions.firestore
  .document("pedidosDaSemana/{docId}")
  .onCreate(async (snap, context) => {
    const order = snap.data();
    if (!order) return;

    const isNextWeek = !!order.isNextWeek;
    if (!isNextWeek) return; // Only notify admin for antecipated orders

    const employeeName = order.employeeName || "Funcionário";
    const title = "📋 Novo Pedido Antecipado";
    const body = `${employeeName} fez o pedido para a próxima semana.`;

    const adminTokens = await getAdminTokens();
    if (adminTokens.length > 0) {
      await sendToTokens(adminTokens, title, body, {
        type: "new_order",
        orderId: context.params.docId,
        employeeRGF: order.employeeRGF || "",
        timestamp: String(Date.now()),
      });
    }
  });

// ============================================================
// 3. SCHEDULER DIÁRIO -> verifica se todos já escolheram
// Roda todo dia às 10:00 (horário de Brasília = UTC-3)
// ============================================================
export const dailyCheckAllOrdered = functions.pubsub
  .schedule("0 13 * * *") // 13:00 UTC = 10:00 BRT
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diaSemana = hoje.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
    // Só roda em dias úteis (Seg=1 a Sex=5)
    if (diaSemana === 0 || diaSemana === 6) {
      functions.logger.info("Fim de semana, verificação pulada");
      return;
    }

    // Busca funcionários ativos
    const funcsSnap = await db.collection("funcionarios").where("ativo", "==", true).get();
    if (funcsSnap.empty) return;

    const todosRGFs = funcsSnap.docs.map(d => d.id);

    // Busca pedidos da semana atual (não isNextWeek)
    const pedidosSnap = await db.collection("pedidosDaSemana")
      .where("isNextWeek", "==", false)
      .get();

    const rgfsQuePediram = new Set<string>();
    pedidosSnap.docs.forEach(doc => {
      const rgf = doc.data().employeeRGF;
      if (rgf) rgfsQuePediram.add(rgf);
    });

    const faltantes = todosRGFs.filter(rgf => !rgfsQuePediram.has(rgf));

    if (faltantes.length === 0) {
      // TODOS PEDIRAM -> notifica admin
      const title = "✅ Todos os funcionários já escolheram!";
      const body = `Todos os ${todosRGFs.length} funcionários ativos fizeram o pedido desta semana.`;

      const adminTokens = await getAdminTokens();
      if (adminTokens.length > 0) {
        await sendToTokens(adminTokens, title, body, {
          type: "all_ordered",
          total: String(todosRGFs.length),
          timestamp: String(Date.now()),
        });
      }
      functions.logger.info("Todos pediram - notificação enviada aos admins");
    } else {
      // OPCIONAL: notificar os que faltam (lembrete suave)
      // Descomente se quiser lembrar os atrasados:
      /*
      const tokensFaltantes = await db.collection("deviceTokens")
        .where("role", "==", "funcionario")
        .where("active", "==", true)
        .where(admin.firestore.FieldPath.documentId(), "in", faltantes)
        .get()
        .then(snap => snap.docs.map(d => d.id));

      if (tokensFaltantes.length > 0) {
        await sendToTokens(tokensFaltantes,
          "⏰ Lembrete: Faça seu pedido!",
          "O prazo para escolher o cardápio desta semana está acabando.",
          { type: "reminder", timestamp: String(Date.now()) }
        );
      }
      */
      functions.logger.info(`${faltantes.length} funcionários ainda não pediram`);
    }
  });

// ============================================================
// 4. CLEANUP: remove tokens inativos periodicamente (opcional)
// ============================================================
export const cleanupInactiveTokens = functions.pubsub
  .schedule("0 3 * * 0") // Domingos 03:00 UTC
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    const corte = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const snap = await db.collection("deviceTokens")
      .where("updatedAt", "<", corte)
      .where("active", "==", true)
      .get();

    if (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach(doc => batch.update(doc.ref, { active: false }));
      await batch.commit();
      functions.logger.info(`${snap.size} tokens marcados como inativos`);
    }
  });