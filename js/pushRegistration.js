// Cardapio Quatinga v3 - pushRegistration.js
// Registra o token FCM do dispositivo no Firestore (coleção deviceTokens)
// com role (funcionario/admin) e active=true — lido pelo Cloudflare Worker
// Silencioso (sem toasts de debug).

(function (global) {
  const db = global.db;
  const auth = global.auth;
  const APP_CONFIG = global.APP_CONFIG;

  async function saveTokenToFirestore(token, role, rgf) {
    try {
      await db.collection('deviceTokens').doc(token).set({
        token, rgf: rgf || null, role,
        active: true, platform: 'android',
        updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log('[pushRegistration] Token salvo:', token.substring(0,20)+'...', 'role:', role);
    } catch (err) {
      console.error('[pushRegistration] Erro save:', err);
    }
  }

  async function registerDeviceToken() {
    // 1. Checa Capacitor nativo
    if (!window.Capacitor || !Capacitor.isNativePlatform || !Capacitor.Plugins?.PushNotifications) {
      console.warn('[pushRegistration] Capacitor/PushNotifications não disponível');
      return;
    }
    const Push = Capacitor.Plugins.PushNotifications;

    try {
      // 2. Permissão (Android 13+)
      const perm = await Push.requestPermissions();
      console.log('[pushRegistration] Permissão:', perm.receive);
      if (perm.receive !== 'granted') return;

      // 3. Listener ANTES do register
      await Push.addListener('registration', async (tokenObj) => {
        const token = tokenObj?.value || tokenObj?.token;
        if (!token) { console.warn('[pushRegistration] Token vazio'); return; }
        console.log('[pushRegistration] Token FCM recebido:', token.substring(0,20)+'...');

        const isAdmin = !!(auth?.currentUser?.uid === APP_CONFIG.ADMIN_UID);
        const role = isAdmin ? 'admin' : 'funcionario';
        const rgfEl = document.getElementById('employeeRGF');
        const rgf = rgfEl?.value?.trim() || null;

        await saveTokenToFirestore(token, role, rgf);
        localStorage.setItem('fcmToken', token);
      });

      await Push.addListener('registrationError', (err) => {
        console.error('[pushRegistration] registrationError:', err);
      });

      // 4. Registra
      console.log('[pushRegistration] Registrando no FCM...');
      await Push.register();
      console.log('[pushRegistration] Push.register() ok — aguardando token...');

    } catch (e) {
      console.error('[pushRegistration] Falha:', e);
    }
  }

  // Re-registra ao digitar RGF (associa token ao funcionário)
  function bindRgfReassociation() {
    const rgfEl = document.getElementById('employeeRGF');
    if (!rgfEl) return;
    rgfEl.addEventListener('change', async () => {
      const token = localStorage.getItem('fcmToken');
      if (!token) return;
      const isAdmin = !!(auth?.currentUser?.uid === APP_CONFIG.ADMIN_UID);
      await saveTokenToFirestore(token, isAdmin ? 'admin' : 'funcionario', rgfEl.value.trim());
    });
  }

  // Inicia: SEMPRE tenta registrar (mesmo se auth já pronto)
  async function init() {
    bindRgfReassociation();
    
    // Se já logado (anônimo ou admin), registra AGORA
    if (auth?.currentUser) {
      console.log('[pushRegistration] Usuário já logado:', auth.currentUser.uid);
      await registerDeviceToken();
    } else {
      // Senão espera auth state
      const unsub = auth?.onAuthStateChanged(async (user) => {
        if (user) {
          console.log('[pushRegistration] Auth state changed:', user.uid);
          await registerDeviceToken();
          unsub && unsub();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.registerDeviceToken = registerDeviceToken;
})(window);