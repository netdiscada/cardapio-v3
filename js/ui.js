// Cardapio Quatinga v3 - ui.js
// Helpers de UI: showToast, showCustomConfirm, dark-mode, wizard, holidays,
// showUserView/showAdminView/updateUserViewUI, renderOrdersTable, openEditOrderModal,
// renderOrderStatus, setAdminTab, handleImageLoad.
// Carregado em 5o lugar no index.html. Escopo global via window.

(function (global) {
  const fb = global.fb;
  const weekDays = global.weekDays;
  const mealOptions = global.mealOptions;
  const getDayId = global.getDayId;
  // Estado compartilhado (definido em app.js)
  const S = function () { return global.__state; };

  // ===== Sistema de Notificacoes (toast) =====
  function showToast(message, type = 'info', duration = 4000) {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'show';
    toast.classList.add(type);
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, duration);
  }

  // ===== Modal generico de confirmacao =====
  function showCustomConfirm(message, onConfirm) {
    const modal = document.getElementById('custom-confirm-modal');
    document.getElementById('custom-confirm-message').textContent = message;
    modal.classList.remove('hidden');
    document.getElementById('custom-confirm-ok-btn').onclick = () => {
      onConfirm();
      modal.classList.add('hidden');
    };
  }

  // ===== Dark mode =====
  const darkModeToggleBtn = document.getElementById('darkModeToggle');
  function updateDarkModeButton() {
    if (document.documentElement.classList.contains('dark')) { darkModeToggleBtn.innerHTML = '☀️ Modo Claro'; }
    else { darkModeToggleBtn.innerHTML = '🌙 Modo Noturno'; }
  }
  function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    if (document.documentElement.classList.contains('dark')) { localStorage.setItem('theme', 'dark'); }
    else { localStorage.setItem('theme', 'light'); }
    updateDarkModeButton();
  }

  // ===== Wizard do funcionario =====
  function renderWizardStep(index) {
    const st = S();
    const wizardContainer = document.getElementById('order-wizard-container');
    const submitBtnContainer = document.getElementById('submitButtonContainer');
    if (index >= weekDays.length) {
      wizardContainer.classList.add('hidden');
      submitBtnContainer.classList.remove('hidden');
      return;
    }
    wizardContainer.classList.remove('hidden');
    submitBtnContainer.classList.add('hidden');
    const day = weekDays[index];
    const dayId = getDayId(day);
    if (st.userActiveHolidays.includes(dayId)) {
      st.userChoices[index] = { day: day, choice: "FERIADO", notes: "" };
      st.currentDayIndex = index + 1;
      renderWizardStep(st.currentDayIndex);
      return;
    }
    document.getElementById('wizard-day-title').textContent = day;
    const optionsContainer = document.getElementById('wizard-options');
    optionsContainer.innerHTML = '';
    mealOptions.forEach(opt => {
      optionsContainer.innerHTML += `<button data-value="${opt.name}" class="wizard-btn text-left p-2 border-2 border-gray-200 dark:border-slate-700 hover:border-orange-500 dark:hover:border-orange-400 dark:bg-slate-800/50 rounded-lg"><div class="flex items-center"><span class="text-xl mr-2">${opt.emoji}</span><div><p class="font-bold text-gray-800 dark:text-slate-200 text-sm leading-tight">${opt.name}</p><p class="text-xs font-medium text-gray-500 dark:text-slate-400">${opt.description}</p></div></div></button>`;
    });
    document.getElementById('wizard-notes').value = '';
    updateWizardProgress(index);
    wizardContainer.classList.add('fade-in');
    setTimeout(() => wizardContainer.classList.remove('fade-in'), 300);
  }

  function updateWizardProgress(index) {
    const progressContainer = document.getElementById('wizard-progress');
    progressContainer.innerHTML = '';
    for (let i = 0; i < weekDays.length; i++) {
      const dotClass = i < index ? 'bg-orange-500' : (i === index ? 'bg-orange-300' : 'bg-gray-300 dark:bg-zinc-700');
      progressContainer.innerHTML += `<div class="w-2.5 h-2.5 rounded-full ${dotClass} transition-colors"></div>`;
    }
  }

  // ===== Feriados (legado - checkboxes) =====
  function renderHolidayCheckboxes() {
    const st = S();
    const container = document.getElementById('holiday-selector');
    if (!container) return;
    container.innerHTML = '';
    const savedNextHolidays = st.currentMenuData.nextHolidays || [];
    weekDays.forEach(day => {
      const dayId = getDayId(day);
      const isChecked = savedNextHolidays.includes(dayId) ? 'checked' : '';
      container.innerHTML += `<label class="flex items-center space-x-2 cursor-pointer select-none bg-white dark:bg-slate-800 p-2 rounded shadow-sm border border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition"><input type="checkbox" value="${dayId}" class="holiday-checkbox w-5 h-5 text-orange-500 rounded focus:ring-orange-500" ${isChecked}><span class="text-gray-700 dark:text-slate-300 font-bold">${day}</span></label>`;
    });
  }

  // ===== Troca de views (user / admin) =====
  async function showUserView() {
    const st = S();
    if (st.adminUnsubscribe) { st.adminUnsubscribe(); st.adminUnsubscribe = null; }
    st.allOrders = [];
    const containerOrders = document.getElementById('ordersTableContainer');
    if (containerOrders) containerOrders.innerHTML = '<p class="text-gray-500 font-medium">A carregar pedidos...</p>';
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('admin-login-modal').classList.add('hidden');
    document.getElementById('user-view').classList.remove('hidden');
    // v3.2: bottom bar do funcionario visivel apenas na visao de usuario
    document.body.classList.add('show-user-tabs');
    const rgfInput = document.getElementById('employeeRGF');
    if (!rgfInput.value && localStorage.getItem('employeeRGF')) { rgfInput.value = localStorage.getItem('employeeRGF'); }
    if (rgfInput.value) { await global.findEmployeeByRGF(rgfInput.value); }
    global.loadAndDisplayMenu();
  }

  function showAdminView() {
    const st = S();
    document.getElementById('user-view').classList.add('hidden');
    document.getElementById('admin-view').classList.remove('hidden');
    // v3.2: esconde a bottom bar do funcionario
    document.body.classList.remove('show-user-tabs');
    document.getElementById('admin-login-modal').classList.add('hidden');
    localStorage.setItem('currentAppView', 'admin');
    // Foca na Proxima Semana se ela ja existir na hora de abrir o painel
    setAdminTab(!!st.currentMenuData.nextMenuImageBase64);
    global.loadAndDisplayMenu();
    global.loadAndRenderEmployees();
  }

  // ===== Abas admin (semana atual / proxima) =====
  function setAdminTab(isNextWeek) {
    const st = S();
    st.adminViewingNextWeek = isNextWeek;
    const curBtn = document.getElementById('admin-view-current');
    const nextBtn = document.getElementById('admin-view-next');
    if (isNextWeek) {
      nextBtn.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-orange-600', 'dark:text-orange-400');
      nextBtn.classList.remove('text-gray-600', 'dark:text-slate-400', 'hover:bg-gray-200', 'dark:hover:bg-slate-700');
      curBtn.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-orange-600', 'dark:text-orange-400');
      curBtn.classList.add('text-gray-600', 'dark:text-slate-400', 'hover:bg-gray-200', 'dark:hover:bg-slate-700');
    } else {
      curBtn.classList.add('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-orange-600', 'dark:text-orange-400');
      curBtn.classList.remove('text-gray-600', 'dark:text-slate-400', 'hover:bg-gray-200', 'dark:hover:bg-slate-700');
      nextBtn.classList.remove('bg-white', 'dark:bg-slate-700', 'shadow-sm', 'text-orange-600', 'dark:text-orange-400');
      nextBtn.classList.add('text-gray-600', 'dark:text-slate-400', 'hover:bg-gray-200', 'dark:hover:bg-slate-700');
    }
    global.loadAdminData();
  }

  // ===== Tabela de pedidos =====
  function renderOrdersTable(orders) {
    const container = document.getElementById('ordersTableContainer');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filteredOrders = orders.filter(doc => doc.data().employeeName.toLowerCase().includes(searchTerm));
    if (filteredOrders.length === 0) { container.innerHTML = '<p class="text-gray-500 font-medium text-center py-4">Nenhum pedido encontrado nesta seleção.</p>'; return; }
    let tableHTML = `<table class="min-w-full bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg overflow-hidden"><thead><tr class="bg-gray-50 dark:bg-slate-800/80"><th class="py-2 px-3 border-b dark:border-slate-600 text-left text-gray-700 dark:text-slate-300 font-bold">Funcionário</th><th class="py-2 px-3 border-b dark:border-slate-600 text-left text-gray-700 dark:text-slate-300 font-bold">RGF</th>`;
    weekDays.forEach(item => tableHTML += `<th class="py-2 px-3 border-b dark:border-slate-600 text-left text-gray-700 dark:text-slate-300 font-bold">${item.substring(0, 3)}</th>`);
    tableHTML += `<th class="py-2 px-3 border-b dark:border-slate-600 text-left text-gray-700 dark:text-slate-300 font-bold">Ações</th></tr></thead><tbody>`;
    filteredOrders.forEach(doc => {
      const order = doc.data();
      tableHTML += `<tr><td class="py-2 px-3 border-b dark:border-slate-600 font-bold text-gray-800 dark:text-slate-200">${order.employeeName}</td><td class="py-2 px-3 border-b dark:border-slate-600 font-medium text-gray-600 dark:text-slate-400">${order.employeeRGF || 'N/A'}</td>`;
      weekDays.forEach(day => {
        const dayId = getDayId(day);
        let choice = order[dayId] || 'N/A';
        const notes = order[`${dayId}_notes`];
        if (choice === 'FERIADO') {
          tableHTML += `<td class="py-2 px-3 border-b dark:border-slate-600 bg-gray-100 dark:bg-slate-800/50 text-gray-400 dark:text-slate-500 text-xs font-bold text-center">FERIADO</td>`;
        } else {
          let cellContent = choice;
          if (notes) cellContent += ` <span title="${notes}" class="cursor-help text-orange-500 font-bold">*</span>`;
          tableHTML += `<td class="py-2 px-3 border-b dark:border-slate-600 font-medium text-gray-700 dark:text-slate-300">${cellContent}</td>`;
        }
      });
      tableHTML += `<td class="py-2 px-3 border-b dark:border-slate-600 space-x-2 whitespace-nowrap"><button data-id="${doc.id}" class="edit-order-btn text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 text-sm font-bold transition-colors">Editar</button><button data-id="${doc.id}" data-name="${order.employeeName}" class="delete-order-btn text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-bold transition-colors">Excluir</button></td></tr>`;
    });
    tableHTML += `</tbody></table>`;
    container.innerHTML = tableHTML;
  }

  // ===== Status de pedidos (ja pediram / nao pediram) =====
  async function renderOrderStatus(orders) {
    const container = document.getElementById('order-status-container');
    container.innerHTML = '<p class="text-gray-500 font-medium">A processar...</p>';
    try {
      const employeeSnapshot = await fb.getDocs(fb.query(global.getFuncionariosCollectionRef(), fb.orderBy("nome")));
      const allEmployees = employeeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const orderedRGFs = new Set(orders.map(orderDoc => orderDoc.data().employeeRGF));
      const haveOrdered = allEmployees.filter(emp => orderedRGFs.has(emp.id));
      const haveNotOrdered = allEmployees.filter(emp => !orderedRGFs.has(emp.id));
      let html = `<div><h3 class="font-bold text-lg text-emerald-600 dark:text-emerald-400 mb-2">✅ Já Pediram (${haveOrdered.length})</h3><ul class="space-y-1 text-sm font-semibold">${haveOrdered.map(e => `<li class="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 rounded-md border border-emerald-100 dark:border-emerald-800/30">${e.nome}</li>`).join('') || '<li class="text-gray-500 font-medium">Ninguém fez pedido ainda.</li>'}</ul></div><div><h3 class="font-bold text-lg text-red-600 dark:text-red-400 mb-2">❌ Ainda Não Pediram (${haveNotOrdered.length})</h3><ul class="space-y-1 text-sm font-semibold">${haveNotOrdered.map(e => `<li class="p-2 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded-md border border-red-100 dark:border-red-800/30">${e.nome}</li>`).join('') || '<li class="text-gray-500 font-medium">Todos os funcionários fizeram pedido!</li>'}</ul></div>`;
      container.innerHTML = html;
    } catch (error) { container.innerHTML = '<p class="text-red-500 font-bold">Falha ao carregar status.</p>'; }
  }

  // ===== Editar pedido (modal) =====
  function openEditOrderModal(orderId) {
    const st = S();
    const orderDoc = st.allOrders.find(d => d.id === orderId);
    if (!orderDoc) return;
    const order = orderDoc.data();
    document.getElementById('edit-order-id').value = orderId;
    document.getElementById('edit-order-employeeName').value = order.employeeName;
    const optionsContainer = document.getElementById('edit-menu-options');
    optionsContainer.innerHTML = '';
    const editHolidays = st.adminViewingNextWeek ? (st.currentMenuData.nextHolidays || []) : (st.currentMenuData.holidays || []);
    weekDays.forEach(day => {
      const dayId = getDayId(day);
      if (editHolidays.includes(dayId)) return;
      const currentChoice = order[dayId] || '';
      const currentNotes = order[`${dayId}_notes`] || '';
      let selectHTML = `<select id="edit-choice-${dayId}" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg mb-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 font-medium"><option value="">(Nenhuma opção selecionada)</option>${mealOptions.map(opt => `<option value="${opt.name}" ${currentChoice === opt.name ? 'selected' : ''}>${opt.name}</option>`).join('')}</select>`;
      optionsContainer.innerHTML += `<div class="p-3 border rounded-lg bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700"><label class="block font-bold text-gray-700 dark:text-slate-300 mb-2">${day}</label>${selectHTML}<input type="text" id="edit-notes-${dayId}" value="${currentNotes}" placeholder="Anotações (ex: sem cebola)" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 dark:text-slate-100 font-medium"></div>`;
    });
    document.getElementById('edit-order-modal').classList.remove('hidden');
  }

  // ===== Atualiza a view do usuario (imagem + badge de semana) =====
  function updateUserViewUI() {
    const st = S();
    const badgeText = document.getElementById('week-badge-text');
    const badgeContainer = document.getElementById('week-badge-indicator');

    if (badgeText && badgeContainer) {
      if (st.viewingNextWeek) {
        badgeText.textContent = 'Cardápio Antecipado (Próxima Semana)';
        badgeContainer.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mt-2 shadow-sm bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 transition-colors';
        st.weeklyMenu.menuImageBase64 = st.currentMenuData.nextMenuImageBase64;
        st.userActiveHolidays = st.currentMenuData.nextHolidays || [];
      } else {
        badgeText.textContent = 'Cardápio da Semana Atual';
        badgeContainer.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mt-2 shadow-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 transition-colors';
        st.weeklyMenu.menuImageBase64 = st.currentMenuData.menuImageBase64;
        st.userActiveHolidays = st.currentMenuData.holidays || [];
      }
    }

    const menuImage = document.getElementById('menu-image');
    const menuLoading = document.getElementById('menu-image-loading');
    let imageChanged = null;

    if (menuImage) {
      if (st.weeklyMenu.menuImageBase64) {
        imageChanged = menuImage.src !== st.weeklyMenu.menuImageBase64;
        menuImage.classList.add('opacity-0');
        menuLoading.classList.remove('hidden');
        if (imageChanged) {
          menuImage.src = st.weeklyMenu.menuImageBase64;
        } else {
          setTimeout(global.handleImageLoad, 50);
        }
        // v3.1: só reinicia a seleção se o cardápio realmente mudou.
        // Snapshot sem mudança de imagem NÃO pode apagar/reexibir as escolhas.
        if (imageChanged || st.userChoices.length === 0) {
          st.currentDayIndex = 0;
          st.userChoices = [];
          // O wizard fica OCULTO aqui; validateForm()/checkExistingOrder()
          // só o exibem depois de confirmar que não há pedido existente.
          // (elimina o "flash" da seleção reaparecendo por segundos)
          const wizardContainer = document.getElementById('order-wizard-container');
          if (wizardContainer) wizardContainer.classList.add('hidden');
        }
      } else {
        menuImage.src = '';
        menuLoading.classList.add('hidden');
      }
    }
    if (imageChanged !== null) st.menuImageChanged = imageChanged;
    validateForm();
  }

  function handleImageLoad() {
    const img = document.getElementById('menu-image');
    const loading = document.getElementById('menu-image-loading');
    if (img && img.src && img.src !== window.location.href) {
      img.classList.remove('opacity-0');
      if (loading) loading.classList.add('hidden');
    }
  }

  global.showToast = showToast;
  global.showCustomConfirm = showCustomConfirm;
  global.updateDarkModeButton = updateDarkModeButton;
  global.toggleDarkMode = toggleDarkMode;
  global.renderWizardStep = renderWizardStep;
  global.updateWizardProgress = updateWizardProgress;
  global.renderHolidayCheckboxes = renderHolidayCheckboxes;
  global.showUserView = showUserView;
  global.showAdminView = showAdminView;
  global.setAdminTab = setAdminTab;
  global.renderOrdersTable = renderOrdersTable;
  global.renderOrderStatus = renderOrderStatus;
  global.openEditOrderModal = openEditOrderModal;
  global.updateUserViewUI = updateUserViewUI;
  global.handleImageLoad = handleImageLoad;
})(window);