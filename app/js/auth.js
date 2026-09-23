// Cardapio Quatinga v2 - auth.js
// Autenticacao: login admin (email/senha + checagem ADMIN_UID), logout, listener de
// estado de autenticacao e login anonimo (port fiel do v1.x).
// Carregado em 4o lugar no index.html. Escopo global via window.

(function (global) {
  const auth = global.auth;
  const APP_CONFIG = global.APP_CONFIG;
  const S = function () { return global.__state; };

  // ===== Login admin (email/senha) com conferencia de ADMIN_UID =====
  async function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Entrando...';
    const st = S();
    st.isLoggingInAsAdmin = true;
    try {
      if (st.anonymousLoginPromise) await st.anonymousLoginPromise;
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      if (userCredential.user.uid !== APP_CONFIG.ADMIN_UID) {
        await auth.signOut();
        showToast("Acesso Negado.", 'error');
      } else {
        document.getElementById('admin-login-modal').classList.add('hidden');
        document.getElementById('adminEmail').value = '';
        document.getElementById('adminPassword').value = '';
        localStorage.setItem('currentAppView', 'admin');
        showAdminView();
      }
    } catch (error) {
      let msg = "Email ou senha incorretos.";
      if (error.code === 'auth/unauthorized-domain') msg = `Bloqueado! Adicione este domínio no Firebase (Authentication -> Settings -> Authorized Domains).`;
      else if (error.code === 'auth/invalid-credential') msg = "E-mail ou senha incorretos.";
      showToast(msg, 'error', 6000);
    }
    finally { st.isLoggingInAsAdmin = false; btn.disabled = false; btn.textContent = 'Entrar'; }
  }

  // ===== Logout admin =====
  async function handleAdminLogout() {
    try {
      await auth.signOut();
      localStorage.setItem('currentAppView', 'user');
      showToast("Saindo do painel...", 'info');
      showUserView();
    } catch (error) { showToast("Erro ao fazer logout.", 'error'); }
  }

  // ===== Listener de estado de autenticacao + login anonimo =====
  function setupAuthStateListener() {
    if (!auth) return;
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        if (user.uid === APP_CONFIG.ADMIN_UID) {
          if (localStorage.getItem('currentAppView') === 'admin') showAdminView();
          else showUserView();
        } else { showUserView(); }
      } else {
        const st = S();
        if (!st.isLoggingInAsAdmin) {
          try {
            st.anonymousLoginPromise = auth.signInAnonymously();
            await st.anonymousLoginPromise;
          } catch (error) {
            console.error("Erro no login anônimo:", error);
            if (error.code === 'auth/unauthorized-domain') {
              showToast("Erro: O seu APK precisa ser autorizado no Firebase (Veja a documentação de domínios).", "error", 10000);
            }
          }
          finally { st.anonymousLoginPromise = null; }
        }
      }
    });
  }

  global.handleAdminLogin = handleAdminLogin;
  global.handleAdminLogout = handleAdminLogout;
  global.setupAuthStateListener = setupAuthStateListener;
})(window);