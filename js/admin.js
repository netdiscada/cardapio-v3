// Cardapio Quatinga v3 - admin.js
// Painel admin: loadAndDisplayMenu, loadAdminData, upload/cropper de imagem
// (cropperjs + browser-image-compression), CRUD de employees, geracao de PDF
// (jsPDF + autotable), WhatsApp, delete de pedido, relatorio publico.
// Carregado em 7o lugar no index.html. Escopo global via window.

(function (global) {
  const fb = global.fb;
  const auth = global.auth;
  const weekDays = global.weekDays;
  const mealOptions = global.mealOptions;
  const getDayId = global.getDayId;
  const db = global.db;
  const S = function () { return global.__state; };

  // ===== Carrega e escuta o cardapio (menuDocRef) =====
  function loadAndDisplayMenu() {
    const st = S();
    if (!auth.currentUser) return;
    if (st.menuUnsubscribe) st.menuUnsubscribe();

    st.menuUnsubscribe = fb.onSnapshot(global.getMenuDocRef(), async (docSnap) => {
      const hadNextWeek = !!st.currentMenuData.nextMenuImageBase64;
      st.currentMenuData = (docSnap.exists && docSnap.data()) ? docSnap.data() : { menuImageBase64: '', holidays: [], nextMenuImageBase64: '', nextHolidays: [], targetRotationDate: null };
      const hasNextWeek = !!st.currentMenuData.nextMenuImageBase64;

      // Transicao automatica no Painel ADM se houver Proxima Semana
      if (localStorage.getItem('currentAppView') === 'admin') {
        if (!hadNextWeek && hasNextWeek) { setAdminTab(true); }
        else if (hadNextWeek && !hasNextWeek) { setAdminTab(false); }
      }

      if (st.currentMenuData.targetRotationDate && Date.now() >= st.currentMenuData.targetRotationDate) {
        // NOVA TRAVA: Só executa a virada automática se realmente houver um cardápio da próxima semana
        if (!st.currentMenuData.nextMenuImageBase64) {
          console.log("Virada cancelada: Não há imagem/cardápio da próxima semana programado.");
          return;
        }
        // Checagem segura contra condicao de corrida e cache offline destrutivo
        if (!docSnap.metadata.fromCache && navigator.onLine) {
          if (!st.isRotatingWeekLock) {
            st.isRotatingWeekLock = true;
            global.autoTurnWeek(st.currentMenuData).finally(() => { st.isRotatingWeekLock = false; });
          }
        }
        return;
      }

      const toggleContainer = document.getElementById('week-toggle-container');
      const deleteNextWeekBtn = document.getElementById('deleteNextWeekBtn');
      if (st.currentMenuData.nextMenuImageBase64) {
        if (toggleContainer) toggleContainer.classList.remove('hidden');
        if (deleteNextWeekBtn) deleteNextWeekBtn.classList.remove('hidden');
      } else {
        if (toggleContainer) toggleContainer.classList.add('hidden');
        if (deleteNextWeekBtn) deleteNextWeekBtn.classList.add('hidden');
        st.viewingNextWeek = false;
      }

      const currentImg = document.getElementById('admin-current-image');
      const currentStatus = document.getElementById('admin-current-status');
      const scheduledDateSpan = document.getElementById('scheduled-date');

      if (currentImg && currentStatus) {
        if (st.currentMenuData.menuImageBase64) {
          currentImg.src = st.currentMenuData.menuImageBase64;
          currentImg.classList.remove('hidden');
          currentStatus.textContent = "Cardápio atual está ativo.";
        } else {
          currentImg.classList.add('hidden');
          currentStatus.textContent = "Nenhum cardápio ativo no momento.";
        }
      }

      if (scheduledDateSpan) {
        if (st.currentMenuData.targetRotationDate) {
          const d = new Date(st.currentMenuData.targetRotationDate);
          scheduledDateSpan.textContent = `(Dia ${d.toLocaleDateString('pt-BR')})`;
        } else { scheduledDateSpan.textContent = ''; }
      }

      // Renderiza checkboxes de feriados (para compatibilidade com código legado)
      renderHolidayCheckboxes();
      
      // Renderiza calendário interativo de feriados (NOVO v3)
      renderHolidayCalendar();

      global.updateUserViewUI();
    }, (error) => { showToast("Erro ao carregar o cardápio.", 'error'); });
  }

  // ===== Carrega dados admin (pedidos, com abas semana ativa/proxima) =====
  function loadAdminData() {
    const st = S();
    if (!auth.currentUser) return;
    if (st.adminUnsubscribe) st.adminUnsubscribe();

    document.getElementById('status-section-title').textContent = st.adminViewingNextWeek ? "📊 Status de Pedidos (Próxima Semana)" : "📊 Status de Pedidos (Esta Semana)";

    st.adminUnsubscribe = fb.onSnapshot(fb.collection(db, "pedidosDaSemana"), (snapshot) => {
      const latestCurrentOrdersMap = new Map();
      const latestNextOrdersMap = new Map();
      snapshot.forEach(doc => {
        const orderData = doc.data();
        if (orderData.employeeRGF) {
          const timestamp = orderData.timestamp ? orderData.timestamp.toMillis() : 0;
          if (orderData.isNextWeek === true) {
            if (!latestNextOrdersMap.has(orderData.employeeRGF) || timestamp > latestNextOrdersMap.get(orderData.employeeRGF).timestamp) {
              latestNextOrdersMap.set(orderData.employeeRGF, { doc: doc, timestamp: timestamp });
            }
          } else {
            if (!latestCurrentOrdersMap.has(orderData.employeeRGF) || timestamp > latestCurrentOrdersMap.get(orderData.employeeRGF).timestamp) {
              latestCurrentOrdersMap.set(orderData.employeeRGF, { doc: doc, timestamp: timestamp });
            }
          }
        }
      });
      const targetMap = st.adminViewingNextWeek ? latestNextOrdersMap : latestCurrentOrdersMap;
      st.allOrders = Array.from(targetMap.values()).map(item => item.doc).sort((a, b) => a.data().employeeName.localeCompare(b.data().employeeName));
      renderOrdersTable(st.allOrders);
      renderOrderStatus(st.allOrders);
      updateOrdersBadge(st.allOrders.length);
    }, (error) => { showToast("Erro ao carregar dados.", 'error'); });
  }

  // ===== v3.2: Badge de contagem de pedidos na aba Pedidos =====
  function updateOrdersBadge(count) {
    const badge = document.getElementById('ordersBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // ===== CRUD de Funcionarios =====
  async function loadAndRenderEmployees() {
    if (!auth.currentUser) return;
    const container = document.getElementById('employee-list-container');
    try {
      const q = fb.query(global.getFuncionariosCollectionRef(), fb.orderBy("nome"));
      const snapshot = await fb.getDocs(q);
      if (snapshot.empty) {
        container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-4 font-medium">Nenhum funcionário cadastrado.</p>';
        return;
      }
      let tableHTML = `<table class="min-w-full bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-lg overflow-hidden"><thead><tr class="bg-gray-50 dark:bg-zinc-800/80"><th class="py-2 px-3 border-b dark:border-zinc-700 text-left text-gray-700 dark:text-gray-300 font-bold">RGF</th><th class="py-2 px-3 border-b dark:border-zinc-700 text-left text-gray-700 dark:text-gray-300 font-bold">Nome</th><th class="py-2 px-3 border-b dark:border-zinc-700 text-left text-gray-700 dark:text-gray-300 font-bold">Ações</th></tr></thead><tbody>`;
      snapshot.forEach(doc => {
        const employee = doc.data();
        tableHTML += `<tr><td class="py-2 px-3 border-b dark:border-zinc-800 font-mono font-medium text-gray-800 dark:text-gray-200">${doc.id}</td><td class="py-2 px-3 border-b dark:border-zinc-800 font-bold text-gray-800 dark:text-gray-200">${employee.nome}</td><td class="py-2 px-3 border-b dark:border-zinc-800 space-x-2"><button data-id="${doc.id}" data-name="${employee.nome}" class="edit-employee-btn text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-bold transition-colors">Editar</button><button data-id="${doc.id}" data-name="${employee.nome}" class="delete-employee-btn text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-bold transition-colors">Excluir</button></td></tr>`;
      });
      tableHTML += '</tbody></table>';
      container.innerHTML = tableHTML;
    } catch (error) {
      console.error("Erro:", error);
      container.innerHTML = `<p class="text-center text-red-500 font-bold">Falha ao carregar funcionários.</p>`;
    }
  }

  async function handleAddEmployee(e) {
    e.preventDefault();
    if (!auth.currentUser) return;
    const rgfInput = document.getElementById('newEmployeeRGF');
    const nameInput = document.getElementById('newEmployeeName');
    const rgf = rgfInput.value.trim();
    const nome = nameInput.value.trim();
    if (!rgf || !nome) { showToast("Preencha o RGF e o Nome.", 'error'); return; }
    try {
      await fb.setDoc(fb.doc(db, "funcionarios", rgf), { nome });
      showToast("Funcionário adicionado!", 'success');
      rgfInput.value = '';
      nameInput.value = '';
      loadAndRenderEmployees();
    } catch (error) { showToast("Erro ao adicionar.", 'error'); }
  }

  function handleDeleteEmployee(rgf, name) {
    showCustomConfirm(`Tem a certeza que deseja excluir ${name}?`, async () => {
      if (!auth.currentUser) return;
      try {
        await fb.deleteDoc(fb.doc(db, "funcionarios", rgf));
        showToast("Excluído.", 'success');
        loadAndRenderEmployees();
      } catch (error) {
        showToast("Falha ao excluir.", 'error');
      }
    });
  }

  function openEmployeeEditModal(rgf, nome) {
    document.getElementById('editEmployeeRGF').value = rgf;
    document.getElementById('editEmployeeName').value = nome;
    document.getElementById('edit-employee-modal').classList.remove('hidden');
  }

  async function handleSaveEmployeeChanges(e) {
    e.preventDefault();
    if (!auth.currentUser) return;
    const rgf = document.getElementById('editEmployeeRGF').value;
    const newName = document.getElementById('editEmployeeName').value.trim();
    if (!newName) return;
    try {
      await fb.updateDoc(fb.doc(db, "funcionarios", rgf), { nome: newName });
      showToast("Atualizado!", 'success');
      document.getElementById('edit-employee-modal').classList.add('hidden');
      loadAndRenderEmployees();
    } catch (error) { showToast("Falha ao salvar.", 'error'); }
  }

  // ===== Delete de pedido =====
  function handleDeleteOrder(orderId, employeeName) {
    showCustomConfirm(`Deseja excluir o pedido de ${employeeName}?`, async () => {
      if (!auth.currentUser) return;
      try {
        await fb.deleteDoc(fb.collection(db, "pedidosDaSemana").doc(orderId));
        showToast("Pedido excluído!", 'success');
      } catch (error) { showToast("Erro ao excluir.", 'error'); }
    });
  }

  // ===== Relatorio publico (modal pre-visualizacao) =====
  async function openPublicReportModal() {
    const st = S();
    if (!auth.currentUser) return;
    const container = document.getElementById('public-report-content');
    container.innerHTML = '<p class="text-center text-gray-500 font-medium py-10">A carregar os dados da semana...</p>';
    document.getElementById('public-report-modal').classList.remove('hidden');
    try {
      const q = fb.query(fb.collection(db, "pedidosDaSemana"), fb.where("isNextWeek", "==", st.viewingNextWeek));
      const snapshot = await fb.getDocs(q);
      const latestOrdersMap = new Map();
      snapshot.forEach(doc => {
        const orderData = doc.data();
        if (orderData.employeeRGF) {
          const timestamp = orderData.timestamp ? orderData.timestamp.toMillis() : 0;
          if (!latestOrdersMap.has(orderData.employeeRGF) || timestamp > latestOrdersMap.get(orderData.employeeRGF).timestamp) {
            latestOrdersMap.set(orderData.employeeRGF, { doc: doc, timestamp: timestamp });
          }
        }
      });
      const orders = Array.from(latestOrdersMap.values()).map(item => item.doc).sort((a, b) => a.data().employeeName.localeCompare(b.data().employeeName));
      if (orders.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 font-bold py-10">Ainda não existem pedidos registados para esta semana.</p>';
        return;
      }
      const holidays = st.viewingNextWeek ? (st.currentMenuData.nextHolidays || []) : (st.currentMenuData.holidays || []);
      let html = `<div style="background-color: white; color: black; padding: 20px; min-width: 700px; font-family: 'Poppins', sans-serif;"><h1 style="font-size: 18pt; text-align: center; margin-bottom: 15px; font-weight: 700;">Cardápio Quatinga</h1>`;
      weekDays.forEach(day => {
        const dayId = getDayId(day);
        if (holidays.includes(dayId)) return;
        let tableHTML = `<div style="margin-bottom: 12px; page-break-inside: avoid;"><table style="width: 100%; border-collapse: collapse; font-size: 9pt;"><thead><tr><th style="border: 1px solid #999; padding: 5px; text-align: left; background-color: #f3f4f6; font-weight: 700; width: 15%;">RGF</th><th style="border: 1px solid #999; padding: 5px; text-align: left; background-color: #f3f4f6; font-weight: 700; width: 60%;">NOME</th><th style="border: 1px solid #999; padding: 5px; text-align: left; background-color: #f3f4f6; font-weight: 700; width: 25%;">${day}</th></tr></thead><tbody>`;
        const dailyOrders = orders.filter(orderDoc => { const data = orderDoc.data(); return data[dayId] && data[dayId] !== 'FERIADO'; });
        dailyOrders.forEach(orderDoc => {
          const order = orderDoc.data();
          let choice = (order[dayId] || '').toUpperCase();
          const notes = order[`${dayId}_notes`];
          let choiceHTML = choice;
          if (choice === 'PRATO PRINCIPAL') choiceHTML = 'PRATO';
          if (choice === 'OPÇÃO') choiceHTML = 'OPÇÃO';
          if (notes) choiceHTML += ` <span style="font-style: italic; font-weight: 400;">(${notes})</span>`;
          tableHTML += `<tr><td style="border: 1px solid #999; padding: 5px; text-align: left; font-weight: 400;">${order.employeeRGF || 'N/A'}</td><td style="border: 1px solid #999; padding: 5px; text-align: left; font-weight: 600;">${order.employeeName}</td><td style="border: 1px solid #999; padding: 5px; text-align: left; font-weight: 400;">${choiceHTML}</td></tr>`;
        });
        tableHTML += '</tbody></table></div>';
        html += tableHTML;
      });
      html += '</div>';
      container.innerHTML = html;
    } catch (error) { container.innerHTML = '<p class="text-center text-red-500 font-bold py-10">Ocorreu um erro ao carregar o relatório.</p>'; }
  }

  // ===== Gera PDF (jsPDF + autotable) e compartilha via WhatsApp/Web Share =====
  async function generateAndShareReport() {
    const st = S();
    const btn = document.getElementById('generateReportBtn');
    const originalText = btn.innerHTML;
    if (st.allOrders.length === 0) {
      showToast("Sem pedidos para gerar relatório.", "info");
      return;
    }
    btn.disabled = true;
    btn.innerHTML = "⏳ Processando PDF...";
    try {
      const { jsPDF } = window.jspdf;
      let doc;
      let fontSize = 9.5;
      let cellPadding = 2;
      let titleFontSize = 18;
      let spaceBetweenTables = 4;

      // Loop inteligente para escalonar os dados ate caberem em exatamente 1 pagina
      while (fontSize >= 5) {
        doc = new jsPDF();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(titleFontSize);
        doc.setTextColor(0, 0, 0);
        doc.text("Regional Quatinga", 105, 15, null, null, "center");

        let currentY = 20;
        const printHolidays = st.adminViewingNextWeek ? (st.currentMenuData.nextHolidays || []) : (st.currentMenuData.holidays || []);
        const pageWidth = doc.internal.pageSize.width;
        const margin = 10;
        const tableWidth = pageWidth - (margin * 2);

        weekDays.forEach(day => {
          const dayId = getDayId(day);
          if (printHolidays.includes(dayId)) return;
          const dailyOrders = st.allOrders
            .filter(orderDoc => { const orderData = orderDoc.data(); return orderData[dayId] && orderData[dayId] !== 'FERIADO'; })
            .sort((a, b) => a.data().employeeName.localeCompare(b.data().employeeName));
          if (dailyOrders.length === 0) return;
          const tableData = dailyOrders.map(orderDoc => {
            const order = orderDoc.data();
            let choice = (order[dayId] || '').toUpperCase();
            const notes = order[`${dayId}_notes`];
            let choiceHTML = choice;
            if (choice === 'PRATO PRINCIPAL') choiceHTML = 'PRATO';
            if (choice === 'OPÇÃO') choiceHTML = 'OPÇÃO';
            if (notes) choiceHTML += ` (${notes})`;
            return [order.employeeRGF || 'N/A', order.employeeName, choiceHTML];
          });
          const headRow = [
            { content: 'RGF', styles: { fontStyle: 'bold' } },
            { content: 'NOME', styles: { fontStyle: 'bold' } },
            { content: day, styles: { fontStyle: 'bold' } }
          ];
          doc.autoTable({
            startY: currentY,
            head: [headRow],
            body: tableData,
            theme: 'plain',
            headStyles: {
              fillColor: [255, 255, 255],
              textColor: [0, 0, 0],
              lineColor: [153, 153, 153],
              lineWidth: 0.2
            },
            bodyStyles: {
              fillColor: [255, 255, 255],
              textColor: [0, 0, 0],
              fontStyle: 'normal',
              lineColor: [153, 153, 153],
              lineWidth: 0.2
            },
            styles: {
              fontSize: fontSize,
              cellPadding: cellPadding,
              font: 'helvetica'
            },
            columnStyles: {
              0: { cellWidth: tableWidth * 0.15 },
              1: { cellWidth: tableWidth * 0.60 },
              2: { cellWidth: tableWidth * 0.25 }
            },
            margin: { left: margin, right: margin },
            tableWidth: 'wrap',
            pageBreak: 'auto'
          });
          currentY = doc.lastAutoTable.finalY + spaceBetweenTables;
        });

        // Se o PDF gerado tem apenas 1 pagina, encontramos o tamanho ideal! Sai do loop.
        if (doc.internal.getNumberOfPages() === 1) {
          break;
        }
        // Se passou para a pagina 2, reduzimos ligeiramente os tamanhos e testamos novamente.
        fontSize -= 0.5;
        cellPadding = Math.max(0.5, cellPadding - 0.2);
        titleFontSize = Math.max(14, titleFontSize - 1);
        spaceBetweenTables = Math.max(1.5, spaceBetweenTables - 0.5);
      }

      const fileName = 'Cardápio Quatinga.pdf';
      const pdfBlob = doc.output('blob');
      const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Cardápio Quatinga',
          text: 'Segue em anexo o relatório de pedidos.',
          files: [file]
        });
        showToast("Compartilhamento aberto com sucesso!", "success");
      } else {
        showToast("Baixando PDF...", "info");
        doc.save(fileName);
      }
    } catch (error) {
      console.error("Erro na geração do PDF:", error);
      showToast("Erro ao criar o PDF.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  // ===== Notificacao WhatsApp =====
  function handleWhatsAppNotification() {
    const message = `O cardápio da próxima semana já está disponível! ✨ Faça o seu pedido com antecedência: ${window.location.href}`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://api.whatsapp.com/send?text=${encodedMessage}`, '_blank');
  }

  // ===== NOVO v3: Calendário interativo de feriados =====
  // Mapeia o dia da próxima semana para o calendário: a próxima semana começa
  // na próxima segunda-feira; a linha do calendário mostra dom->sáb dessa semana.
  function getNextWeekDates() {
    const now = new Date();
    let daysUntilMonday = (1 + 7 - now.getDay()) % 7;
    if (daysUntilMonday === 0) daysUntilMonday = 7;
    const nextMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    // Domingo anterior à segunda (início da grade dom->sáb)
    const gridStart = new Date(nextMonday);
    gridStart.setDate(gridStart.getDate() - 1);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      dates.push(d);
    }
    return dates;
  }

  function buildHolidayCalendarGrid() {
    const calendarContainer = document.getElementById('holidayCalendar');
    if (!calendarContainer) return;
    // dayIds EXATOS como getDayId() gera: "Segunda-feira" -> "segundafeira"
    // v3.1: sem domingo/sabado (a empresa nao trabalha nesses dias)
    const dayIds = ['segundafeira', 'tercafeira', 'quartafeira', 'quintafeira', 'sextafeira'];
    const dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
    const dates = getNextWeekDates();
    // Remove dias antigos (mantém os 5 cabeçalhos Seg..Sex)
    calendarContainer.querySelectorAll('[data-day-id]').forEach(el => el.remove());
    dates.slice(1, 6).forEach((date, i) => {
      const dayId = dayIds[i];
      const dayEl = document.createElement('button');
      dayEl.type = 'button';
      dayEl.dataset.dayId = dayId;
      dayEl.title = `${dayLabels[i]} ${date.toLocaleDateString('pt-BR')} — clique para marcar/desmarcar feriado`;
      dayEl.className = 'h-10 w-10 flex items-center justify-center bg-gray-100 dark:bg-zinc-800 rounded text-xs font-bold text-gray-700 dark:text-gray-300 hover:ring-2 hover:ring-red-400 transition';
      dayEl.textContent = date.getDate();
      calendarContainer.appendChild(dayEl);
    });
    renderHolidayCalendar();
  }

  function renderHolidayCalendar() {
    const st = S();
    const calendarContainer = document.getElementById('holidayCalendar');
    const countElement = document.getElementById('holidayCount');
    const savedNextHolidays = st.currentMenuData.nextHolidays || [];
    
    if (!calendarContainer) return;
    
    // Atualiza contagem
    if (countElement) {
      countElement.textContent = `${savedNextHolidays.length} feriado${savedNextHolidays.length !== 1 ? 's' : ''} selecionado${savedNextHolidays.length !== 1 ? 's' : ''}`;
    }
    
    // Atualiza dias do calendário (pula os 7 primeiros elementos que são os cabeçalhos)
    const dayElements = calendarContainer.querySelectorAll('[data-day-id]');
    dayElements.forEach(el => {
      const dayId = el.dataset.dayId;
      if (savedNextHolidays.includes(dayId)) {
        el.classList.add('bg-red-500', 'dark:bg-red-600', 'text-white');
        el.classList.remove('bg-gray-100', 'dark:bg-zinc-800', 'text-gray-700', 'dark:text-gray-300');
      } else {
        el.classList.remove('bg-red-500', 'dark:bg-red-600', 'text-white');
        el.classList.add('bg-gray-100', 'dark:bg-zinc-800', 'text-gray-700', 'dark:text-gray-300');
      }
    });
  }

  function bindHolidayCalendarHandlers() {
    const calendarContainer = document.getElementById('holidayCalendar');
    if (!calendarContainer) return;
    
    // Constroi a grade de dias na primeira vez
    buildHolidayCalendarGrid();
    
    // Delegação de eventos para os dias do calendário
    calendarContainer.addEventListener('click', (e) => {
      const dayEl = e.target.closest('[data-day-id]');
      if (!dayEl) return;
      
      const dayId = dayEl.dataset.dayId;
      const st = S();
      if (!Array.isArray(st.currentMenuData.nextHolidays)) st.currentMenuData.nextHolidays = [];
      const holidays = st.currentMenuData.nextHolidays;
      const index = holidays.indexOf(dayId);
      
      if (index > -1) {
        holidays.splice(index, 1);
      } else {
        holidays.push(dayId);
      }
      renderHolidayCalendar();
    });
    
    // Botões de seleção rápida
    const selectWeekdaysBtn = document.getElementById('selectWeekdays');
    const clearHolidaysBtn = document.getElementById('clearHolidaysBtn');
    
    if (selectWeekdaysBtn) {
      selectWeekdaysBtn.addEventListener('click', () => {
        const st = S();
        st.currentMenuData.nextHolidays = ['segundafeira', 'tercafeira', 'quartafeira', 'quintafeira', 'sextafeira'];
        renderHolidayCalendar();
      });
    }
    
    if (clearHolidaysBtn) {
      clearHolidaysBtn.addEventListener('click', () => {
        const st = S();
        st.currentMenuData.nextHolidays = [];
        renderHolidayCalendar();
      });
    }
  }

  // ===== NOVO v3: Busca de funcionários em tempo real =====
  function bindEmployeeSearchHandler() {
    const searchInput = document.getElementById('employeeSearch');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const container = document.getElementById('employee-list-container');
      const rows = container.querySelectorAll('tbody tr');
      
      rows.forEach(row => {
        const rgf = row.cells[0].textContent.toLowerCase();
        const nome = row.cells[1].textContent.toLowerCase();
        if (rgf.includes(searchTerm) || nome.includes(searchTerm)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  }

  // ===== Checkboxes legados (para compatibilidade) =====
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

  // ===== v3.2: Consulta RGF no portal da transparencia de Mogi das Cruzes =====
  const PREFEITURA_API = "https://dadosadm.mogidascruzes.sp.gov.br/api";

  function fmtMoney(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    if (isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function fmtDateBR(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR');
  }
  const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  function rgfSetStatus(msg, type) {
    const el = document.getElementById('rgf-consult-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'mb-4 text-sm font-semibold ' + (type === 'error' ? 'text-red-600 dark:text-red-400'
      : type === 'loading' ? 'text-blue-600 dark:text-blue-400'
      : 'text-green-600 dark:text-green-400');
  }

  function rgfRenderResult(latest, folhas) {
    const resultEl = document.getElementById('rgf-consult-result');
    if (!resultEl) return;
    const situacaoBadge = latest.situacao === 'Ativo'
      ? '<span class="inline-block px-2 py-0.5 text-xs font-bold rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Ativo</span>'
      : `<span class="inline-block px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">${latest.situacao || 'Inativo'}</span>`;

    // Cartao principal
    resultEl.innerHTML = `
      <div class="rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
        <div class="bg-blue-600 dark:bg-blue-500 px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-white/80 text-xs font-semibold uppercase tracking-wide">Matrícula ${latest.matricula}</p>
              <h3 class="text-xl font-bold text-white leading-tight">${latest.nome}</h3>
            </div>
            ${situacaoBadge}
          </div>
        </div>
        <div class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 bg-white dark:bg-zinc-900">
          <div><p class="text-xs font-bold text-gray-400 uppercase">Função</p><p class="font-semibold text-gray-800 dark:text-gray-100 text-sm">${latest.cargo || '—'}</p></div>
          <div><p class="text-xs font-bold text-gray-400 uppercase">Local de Trabalho</p><p class="font-semibold text-gray-800 dark:text-gray-100 text-sm">${latest.localtrabalho || '—'}</p></div>
          <div><p class="text-xs font-bold text-gray-400 uppercase">Secretaria</p><p class="font-semibold text-gray-800 dark:text-gray-100 text-sm">${latest.secretaria || '—'}</p></div>
          <div><p class="text-xs font-bold text-gray-400 uppercase">Tipo de Contrato</p><p class="font-semibold text-gray-800 dark:text-gray-100 text-sm">${latest.tipocontrato || '—'}</p></div>
          <div><p class="text-xs font-bold text-gray-400 uppercase">Admissão</p><p class="font-semibold text-gray-800 dark:text-gray-100 text-sm">${fmtDateBR(latest.dataadmissao)}</p></div>
          <div><p class="text-xs font-bold text-gray-400 uppercase">Horas Semanais</p><p class="font-semibold text-gray-800 dark:text-gray-100 text-sm">${latest.horas_semanais ? latest.horas_semanais.replace('.', ',') + 'h' : '—'}</p></div>
          <div><p class="text-xs font-bold text-gray-400 uppercase">Salário Base</p><p class="font-semibold text-gray-800 dark:text-gray-100 text-sm">${fmtMoney(latest.salariobase)}</p></div>
          <div><p class="text-xs font-bold text-gray-400 uppercase">Última competência</p><p class="font-semibold text-gray-800 dark:text-gray-100 text-sm">${MES_ABREV[(latest.mes || 1) - 1]}/${latest.ano || '—'} · ${latest.tipo_folha || ''}</p></div>
        </div>
      </div>`;

    // Cartao do contracheque (folha detalhada) + resumo da competencia
    if (folhas.length > 0) {
      const f = folhas[0];
      const rendimentos = f.results.filter(v => v.tipoVerba === 'Rendimentos');
      const descontos = f.results.filter(v => v.tipoVerba === 'Descontos');
      const totalRend = rendimentos.reduce((s, v) => s + Math.abs(parseFloat(v.valorverba)), 0);
      const totalDesc = descontos.reduce((s, v) => s + Math.abs(parseFloat(v.valorverba)), 0);
      const liquido = totalRend - totalDesc;
      const temAdiantamento = descontos.some(v => /ADIANTAMENTO/i.test(v.desnoverba));
      const notaAdiantamento = temAdiantamento
        ? `<p class="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">ℹ️ Inclui desconto de adiantamento salarial (valor pago antecipadamente no mês). O "líquido" acima é o valor final depositado.</p>`
        : '';
      const verbaRow = (v) => `
        <div class="flex justify-between items-center gap-2 py-1.5 border-b border-gray-100 dark:border-zinc-800">
          <span class="text-sm text-gray-700 dark:text-gray-300 flex-1">${v.desnoverba}</span>
          <span class="text-sm font-bold ${v.tipoVerba === 'Rendimentos' ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'} whitespace-nowrap">${v.tipoVerba === 'Rendimentos' ? '+' : '−'} ${fmtMoney(Math.abs(parseFloat(v.valorverba)))}</span>
        </div>`;
      resultEl.innerHTML += `
        <div class="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5">
          <div class="flex flex-wrap justify-between items-center gap-2 mb-3">
            <h4 class="font-bold text-gray-800 dark:text-gray-100">Contracheque — ${MES_ABREV[(f.mes || latest.mes || 1) - 1]}/${f.ano || latest.ano}</h4>
            <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">fonte: portal da transparência</span>
          </div>
          <p class="text-xs font-bold text-gray-400 uppercase mb-1">Rendimentos</p>
          ${rendimentos.map(verbaRow).join('')}
          <p class="text-xs font-bold text-gray-400 uppercase mt-4 mb-1">Descontos</p>
          ${descontos.map(verbaRow).join('')}
          <div class="mt-4 pt-3 border-t-2 border-gray-200 dark:border-zinc-700 grid grid-cols-3 gap-2 text-center">
            <div><p class="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Bruto</p><p class="font-bold text-green-700 dark:text-green-400 text-sm">${fmtMoney(totalRend)}</p></div>
            <div><p class="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Descontos</p><p class="font-bold text-red-600 dark:text-red-400 text-sm">${fmtMoney(totalDesc)}</p></div>
            <div><p class="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase">Líquido</p><p class="font-bold text-blue-700 dark:text-blue-400 text-sm text-base">${fmtMoney(liquido)}</p></div>
          </div>
          ${notaAdiantamento}
        </div>`;
    }
  }

  async function handleRgfConsult(e) {
    e.preventDefault();
    const input = document.getElementById('rgf-consult-input');
    const resultEl = document.getElementById('rgf-consult-result');
    const btn = document.getElementById('rgf-consult-btn');
    if (!input || !resultEl) return;
    const rgf = input.value.trim().replace(/\D/g, '');
    if (!rgf) { rgfSetStatus('Digite um RGF para consultar.', 'error'); return; }

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Consultando...';
    resultEl.innerHTML = '';
    rgfSetStatus('Consultando RGF ' + rgf + '...', 'loading');
    try {
      // 1) Busca a folha mais recente: percorre anos do atual para tras
      //    (a API pagina por ordem cronologica crescente; filtrar por ano
      //     garante que o registro mais novo nunca fique numa pagina oculta)
      const anoAtual = new Date().getFullYear();
      let results = [];
      for (let ano = anoAtual; ano >= anoAtual - 8 && results.length === 0; ano--) {
        const resp = await fetch(`${PREFEITURA_API}/folha_pagamento?matricula=${rgf}&ano=${ano}`);
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.results && data.results.length > 0) results = data.results;
      }
      if (results.length === 0) {
        rgfSetStatus('Nenhum registro encontrado para o RGF ' + rgf + '.', 'error');
        return;
      }
      // 2) Mais recente: prioriza 'Folha de Pagamento Mensal', senao o mais novo
      const mensais = results.filter(r => r.tipo_folha === 'Folha de Pagamento Mensal');
      const pool = mensais.length > 0 ? mensais : results;
      const latest = pool.reduce((a, b) => ((b.ano * 12 + b.mes) > (a.ano * 12 + a.mes) ? b : a));
      rgfSetStatus(`${latest.nome} — competência ${MES_ABREV[(latest.mes || 1) - 1]}/${latest.ano}.`, 'success');

      // 3) Contracheque detalhado do mes mais recente
      let folhas = [];
      try {
        const respF = await fetch(`${PREFEITURA_API}/detalhe_folha?idfunselec=${latest.idfunselec}`);
        if (respF.ok) {
          const fd = await respF.json();
          if (fd.results && fd.results.length > 0) {
            folhas = [{ results: fd.results, mes: latest.mes, ano: latest.ano }];
          }
        }
      } catch (_) { /* contracheque opcional */ }

      rgfRenderResult(latest, folhas);
    } catch (err) {
      rgfSetStatus('Erro na consulta: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function bindRgfConsultHandler() {
    const form = document.getElementById('rgf-consult-form');
    if (!form) return;
    form.addEventListener('submit', handleRgfConsult);
    // Enter tambem dispara via submit; consulta ao clicar fora (blur) NAO, para evitar consultas acidentais
  }

  global.loadAndDisplayMenu = loadAndDisplayMenu;
  global.loadAdminData = loadAdminData;
  global.loadAndRenderEmployees = loadAndRenderEmployees;
  global.handleAddEmployee = handleAddEmployee;
  global.handleDeleteEmployee = handleDeleteEmployee;
  global.openEmployeeEditModal = openEmployeeEditModal;
  global.handleSaveEmployeeChanges = handleSaveEmployeeChanges;
  global.handleDeleteOrder = handleDeleteOrder;
  global.openPublicReportModal = openPublicReportModal;
  global.generateAndShareReport = generateAndShareReport;
  global.handleWhatsAppNotification = handleWhatsAppNotification;
  global.renderHolidayCalendar = renderHolidayCalendar;
  global.bindHolidayCalendarHandlers = bindHolidayCalendarHandlers;
  global.bindEmployeeSearchHandler = bindEmployeeSearchHandler;
  global.renderHolidayCheckboxes = renderHolidayCheckboxes;
  global.bindRgfConsultHandler = bindRgfConsultHandler;
})(window);