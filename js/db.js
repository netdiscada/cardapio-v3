// Cardapio Quatinga v2 - db.js
// Camada de dados Firestore. Facade que emula os helpers modulares do v1.x sobre a
// API compat (build classico) + funcoes de rotacao da semana e limpeza de pedidos.
// Carregado em 3o lugar no index.html. Escopo global via window.

(function (global) {
  const firebase = global.firebase;
  const { db } = global;

  // =====================================================================
  // FACADE — emula os helpers ES-module do v1.x sobre o build compat.
  // Assim o codigo de negocio permanece identico ao original.
  // =====================================================================
  function collection(dbRef, path) { return dbRef.collection(path); }
  function doc() {
    const first = arguments[0];
    if (arguments.length === 2) {
      // doc(db, "cardapio/semanal")  OU  doc(colRef, "id")
      // Se first tem .collection -> e um Database; senao e uma CollectionReference.
      const isDb = typeof first.collection === 'function' && typeof first.doc === 'function';
      // Ambos tem .doc; para db.doc(p) usa path; para colRef.doc(id) usa id.
      return first.doc(arguments[1]);
    }
    // doc(db, "col", "id")
    return first.collection(arguments[1]).doc(arguments[2]);
  }
  function addDoc(col, data) { return col.add(data); }
  function onSnapshot(ref, cb, errCb) { return ref.onSnapshot(cb, errCb); }
  function serverTimestamp() { return global.serverTimestamp(); }
  function where(field, op, val) { return { __fq: 'where', field: field, op: op, val: val }; }
  function orderBy(field, direction) { return { __fq: 'orderBy', field: field, direction: direction || 'asc' }; }
  function query(colOrRef) {
    let q = colOrRef;
    for (let i = 1; i < arguments.length; i++) {
      const c = arguments[i];
      if (c.__fq === 'where') q = q.where(c.field, c.op, c.val);
      else if (c.__fq === 'orderBy') q = q.orderBy(c.field, c.direction);
    }
    return q;
  }
  function getDoc(ref) { return ref.get(); }
  function getDocs(ref) { return ref.get(); }
  function setDoc(ref, data, opts) { return ref.set(data, opts); }
  function updateDoc(ref, data) { return ref.update(data); }
  function deleteDoc(ref) { return ref.delete(); }
  function writeBatch(d) { return d.batch(); }
  function runTransaction(d, fn) { return d.runTransaction(fn); }

  // expõe helpes para outros modulos
  global.fb = {
    collection: collection,
    doc: doc,
    addDoc: addDoc,
    onSnapshot: onSnapshot,
    serverTimestamp: serverTimestamp,
    where: where,
    orderBy: orderBy,
    query: query,
    getDoc: getDoc,
    getDocs: getDocs,
    setDoc: setDoc,
    updateDoc: updateDoc,
    deleteDoc: deleteDoc,
    writeBatch: writeBatch,
    runTransaction: runTransaction
  };

  // =====================================================================
  // ROTACAO DA SEMANA (port fiel do v1.x)
  // =====================================================================

  // autoTurnWeek: transacao read-write com lock + metadata.fromCache (v1.x)
  async function autoTurnWeek(menuData) {
    try {
      let isWinner = false;
      // Usamos uma transacao no servidor para garantir que so 1 pessoa (ou dispositivo)
      // consiga fazer a virada
      await runTransaction(db, async (transaction) => {
        const menuServerSnap = await transaction.get(global.getMenuDocRef());
        if (!menuServerSnap.exists) return;
        const serverData = menuServerSnap.data();
        // Verifica se a targetRotationDate ainda e valida no servidor.
        if (serverData.targetRotationDate && serverData.targetRotationDate === menuData.targetRotationDate) {
          transaction.set(global.getMenuDocRef(), {
            menuImageBase64: menuData.nextMenuImageBase64 || '',
            holidays: menuData.nextHolidays || [],
            nextMenuImageBase64: '',
            nextHolidays: [],
            targetRotationDate: null
          }, { merge: true });
          isWinner = true; // Confirma que ESSE celular obteve sucesso em virar a semana
        }
      });

      // Se outro dispositivo ja fez o trabalho, paramos aqui
      if (!isWinner) {
        console.log("A virada de semana já foi processada por outro cliente ou pelo servidor.");
        return;
      }

      const menuDocRef = global.getMenuDocRef();
      const batch = writeBatch(db);
      const ordersSnap = await getDocs(collection(db, "pedidosDaSemana"));
      ordersSnap.forEach(d => {
        const orderData = d.data();
        if (orderData.isNextWeek === true) batch.update(d.ref, { isNextWeek: false });
        else batch.delete(d.ref);
      });
      await batch.commit();
      showToast("A semana virou automaticamente!", "success");
    } catch (error) { console.warn("Automação em pausa.", error); }
  }

  // turnWeek: virada manual
  async function turnWeek() {
    const showCustomConfirm = global.showCustomConfirm;
    showCustomConfirm("Tem certeza? O cardápio e os pedidos da 'Próxima Semana' substituirão integralmente a 'Semana Atual'.", async () => {
      if (!global.auth.currentUser) return;
      const btn = document.getElementById('btn-turn-week');
      btn.disabled = true; btn.innerHTML = '⏳ Atualizando...';
      try {
        const menuDocRef = global.getMenuDocRef();
        const docSnap = await getDoc(menuDocRef);
        const data = docSnap.exists ? docSnap.data() : {};
        if (!data.nextMenuImageBase64) {
          showToast("Não há cardápio da próxima semana para iniciar.", "error");
          btn.disabled = false; btn.innerHTML = '🔄 Forçar Atualização de Semana'; return;
        }
        const batch = writeBatch(db);
        const ordersSnap = await getDocs(collection(db, "pedidosDaSemana"));
        ordersSnap.forEach(d => { if (d.data().isNextWeek === true) batch.update(d.ref, { isNextWeek: false }); else batch.delete(d.ref); });
        batch.set(menuDocRef, {
          menuImageBase64: data.nextMenuImageBase64,
          holidays: data.nextHolidays || [],
          nextMenuImageBase64: '',
          nextHolidays: [],
          targetRotationDate: null
        }, { merge: true });
        await batch.commit();
        showToast("Nova semana iniciada com sucesso!", "success");
        global.adminViewingNextWeek = false; loadAdminData();
      } catch (error) { showToast("Falha ao iniciar a semana.", "error"); }
      finally { btn.disabled = false; btn.innerHTML = '🔄 Forçar Atualização de Semana'; }
    });
  }

  // clearCurrentOrders: apaga todos os pedidos da semana atual (nao-next)
  async function clearCurrentOrders() {
    const showCustomConfirm = global.showCustomConfirm;
    showCustomConfirm("⚠️ Atenção: Isso vai APAGAR TODOS os pedidos cadastrados na Semana Atual. Deseja continuar?", async () => {
      if (!global.auth.currentUser) return;
      const snap = await getDocs(collection(db, "pedidosDaSemana"));
      const batch = writeBatch(db);
      snap.forEach(d => { if (!d.data().isNextWeek) batch.delete(d.ref); });
      await batch.commit();
      showToast("Pedidos apagados com sucesso.", "success");
    });
  }

  global.autoTurnWeek = autoTurnWeek;
  global.turnWeek = turnWeek;
  global.clearCurrentOrders = clearCurrentOrders;
})(window);