// Cardapio Quatinga v2 - admin.js
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

      renderHolidayCheckboxes();
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
    }, (error) => { showToast("Erro ao carregar dados.", 'error'); });
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
})(window);