// Cardapio Quatinga v2 - order.js
// Fluxo do funcionario: findEmployeeByRGF, displayExistingOrder, checkExistingOrder,
// handleWizardSelection, validateForm, openConfirmationModal, submitOrder.
// Carregado em 6o lugar no index.html. Escopo global via window.

(function (global) {
  const fb = global.fb;
  const auth = global.auth;
  const weekDays = global.weekDays;
  const getDayId = global.getDayId;
  const S = function () { return global.__state; };

  // ===== Busca funcionario por RGF (com autofill do nome) =====
  async function findEmployeeByRGF(rgf) {
    const nameInput = document.getElementById('employeeName');
    if (!rgf || !auth.currentUser) { nameInput.value = ''; nameInput.placeholder = 'Preenchido automaticamente'; return false; }
    try {
      const docSnap = await fb.getDoc(fb.doc(global.db, "funcionarios", rgf));
      if (docSnap.exists) {
        nameInput.value = docSnap.data().nome;
        nameInput.placeholder = 'Preenchido automaticamente';
        return true;
      } else {
        nameInput.value = '';
        nameInput.placeholder = 'RGF não encontrado';
        return false;
      }
    } catch (error) {
      nameInput.value = '';
      nameInput.placeholder = 'Erro';
      return false;
    }
  }

  // ===== Mostra pedido existente =====
  function displayExistingOrder(orderData) {
    const st = S();
    const detailsContainer = document.getElementById('existing-order-details');
    detailsContainer.innerHTML = '';
    document.getElementById('existing-order-title').textContent = st.viewingNextWeek ? "Pedido da Próxima Semana Registado!" : "Pedido Registado!";
    weekDays.forEach(day => {
      const dayId = getDayId(day);
      const choice = orderData[dayId];
      const notes = orderData[`${dayId}_notes`];
      if (choice) {
        let displayChoice = choice === 'FERIADO' ? '🏖️ FERIADO (Sem Pedido)' : `🍽️ ${choice}`;
        let notesHtml = notes ? `<span class="text-sm text-gray-500 italic block sm:inline mt-1 sm:mt-0 sm:ml-2">(${notes})</span>` : '';
        let styleClass = choice === 'FERIADO' ? 'bg-gray-50 dark:bg-zinc-800/50 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-zinc-700' : 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800/50';
        detailsContainer.innerHTML += `<div class="p-4 rounded-xl border ${styleClass} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 transition-all hover:shadow-md"><span class="font-bold w-full sm:w-1/3">${day}</span><div class="w-full sm:w-2/3 text-left sm:text-right font-medium">${displayChoice} ${notesHtml}</div></div>`;
      }
    });
  }

  // ===== Verifica se ja existe pedido do funcionario =====
  async function checkExistingOrder(rgf) {
    const st = S();
    if (!rgf || !auth.currentUser) return;
    try {
      const q = fb.query(fb.collection(global.db, "pedidosDaSemana"), fb.where("employeeRGF", "==", rgf));
      const snapshot = await fb.getDocs(q);
      const wizardContainer = document.getElementById('order-wizard-container');
      const existingContainer = document.getElementById('existing-order-container');
      const submitBtnContainer = document.getElementById('submitButtonContainer');
      const publicReportBtnContainer = document.getElementById('publicReportButtonContainer');
      let latestOrder = null;
      let latestTime = 0;
      if (!snapshot.empty) {
        snapshot.forEach(doc => {
          const data = doc.data();
          const isNext = !!data.isNextWeek;
          if (isNext === st.viewingNextWeek) {
            const time = data.timestamp ? data.timestamp.toMillis() : 0;
            if (time >= latestTime) { latestTime = time; latestOrder = data; }
          }
        });
      }
      if (latestOrder) {
        displayExistingOrder(latestOrder);
        wizardContainer.classList.add('hidden');
        submitBtnContainer.classList.add('hidden');
        existingContainer.classList.remove('hidden');
        publicReportBtnContainer.classList.remove('hidden');
        return;
      }
      existingContainer.classList.add('hidden');
      publicReportBtnContainer.classList.add('hidden');
      // v3.1: se a imagem do cardápio não mudou e o usuário já está escolhendo,
      // NÃO zera as escolhas nem volta pro passo 0 (fix do bug visual).
      const stImgChanged = st.menuImageChanged;
      if (stImgChanged || st.userChoices.length === 0) {
        st.currentDayIndex = 0;
        st.userChoices = [];
      }
      renderWizardStep(st.currentDayIndex);
      wizardContainer.classList.remove('hidden');
      submitBtnContainer.classList.add('hidden');
    } catch (error) { console.error(error); }
  }

  // ===== Selecao no wizard =====
  function handleWizardSelection(event) {
    const st = S();
    const choiceBtn = event.target.closest('.wizard-btn');
    if (!choiceBtn) return;
    st.userChoices[st.currentDayIndex] = {
      day: weekDays[st.currentDayIndex],
      choice: choiceBtn.dataset.value,
      notes: document.getElementById('wizard-notes').value.trim()
    };
    st.currentDayIndex++;
    renderWizardStep(st.currentDayIndex);
  }

  // ===== Valida formulario e decide o que mostrar =====
  async function validateForm() {
    const st = S();
    if (!auth.currentUser) return;
    const nameInput = document.getElementById('employeeName');
    const rgfInput = document.getElementById('employeeRGF');
    const name = nameInput?.value.trim();
    const rgf = rgfInput?.value.trim();
    const guidanceSection = document.getElementById('guidanceSection');
    const orderSection = document.getElementById('order-section');
    const publicReportBtnContainer = document.getElementById('publicReportButtonContainer');
    const isValidUser = name && rgf;

    if (isValidUser && !st.autoSwitchDone && st.currentMenuData.nextMenuImageBase64) {
      try {
        const q = fb.query(fb.collection(global.db, "pedidosDaSemana"), fb.where("employeeRGF", "==", rgf));
        const snap = await fb.getDocs(q);
        let hasNextOrder = false;
        snap.forEach(doc => { if (doc.data().isNextWeek === true) hasNextOrder = true; });
        if (!hasNextOrder) {
          st.viewingNextWeek = true;
          st.autoSwitchDone = true;
          updateUserViewUI();
          return;
        } else { st.autoSwitchDone = true; }
      } catch (err) { st.autoSwitchDone = true; }
    }

    if (st.weeklyMenu.menuImageBase64) {
      if (!isValidUser) {
        orderSection.classList.add('hidden');
        publicReportBtnContainer.classList.add('hidden');
        guidanceSection.classList.remove('hidden');
        document.getElementById('guidanceText').textContent = 'Por favor, insira o seu RGF para começar.';
      } else {
        guidanceSection.classList.add('hidden');
        orderSection.classList.remove('hidden');
        await checkExistingOrder(rgf);
        if (document.activeElement === rgfInput) {
          setTimeout(() => { document.getElementById('order-section').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
        }
      }
    } else {
      orderSection.classList.add('hidden');
      publicReportBtnContainer.classList.add('hidden');
      guidanceSection.classList.remove('hidden');
      document.getElementById('guidanceText').textContent = 'Nenhum cardápio disponível para a seleção atual.';
    }
  }

  // ===== Modal de confirmacao do pedido =====
  function openConfirmationModal() {
    const st = S();
    st.tempOrderData = {
      employeeName: document.getElementById('employeeName').value.trim(),
      employeeRGF: document.getElementById('employeeRGF').value.trim(),
      timestamp: fb.serverTimestamp()
    };
    const summaryContainer = document.getElementById('confirmation-summary');
    summaryContainer.innerHTML = '';
    st.userChoices.forEach(item => {
      const dayId = getDayId(item.day);
      st.tempOrderData[dayId] = item.choice;
      if (item.notes) st.tempOrderData[`${dayId}_notes`] = item.notes;
      const displayChoice = item.choice === 'FERIADO' ? '🏖️ FERIADO (Sem Pedido)' : item.choice;
      const styleClass = item.choice === 'FERIADO' ? 'text-gray-400 italic' : 'text-gray-800 dark:text-gray-200';
      summaryContainer.innerHTML += `<p class="${styleClass}"><span class="font-bold">${item.day}:</span> ${displayChoice} ${item.notes ? `<span class="text-sm text-gray-500 italic">(${item.notes})</span>` : ''}</p>`;
    });
    document.getElementById('confirmation-modal').classList.remove('hidden');
  }

  // ===== Envia pedido =====
  async function submitOrder() {
    const st = S();
    if (!auth.currentUser) return;
    const button = document.getElementById('submitOrder');
    button.disabled = true; button.textContent = navigator.onLine ? 'A enviar...' : 'Salvando offline...';
    try {
      st.tempOrderData.isNextWeek = st.viewingNextWeek;
      // O Firebase salva localmente de forma sincrona.
      const orderPromise = fb.addDoc(fb.collection(global.db, "pedidosDaSemana"), st.tempOrderData);
      document.getElementById('confirmation-modal').classList.add('hidden');
      document.getElementById('form-container').classList.add('hidden');
      document.getElementById('success-message').classList.remove('hidden');
      if (navigator.onLine) {
        await orderPromise;
        document.getElementById('success-text').textContent = `Obrigado, ${st.tempOrderData.employeeName}. O seu pedido foi registado com sucesso.`;
        showToast("Pedido enviado com sucesso!", 'success');
      } else {
        document.getElementById('success-text').textContent = `Obrigado, ${st.tempOrderData.employeeName}. O seu pedido foi salvo no celular e será enviado automaticamente assim que houver internet.`;
        showToast("Salvo offline!", 'info');
      }
    } catch (error) {
      showToast("Erro ao processar pedido.", 'error');
    } finally {
      button.disabled = false; button.textContent = 'Confirmar e Enviar';
    }
  }

  global.findEmployeeByRGF = findEmployeeByRGF;
  global.displayExistingOrder = displayExistingOrder;
  global.checkExistingOrder = checkExistingOrder;
  global.handleWizardSelection = handleWizardSelection;
  global.validateForm = validateForm;
  global.openConfirmationModal = openConfirmationModal;
  global.submitOrder = submitOrder;
})(window);