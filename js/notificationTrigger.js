// Cardapio Quatinga v3 - notificationTrigger.js
// Chama o Cloudflare Worker para disparar push FCM real (barra de status Android)
// Incluir no index.html ANTES de app.js: <script src="js/notificationTrigger.js"></script>

(function (global) {
  const fb = global.fb;
  const auth = global.auth;
  const APP_CONFIG = global.APP_CONFIG;

  // URL do Cloudflare Worker (deploy feito em 24/09/2026)
  const NOTIFY_ENDPOINT = 'https://cardapio-push.menino-belu90.workers.dev';

  async function callNotifyEndpoint(payload) {
    try {
      const res = await fetch(NOTIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      console.log('Notify response:', data);
      return data;
    } catch (e) {
      console.warn('Notify endpoint error:', e);
    }
  }

  // Quando admin salva cardápio da próxima semana
  global.triggerNewMenuNotification = async function(isNextWeek) {
    const title = isNextWeek
      ? '📅 Cardápio da Próxima Semana Disponível!'
      : '🍽️ Novo Cardápio da Semana!';
    const body = isNextWeek
      ? 'O cardápio antecipado já está no app. Escolha seus pratos!'
      : 'O cardápio desta semana foi atualizado. Faça seu pedido.';

    await callNotifyEndpoint({
      type: 'new_menu',
      title,
      body,
      role: 'funcionario',
      data: { type: 'new_menu', isNextWeek: String(isNextWeek) }
    });
  };

  // Quando funcionário faz pedido antecipado
  global.triggerNewOrderNotification = async function(orderData) {
    if (!orderData.isNextWeek) return; // Só notifica admin para pedidos antecipados

    await callNotifyEndpoint({
      type: 'new_order',
      title: '📋 Novo Pedido Antecipado',
      body: `${orderData.employeeName || 'Funcionário'} fez o pedido para a próxima semana.`,
      role: 'admin',
      data: { type: 'new_order', orderId: orderData.id, employeeRGF: orderData.employeeRGF }
    });
  };

  // Verifica se todos pediram (pode ser chamado pelo admin ou agendado)
  global.checkAndNotifyAllOrdered = async function() {
    try {
      const funcsSnap = await fb.getDocs(fb.query(global.getFuncionariosCollectionRef(), fb.where('ativo', '==', true)));
      const activeRGFs = funcsSnap.docs.map(d => d.id);

      const pedidosSnap = await fb.getDocs(fb.query(
        fb.collection(global.db, 'pedidosDaSemana'),
        fb.where('isNextWeek', '==', false)
      ));
      const rgfsQuePediram = pedidosSnap.docs.map(d => d.data().employeeRGF).filter(Boolean);

      const faltantes = activeRGFs.filter(rgf => !rgfsQuePediram.includes(rgf));

      if (faltantes.length === 0 && activeRGFs.length > 0) {
        await callNotifyEndpoint({
          type: 'all_ordered',
          title: '✅ Todos já escolheram!',
          body: `Todos os ${activeRGFs.length} funcionários ativos fizeram o pedido desta semana.`,
          role: 'admin',
          data: { type: 'all_ordered', total: String(activeRGFs.length) }
        });
      }
    } catch (e) { console.warn('checkAllOrdered error:', e); }
  };

  // Agendamento diário para admin (roda quando admin abre o app)
  let dailyCheckDone = false;
  global.scheduleDailyAllOrderedCheck = function() {
    if (dailyCheckDone) return;
    const now = new Date();
    const nextRun = new Date();
    nextRun.setHours(10, 0, 0, 0); // 10:00 BRT
    if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
    const msUntil = nextRun - now;
    setTimeout(() => {
      dailyCheckDone = false;
      global.checkAndNotifyAllOrdered();
      global.scheduleDailyAllOrderedCheck(); // Reagenda para próximo dia
    }, msUntil);
    dailyCheckDone = true;
  };
})(window);