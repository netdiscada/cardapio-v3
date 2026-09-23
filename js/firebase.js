// Cardapio Quatinga v2 - firebase.js
// Inicializacao do Firebase (build compat v9/v10, equivalente funcional aos ES-modules
// do v1.x) com cache local offline multi-abas (habilitado por padrao no build compat).
// Carregado em 2o lugar no index.html (depois de config.js). Escopo global via window.

(function (global) {
  let app = null;
  let db = null;
  let auth = null;

  try {
    const config = global.firebaseConfig;
    app = global.firebase.initializeApp(config);
    // No build compat o Firestore ja vem com persistencia offline multi-abas habilitada
    // por padrao (equivalente ao persistentLocalCache + persistentMultipleTabManager do v1.x).
    db = global.firebase.firestore(app);
    auth = global.firebase.auth(app);
  } catch (error) {
    console.error("Erro ao inicializar Firebase: ", error);
    if (global.showToast) {
      global.showToast("Erro crítico de conexão: O app não conseguiu acessar o banco de dados.", 'error', 10000);
    }
  }

  global.app = app;
  global.db = db;
  global.auth = auth;

  global.serverTimestamp = function () {
    return global.firebase.firestore.FieldValue.serverTimestamp();
  };

  // Refs de dados (funcoes para acesso tardio, pois db pode ser nulo se a init falhar)
  global.getMenuDocRef = function () {
    return global.db.doc("cardapio/semanal");
  };
  global.getFuncionariosCollectionRef = function () {
    return global.db.collection("funcionarios");
  };
})(window);