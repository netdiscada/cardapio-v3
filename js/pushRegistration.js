// Cardapio Quatinga v3 - pushRegistration.js
// Registra token FCM (Android nativo) E Web Push subscription (PWA/navegador)
// no Firestore (coleção deviceTokens) com role (funcionario/admin) e active=true.

(function (global) {
  const db = global.db;
  const auth = global.auth;
  const APP_CONFIG = global.APP_CONFIG;

  // VAPID Public Key (gerada com: npx web-push generate-vapid-keys)
  const VAPID_PUBLIC_KEY = 'BMmYnn-I2T0trwfsb4gwFhYbPuvIKxI_HibaYjxXFf02FItlEFNiA82LaJ_QQu7vNnYgoSx1wLARVPCywvCrtxU';

  // Helper: converte base64url para Uint8Array para pushManager.subscribe
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from(rawData, c => c.charCodeAt(0));
  }

  async function saveTokenToFirestore(token, role, rgf, platform = 'android', endpoint = null, p256dh = null, authSecret = null) {
    try {
      const docData = {
        token, rgf: rgf || null, role,
        active: true, platform,
        updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
      };
      // Web Push fields
      if (endpoint) {
        docData.endpoint = endpoint;
        docData.p256dh = p256dh;
        docData.auth = authSecret;
      }
      await db.collection('deviceTokens').doc(token).set(docData, { merge: true });
      console.log('[pushRegistration] Token salvo:', token.substring(0,20)+'...', 'role:', role, 'platform:', platform);
    } catch (err) {
      console.error('[pushRegistration] Erro save:', err);
    }
  }

  // ===== NATIVO (Capacitor/FCM) =====
  async function registerNativeToken() {
    if (!window.Capacitor || !Capacitor.isNativePlatform || !Capacitor.Plugins?.PushNotifications) {
      console.log('[pushRegistration] Capacitor nativo não disponível');
      return;
    }
    const Push = Capacitor.Plugins.PushNotifications;

    try {
      const perm = await Push.requestPermissions();
      console.log('[pushRegistration] Permissão nativa:', perm.receive);
      if (perm.receive !== 'granted') return;

      await Push.addListener('registration', async (tokenObj) => {
        const token = tokenObj?.value || tokenObj?.token;
        if (!token) { console.warn('[pushRegistration] Token nativo vazio'); return; }
        console.log('[pushRegistration] Token FCM nativo:', token.substring(0,20)+'...');

        const isAdmin = !!(auth?.currentUser?.uid === APP_CONFIG.ADMIN_UID);
        const role = isAdmin ? 'admin' : 'funcionario';
        const rgfEl = document.getElementById('employeeRGF');
        const rgf = rgfEl?.value?.trim() || null;

        await saveTokenToFirestore(token, role, rgf, 'android');
        localStorage.setItem('fcmToken', token);
      });

      await Push.addListener('registrationError', (err) => {
        console.error('[pushRegistration] registrationError nativo:', err);
      });

      console.log('[pushRegistration] Registrando no FCM nativo...');
      await Push.register();
      console.log('[pushRegistration] Push.register() ok — aguardando token...');

    } catch (e) {
      console.error('[pushRegistration] Falha nativa:', e);
    }
  }

  // ===== WEB PUSH (PWA / navegador) =====
  async function registerWebPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[pushRegistration] Web Push não suportado neste navegador');
      return;
    }
    // Não registra Web Push se já for nativo (evita duplicar)
    if (window.Capacitor?.isNativePlatform) {
      console.log('[pushRegistration] Plataforma nativa — pulando Web Push');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      console.log('[pushRegistration] Service Worker pronto');

      // Verifica permissão de notificação
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('[pushRegistration] Permissão de notificação negada:', permission);
        return;
      }

      // Verifica se já tem subscription
      let subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        console.log('[pushRegistration] Web Push subscription existente:', subscription.endpoint.substring(0,50)+'...');
      } else {
        // Cria nova subscription
        console.log('[pushRegistration] Criando nova Web Push subscription...');
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        console.log('[pushRegistration] Nova subscription:', subscription.endpoint.substring(0,50)+'...');
      }

      // Extrai chaves
      const key = subscription.getKey('p256dh');
      const authSecret = subscription.getKey('auth');
      const p256dh = key ? btoa(String.fromCharCode(...new Uint8Array(key))) : null;
      const authB64 = authSecret ? btoa(String.fromCharCode(...new Uint8Array(authSecret))) : null;

      const isAdmin = !!(auth?.currentUser?.uid === APP_CONFIG.ADMIN_UID);
      const role = isAdmin ? 'admin' : 'funcionario';
      const rgfEl = document.getElementById('employeeRGF');
      const rgf = rgfEl?.value?.trim() || null;

      // Usa endpoint como "token" único para Web Push
      await saveTokenToFirestore(
        subscription.endpoint, role, rgf, 'web',
        subscription.endpoint, p256dh, authB64
      );
      localStorage.setItem('webPushEndpoint', subscription.endpoint);
      localStorage.setItem('webPushP256dh', p256dh || '');
      localStorage.setItem('webPushAuth', authB64 || '');

    } catch (e) {
      console.error('[pushRegistration] Falha Web Push:', e);
    }
  }

  // Re-registra/associa token ao digitar RGF
  function bindRgfReassociation() {
    const rgfEl = document.getElementById('employeeRGF');
    if (!rgfEl) return;
    rgfEl.addEventListener('change', async () => {
      const rgf = rgfEl.value.trim();
      const isAdmin = !!(auth?.currentUser?.uid === APP_CONFIG.ADMIN_UID);
      const role = isAdmin ? 'admin' : 'funcionario';

      // Atualiza FCM nativo
      const fcmToken = localStorage.getItem('fcmToken');
      if (fcmToken) {
        await saveTokenToFirestore(fcmToken, role, rgf, 'android');
      }
      // Atualiza Web Push
      const webEndpoint = localStorage.getItem('webPushEndpoint');
      if (webEndpoint) {
        const key = localStorage.getItem('webPushP256dh');
        const authSecret = localStorage.getItem('webPushAuth');
        await saveTokenToFirestore(webEndpoint, role, rgf, 'web', webEndpoint, key, authSecret);
      }
    });
  }

  // Inicialização
  async function init() {
    bindRgfReassociation();

    // Tenta registrar ambos (um vai funcionar dependendo da plataforma)
    if (auth?.currentUser) {
      console.log('[pushRegistration] Usuário já logado:', auth.currentUser.uid);
      await Promise.all([registerNativeToken(), registerWebPush()]);
    } else {
      const unsub = auth?.onAuthStateChanged(async (user) => {
        if (user) {
          console.log('[pushRegistration] Auth state changed:', user.uid);
          await Promise.all([registerNativeToken(), registerWebPush()]);
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

  global.registerDeviceToken = registerNativeToken; // compatibilidade
  global.registerWebPush = registerWebPush;
})(window);