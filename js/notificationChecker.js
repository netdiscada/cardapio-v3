// Cardapio Quatinga v3 - notificationChecker.js
// Polling local para notificações (sem servidor, funciona offline/APK/PWA)
// Incluir no index.html ANTES de app.js: <script src="js/notificationChecker.js"></script>

(function (global) {
  const fb = global.fb;
  const auth = global.auth;
  const APP_CONFIG = global.APP_CONFIG;

  // Estado do checker
  const checkerState = {
    lastMenuHash: null,
    lastOrdersCount: 0,
    lastAllOrderedNotified: false,
    intervalId: null,
    isAdmin: false,
    employeeRGF: null,
    employeeName: null
  };

  // Permissão para notificações do navegador
  async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  // Mostra notificação local (funciona no APK via Capacitor e no PWA)
  function showLocalNotification(title, body, data = {}) {
    // Tenta notificação nativa do Capacitor (APK)
    if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.Plugins.PushNotifications) {
      try {
        Capacitor.Plugins.PushNotifications.schedule({
          notifications: [{
            title,
            body,
            id: Date.now(),
            extra: data,
            schedule: { at: new Date(Date.now() + 100) }
          }]
        });
        return;
      } catch (e) { /* fallback */ }
    }
    // Fallback: Notification API do navegador (PWA/Chrome)
    if ('Notification' in window && Notification.permission === 'granted') {
      const notif = new Notification(title, {
        body,
        icon: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%232563eb%27 rx=%2720%27/%3E%3Ctext x=%2750%27 y=%2765%27 font-size=%2760%27 text-anchor=%27middle%27 fill=%27white%27%3E%F0%9F%8D%B2%3C/text%3E%3C/svg%3E',
        badge: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%232563eb%27 rx=%2720%27/%3E%3Ctext x=%2750%27 y=%2765%27 font-size=%2760%27 text-anchor=%27middle%27 fill=%27white%27%3E%F0%9F%8D%B2%3C/text%3E%3C/svg%3E',
        tag: data.tag || 'cardapio-notification',
        data
      });
      notif.onclick = () => { window.focus(); notif.close(); };
    }
  }

  // Hash simples para detectar mudança no cardápio
  function hashMenu(data) {
    if (!data) return null;
    const str = (data.menuImageBase64 || '') + (data.nextMenuImageBase64 || '') + JSON.stringify(data.holidays || []) + JSON.stringify(data.nextHolidays || []);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  // Verifica cardápio (funcionários e admin)
  async function checkMenu() {
    try {
      const docSnap = await fb.getDoc(global.getMenuDocRef());
      if (!docSnap.exists()) return;

      const data = docSnap.data();
      const currentHash = hashMenu(data);

      if (checkerState.lastMenuHash !== null && currentHash !== checkerState.lastMenuHash) {
        // Cardápio mudou
        const hasNext = !!data.nextMenuImageBase64;
        showLocalNotification(
          hasNext ? '📅 Cardápio da Próxima Semana!' : '🍽️ Novo Cardápio!',
          hasNext ? 'O cardápio antecipado já está disponível. Escolha seus pratos!' : 'O cardápio desta semana foi atualizado. Faça seu pedido.',
          { type: 'new_menu', isNextWeek: hasNext, tag: 'new-menu-' + Date.now() }
        );
      }
      checkerState.lastMenuHash = currentHash;
    } catch (e) { console.warn('checkMenu error:', e); }
  }

  // Verifica pedidos (admin vê novos pedidos; funcionário vê se já pediu)
  async function checkOrders() {
    try {
      if (checkerState.isAdmin) {
        // Admin: conta pedidos e detecta novos
        const snap = await fb.getDocs(fb.collection(global.db, 'pedidosDaSemana'));
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const currentCount = orders.length;

        if (checkerState.lastOrdersCount > 0 && currentCount > checkerState.lastOrdersCount) {
          // Novos pedidos desde última verificação
          const newOrders = orders.slice(0, currentCount - checkerState.lastOrdersCount);
          newOrders.forEach(order => {
            if (order.isNextWeek) {
              showLocalNotification(
                '📋 Novo Pedido Antecipado',
                `${order.employeeName || 'Funcionário'} fez o pedido para a próxima semana.`,
                { type: 'new_order', orderId: order.id, tag: 'new-order-' + order.id }
              );
            }
          });
        }

        // Verifica "Todos já escolheram" (semana atual)
        const funcsSnap = await fb.getDocs(fb.query(global.getFuncionariosCollectionRef(), fb.where('ativo', '==', true)));
        const activeRGFs = funcsSnap.docs.map(d => d.id);
        const currentWeekOrders = orders.filter(o => !o.isNextWeek).map(o => o.employeeRGF).filter(Boolean);
        const missing = activeRGFs.filter(rgf => !currentWeekOrders.includes(rgf));

        if (missing.length === 0 && activeRGFs.length > 0 && !checkerState.lastAllOrderedNotified) {
          showLocalNotification(
            '✅ Todos já escolheram!',
            `Todos os ${activeRGFs.length} funcionários ativos fizeram o pedido desta semana.`,
            { type: 'all_ordered', total: activeRGFs.length, tag: 'all-ordered' }
          );
          checkerState.lastAllOrderedNotified = true;
        } else if (missing.length > 0) {
          checkerState.lastAllOrderedNotified = false;
        }

        checkerState.lastOrdersCount = currentCount;
      } else {
        // Funcionário: só avisa se tem cardápio novo (já feito no checkMenu)
        // Opcional: lembrete se não pediu ainda
      }
    } catch (e) { console.warn('checkOrders error:', e); }
  }

  // Loop principal
  async function runChecks() {
    if (!auth.currentUser) return;
    await checkMenu();
    await checkOrders();
  }

  // Inicia o checker (chamado após login)
  global.startNotificationChecker = async function(isAdmin, rgf, name) {
    checkerState.isAdmin = isAdmin;
    checkerState.employeeRGF = rgf;
    checkerState.employeeName = name;

    // Pega estado inicial
    await checkMenu();
    await checkOrders();

    // Pede permissão
    await requestNotificationPermission();

    // Para intervalo anterior se existir
    if (checkerState.intervalId) clearInterval(checkerState.intervalId);

    // Roda a cada 30 segundos (ajustável)
    checkerState.intervalId = setInterval(runChecks, 30000);
    console.log('Notification checker iniciado (30s interval)');
  };

  // Para o checker (logout)
  global.stopNotificationChecker = function() {
    if (checkerState.intervalId) {
      clearInterval(checkerState.intervalId);
      checkerState.intervalId = null;
    }
    checkerState.lastMenuHash = null;
    checkerState.lastOrdersCount = 0;
    checkerState.lastAllOrderedNotified = false;
    checkerState.isAdmin = false;
    checkerState.employeeRGF = null;
    checkerState.employeeName = null;
    console.log('Notification checker parado');
  };

  // Exposição para debug
  global.__notificationChecker = checkerState;
})(window);