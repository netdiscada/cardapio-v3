// Cardapio Quatinga v3 - app.js
// Bootstrap/orquestracao: estado global compartilhado, setupPWA, upload/cropper de
// imagem do cardapio (v3: drag-and-drop + preview), calendario interativo de
// feriados, busca de funcionarios, status online/offline, e wiring de TODOS os
// event listeners (main). Carregado por ULTIMO no index.html. Escopo global via window.

(function (global) {
  const fb = global.fb;
  const auth = global.auth;
  const APP_CONFIG = global.APP_CONFIG;

  // =====================================================================
  // ESTADO GLOBAL compartilhado entre os modulos (equivalente as variaveis
  // de topo do v1.x)
  // =====================================================================
  global.__state = {
    currentMenuData: { menuImageBase64: '', holidays: [], nextMenuImageBase64: '', nextHolidays: [], targetRotationDate: null },
    weeklyMenu: {},
    userActiveHolidays: [],
    viewingNextWeek: false,
    adminViewingNextWeek: false,
    autoSwitchDone: false,
    menuUnsubscribe: null,
    adminUnsubscribe: null,
    anonymousLoginPromise: null,
    isLoggingInAsAdmin: false,
    isRotatingWeekLock: false,
    allOrders: [],
    tempOrderData: {},
    userChoices: [],
    currentDayIndex: 0,
    cropperInstance: null,
    finalImageBase64: null
  };

  // =====================================================================
  // PWA (manifest + service worker) — porta do setupPWA do v1.x
  // =====================================================================
  function setupPWA() {
    try {
      const manifest = {
        name: "Cardápio Quatinga",
        short_name: "Cardápio",
        start_url: window.location.href,
        display: "standalone",
        background_color: "#000000",
        theme_color: "#2563eb",
        icons: [{
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%232563eb' rx='20'/%3E%3Ctext x='50' y='65' font-size='60' text-anchor='middle' fill='white'%3E%F0%9F%8D%B2%3C/text%3E%3C/svg%3E",
          sizes: "192x192",
          type: "image/svg+xml",
          purpose: "any maskable"
        }]
      };
      const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
      document.getElementById('pwa-manifest').href = URL.createObjectURL(manifestBlob);

      const swCode = `self.addEventListener('fetch', function(e) {});`;
      const swBlob = new Blob([swCode], { type: 'application/javascript' });
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(URL.createObjectURL(swBlob)).catch(() => {});
      }
    } catch (e) { console.log("PWA setup falhou"); }
  }
  setupPWA();

  // =====================================================================
  // v3: Upload de imagem com drag-and-drop (dropArea) + preview com info
  // =====================================================================
  function bindImageUploadHandlers() {
    const st = global.__state;
    const dropArea = document.getElementById('dropArea');
    const resetBtn = document.getElementById('resetUpload');
    const cropBtn = document.getElementById('cropImageBtn');

    // Input file invisível reutilizável (suporta clique na dropArea)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/jpg,image/webp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    function handleFileSelection(file) {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast("Arquivo inválido. Envie uma imagem (JPG/PNG).", "error");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast("Imagem muito grande (máx 5MB).", "error");
        return;
      }
      const feedback = document.getElementById('uploadFeedback');
      if (feedback) feedback.textContent = `Processando: ${file.name}...`;
      const reader = new FileReader();
      reader.onload = (e) => {
        const cropperImage = document.getElementById('cropper-image');
        cropperImage.src = e.target.result;
        document.getElementById('cropper-modal').classList.remove('hidden');
        if (st.cropperInstance) st.cropperInstance.destroy();
        st.cropperInstance = new Cropper(cropperImage, {
          viewMode: 1, dragMode: 'move', autoCropArea: 0.95, restore: false, guides: true,
          center: true, highlight: false, cropBoxMovable: true, cropBoxResizable: true, toggleDragModeOnDblclick: false,
        });
        if (feedback) feedback.textContent = '';
      };
      reader.readAsDataURL(file);
    }

    if (dropArea) {
      dropArea.addEventListener('click', () => fileInput.click());

      ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropArea.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropArea.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
        });
      });
      dropArea.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) handleFileSelection(files[0]);
      });
    }

    fileInput.addEventListener('change', function (event) {
      if (event.target.files && event.target.files[0]) {
        handleFileSelection(event.target.files[0]);
      }
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        st.finalImageBase64 = null;
        fileInput.value = '';
        const previewContainer = document.getElementById('imagePreviewContainer');
        if (previewContainer) previewContainer.classList.add('hidden');
        const uploadBtn = document.getElementById('uploadImageBtn');
        if (uploadBtn) uploadBtn.disabled = true;
        showToast("Upload redefinido.", "info");
      });
    }

    if (cropBtn) {
      cropBtn.addEventListener('click', () => {
        if (!st.finalImageBase64) {
          showToast("Confirme o recorte da imagem atual primeiro.", "info");
          return;
        }
        const cropperImage = document.getElementById('cropper-image');
        cropperImage.src = st.finalImageBase64;
        document.getElementById('cropper-modal').classList.remove('hidden');
        if (st.cropperInstance) st.cropperInstance.destroy();
        st.cropperInstance = new Cropper(cropperImage, {
          viewMode: 1, dragMode: 'move', autoCropArea: 0.95, restore: false, guides: true,
          center: true, highlight: false, cropBoxMovable: true, cropBoxResizable: true, toggleDragModeOnDblclick: false,
        });
      });
    }

    // ===== Cancel/Confirm do cropper =====
    document.getElementById('cancel-crop-btn').addEventListener('click', () => {
      document.getElementById('cropper-modal').classList.add('hidden');
      st.finalImageBase64 = null;
      if (st.cropperInstance) { st.cropperInstance.destroy(); st.cropperInstance = null; }
    });

    document.getElementById('confirm-crop-btn').addEventListener('click', async () => {
      if (!st.cropperInstance) return;
      const btn = document.getElementById('confirm-crop-btn');
      const originalText = btn.textContent;
      btn.disabled = true; btn.textContent = "⏳ Processando...";
      try {
        const canvas = st.cropperInstance.getCroppedCanvas({ maxWidth: 1200, maxHeight: 1200, fillColor: '#fff', imageSmoothingEnabled: true, imageSmoothingQuality: 'high', });
        if (!canvas) throw new Error("Falha ao gerar o canvas.");
        canvas.toBlob(async (blob) => {
          if (!blob) { showToast("Erro no recorte.", "error"); btn.disabled = false; btn.textContent = originalText; return; }
          try {
            const options = { maxSizeMB: 0.45, maxWidthOrHeight: 1200, useWebWorker: true };
            const compressFn = window.imageCompression || imageCompression;
            const compressedBlob = await compressFn(blob, options);
            const reader = new FileReader();
            reader.readAsDataURL(compressedBlob);
            reader.onloadend = () => {
              st.finalImageBase64 = reader.result;
              // Preview v3
              const preview = document.getElementById('imagePreview');
              const previewContainer = document.getElementById('imagePreviewContainer');
              if (preview) preview.src = st.finalImageBase64;
              if (previewContainer) previewContainer.classList.remove('hidden');
              const dimEl = document.getElementById('imageDimensions');
              const sizeEl = document.getElementById('imageSize');
              if (dimEl) dimEl.textContent = `${canvas.width} x ${canvas.height}px`;
              if (sizeEl) sizeEl.textContent = `${(compressedBlob.size / 1024).toFixed(0)} KB`;
              document.getElementById('uploadImageBtn').disabled = false;
              document.getElementById('cropper-modal').classList.add('hidden');
              st.cropperInstance.destroy(); st.cropperInstance = null;
              btn.disabled = false; btn.textContent = originalText; showToast("Imagem processada e pronta!", "success");
            };
          } catch (compErr) { showToast("Falha na compressão.", "error"); btn.disabled = false; btn.textContent = originalText; }
        }, 'image/jpeg', 0.85);
      } catch (err) { showToast("Erro ao processar imagem.", "error"); btn.disabled = false; btn.textContent = originalText; }
    });

    // ===== Salvar cardapio da proxima semana =====
    document.getElementById('uploadImageBtn').addEventListener('click', async () => {
      const uploadBtn = document.getElementById('uploadImageBtn');
      try {
        if (!auth.currentUser) { showToast("Sessão expirada. Recarregue a página.", "error"); return; }
        if (!st.finalImageBase64) { showToast("Você precisa selecionar e recortar uma imagem primeiro.", "error"); return; }
        uploadBtn.disabled = true; uploadBtn.innerHTML = "⏳ Salvando no banco de dados...";
        // v3: feriados vem do calendario interativo (currentMenuData.nextHolidays)
        let selectedHolidays = [];
        if (st.currentMenuData && Array.isArray(st.currentMenuData.nextHolidays)) {
          selectedHolidays = st.currentMenuData.nextHolidays;
        } else {
          selectedHolidays = Array.from(document.querySelectorAll('.holiday-checkbox:checked')).map(cb => cb.value);
        }
        const now = new Date();
        let daysUntilMonday = (1 + 7 - now.getDay()) % 7;
        if (daysUntilMonday === 0) daysUntilMonday = 7;
        const nextMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilMonday);
        nextMonday.setHours(0, 0, 0, 0);
        await fb.setDoc(global.getMenuDocRef(), { nextMenuImageBase64: st.finalImageBase64, nextHolidays: selectedHolidays, targetRotationDate: nextMonday.getTime() }, { merge: true });
        showToast("Cardápio da Próxima Semana salvo e disponível!", "success");
        document.getElementById('whatsapp-notification-container').classList.remove('hidden');
        // Dispara notificação push real via Vercel endpoint
        if (global.triggerNewMenuNotification) {
          global.triggerNewMenuNotification(true);
        }
        st.finalImageBase64 = null; uploadBtn.innerHTML = "✅ Salvo com sucesso!";
      } catch (error) {
        uploadBtn.disabled = false; uploadBtn.textContent = "Tentar Salvar Novamente";
        if (error.code === 'resource-exhausted' || (error.message && error.message.includes('large'))) { showToast("Erro: A imagem ainda está muito pesada para o banco de dados.", "error"); }
        else { showToast("Falha na conexão. Tente novamente.", "error"); }
      }
    });
  }

  // =====================================================================
  // Status online/offline
  // =====================================================================
  function updateOnlineStatus() {
    const banner = document.getElementById('offline-banner');
    if (navigator.onLine) {
      banner.classList.add('hidden');
    } else {
      banner.classList.remove('hidden');
    }
  }

  // =====================================================================
  // NOTIFICACOES PUSH (Capacitor). So roda dentro do APK; no PWA ignora.
  // =====================================================================
  async function registerDeviceToken() {
    try {
      const r = await Capacitor.Plugins.PushNotifications.register();
      const token = (r && (r.token || (r.value && r.value.token))) || null;
      if (token) {
        const rgfEl = document.getElementById('employeeRGF');
        const rgf = rgfEl && rgfEl.value ? rgfEl.value.trim() : 'sem-rgf';
        if (global.db) {
          await global.db.collection('deviceTokens').doc(token).set({
            token: token,
            rgf: rgf,
            platform: 'android',
            updatedAt: global.serverTimestamp()
          }, { merge: true });
        }
      }
    } catch (e) { /* sem permissao ainda ou fora do APK */ }
  }

  function setupPushNotifications() {
    if (!window.Capacitor || !Capacitor.isNativePlatform) return;
    const Push = Capacitor.Plugins.PushNotifications;
    if (!Push) return;
    Push.requestPermissions().then((perm) => {
      if (perm.receive === 'granted') registerDeviceToken();
    }).catch(() => {});
    const rgfEl = document.getElementById('employeeRGF');
    if (rgfEl) rgfEl.addEventListener('change', registerDeviceToken);
    Push.addListener('pushNotificationReceived', (n) => {
      try { if (n && n.data) showToast(n.title || 'Cardápio Quatinga', 'info', 4000); } catch (e) {}
    });
    Push.addListener('pushNotificationActionPerformed', () => {});
  }

  // =====================================================================
  // MAIN — wiring de TODOS os listeners (equivale ao main() do v1.x)
  // =====================================================================
  function main() {
    document.getElementById('admin-view-current').addEventListener('click', () => setAdminTab(false));
    document.getElementById('admin-view-next').addEventListener('click', () => setAdminTab(true));

    document.getElementById('btn-turn-week').addEventListener('click', global.turnWeek);
    document.getElementById('btn-clear-current-orders').addEventListener('click', global.clearCurrentOrders);

    const rgfInput = document.getElementById('employeeRGF');
    let rgfDebounceTimeout;
    rgfInput.addEventListener('input', () => {
      clearTimeout(rgfDebounceTimeout);
      rgfDebounceTimeout = setTimeout(async () => {
        global.__state.autoSwitchDone = false;
        const val = rgfInput.value.trim();
        localStorage.setItem('employeeRGF', val);
        await findEmployeeByRGF(val);
        await validateForm();
      }, 400);
    });
    rgfInput.addEventListener('blur', () => localStorage.setItem('employeeRGF', rgfInput.value));

    document.getElementById('wizard-options').addEventListener('click', handleWizardSelection);
    document.getElementById('openConfirmationModal').addEventListener('click', openConfirmationModal);
    document.getElementById('submitOrder').addEventListener('click', submitOrder);

    document.getElementById('btn-edit-wizard').addEventListener('click', () => {
      document.getElementById('confirmation-modal').classList.add('hidden');
      global.__state.currentDayIndex = 0;
      global.__state.userChoices = [];
      document.getElementById('submitButtonContainer').classList.add('hidden');
      document.getElementById('order-wizard-container').classList.remove('hidden');
      renderWizardStep(0);
    });

    document.getElementById('btn-view-public-report').addEventListener('click', openPublicReportModal);
    document.querySelectorAll('.cancel-modal-btn, #custom-confirm-cancel-btn').forEach(btn => { btn.addEventListener('click', () => btn.closest('.modal-overlay').classList.add('hidden')); });
    document.getElementById('switchToAdmin').addEventListener('click', () => {
      if (auth?.currentUser && auth.currentUser.uid === APP_CONFIG.ADMIN_UID) { localStorage.setItem('currentAppView', 'admin'); showAdminView(); }
      else { document.getElementById('admin-login-modal').classList.remove('hidden'); }
    });

    document.getElementById('admin-login-form').addEventListener('submit', handleAdminLogin);
    document.getElementById('adminLogoutBtn').addEventListener('click', handleAdminLogout);
    document.getElementById('switchToUserFromAdmin').addEventListener('click', () => { localStorage.setItem('currentAppView', 'user'); showUserView(); });
    document.getElementById('add-employee-form').addEventListener('submit', handleAddEmployee);
    document.getElementById('employee-list-container').addEventListener('click', (e) => {
      if (e.target.closest('.edit-employee-btn')) openEmployeeEditModal(e.target.closest('.edit-employee-btn').dataset.id, e.target.closest('.edit-employee-btn').dataset.name);
      if (e.target.closest('.delete-employee-btn')) handleDeleteEmployee(e.target.closest('.delete-employee-btn').dataset.id, e.target.closest('.delete-employee-btn').dataset.name);
    });
    document.getElementById('edit-employee-form').addEventListener('submit', handleSaveEmployeeChanges);
    document.getElementById('ordersTableContainer').addEventListener('click', (e) => {
      if (e.target.closest('.edit-order-btn')) openEditOrderModal(e.target.closest('.edit-order-btn').dataset.id);
      if (e.target.closest('.delete-order-btn')) handleDeleteOrder(e.target.closest('.delete-order-btn').dataset.id, e.target.closest('.delete-order-btn').dataset.name);
    });

    document.getElementById('edit-order-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const st = global.__state;
      if (!auth.currentUser) return;
      const orderId = document.getElementById('edit-order-id').value;
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const updateData = {};
      const editHolidays = st.adminViewingNextWeek ? (st.currentMenuData.nextHolidays || []) : (st.currentMenuData.holidays || []);
      global.weekDays.forEach(day => {
        const dayId = getDayId(day);
        if (editHolidays.includes(dayId)) return;
        const selectEl = document.getElementById(`edit-choice-${dayId}`);
        const notesEl = document.getElementById(`edit-notes-${dayId}`);
        if (selectEl) { updateData[dayId] = selectEl.value; updateData[`${dayId}_notes`] = notesEl.value.trim(); }
      });
      submitBtn.disabled = true; submitBtn.textContent = 'Salvando...';
      try {
        await fb.updateDoc(fb.collection(global.db, "pedidosDaSemana").doc(orderId), updateData);
        showToast("Pedido atualizado com sucesso!", 'success');
        document.getElementById('edit-order-modal').classList.add('hidden');
      } catch (error) { showToast("Erro ao salvar.", 'error'); }
      finally { submitBtn.disabled = false; submitBtn.textContent = 'Salvar Alterações'; }
    });

    document.getElementById('searchInput').addEventListener('input', () => renderOrdersTable(global.__state.allOrders));

    document.getElementById('generateReportBtn').addEventListener('click', generateAndShareReport);
    document.getElementById('notifyWhatsAppBtn').addEventListener('click', handleWhatsAppNotification);
    document.getElementById('deleteNextWeekBtn')?.addEventListener('click', async () => {
      showCustomConfirm("Tem a certeza? Isso vai apagar o cardápio da próxima semana e todos os pedidos já feitos antecipadamente.", async () => {
        if (!auth.currentUser) return;
        const btn = document.getElementById('deleteNextWeekBtn');
        btn.disabled = true; btn.textContent = "A apagar...";
        try {
          await fb.updateDoc(global.getMenuDocRef(), { nextMenuImageBase64: '', nextHolidays: [], targetRotationDate: null });
          const snap = await fb.getDocs(fb.collection(global.db, "pedidosDaSemana"));
          const batch = fb.writeBatch(global.db);
          snap.forEach(d => { if (d.data().isNextWeek === true) batch.delete(d.ref); });
          await batch.commit();
          showToast("Próxima semana apagada.", "success");
        } catch (error) { showToast("Erro ao apagar.", "error"); }
        finally { btn.disabled = false; btn.textContent = "🗑️ Cancelar / Apagar Próxima Semana"; }
      });
    });

    const zoomModal = document.getElementById('image-zoom-modal');
    const menuImage = document.getElementById('menu-image');
    menuImage.addEventListener('click', () => { document.getElementById('zoomed-image').src = menuImage.src; zoomModal.classList.remove('hidden'); });
    zoomModal.addEventListener('click', (e) => {
      if (e.target === zoomModal) zoomModal.classList.add('hidden');
    });

    // ===== v3: Handlers do calendario interativo + busca de funcionarios =====
    if (global.bindHolidayCalendarHandlers) global.bindHolidayCalendarHandlers();
    if (global.bindEmployeeSearchHandler) global.bindEmployeeSearchHandler();
    if (global.bindRgfConsultHandler) global.bindRgfConsultHandler();
    if (global.initUserHelp) global.initUserHelp();

    // ===== v3: Toggle do formulario de adicionar funcionario =====
    const toggleAddEmployeeFormBtn = document.getElementById('toggleAddEmployeeForm');
    if (toggleAddEmployeeFormBtn) {
      toggleAddEmployeeFormBtn.addEventListener('click', () => {
        const form = document.getElementById('add-employee-form');
        form.classList.toggle('hidden');
      });
    }

    // ===== v3: Abas do painel ADM (Sidebar/TabBar) =====
    const adminTabsNav = document.getElementById('admin-tabs');
    if (adminTabsNav) {
      const panelIds = { menu: 'menu-management-section', employees: 'employee-management-section', orders: 'order-status-section' };
      const extraOrderPanel = document.getElementById('orders-section');

      const showPanel = (name) => {
        // Esconde/mostra painéis conforme a aba ativa
        document.querySelectorAll('#admin-view section[data-admin-panel]').forEach(sec => {
          sec.classList.toggle('hidden', sec.dataset.adminPanel !== name);
        });
        // Atualiza botões
        document.querySelectorAll('#admin-tabs .admin-tab-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.adminTab === name);
        });
        // O botão FAB de PDF só faz sentido na aba de pedidos
        const fab = document.getElementById('generateReportBtn');
        if (fab) fab.classList.toggle('hidden', name !== 'orders');
        // Guarda a aba ativa
        global.__state.adminActiveTab = name;
      };

      adminTabsNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.admin-tab-btn');
        if (!btn) return;
        showPanel(btn.dataset.adminTab);
      });

      // Aba inicial (ou última usada)
      showPanel(global.__state.adminActiveTab || 'menu');
    }
  }

  // =====================================================================
  // BOOT
  // =====================================================================
  updateDarkModeButton();
  document.getElementById('darkModeToggle').addEventListener('click', global.toggleDarkMode);
  document.getElementById('menu-image').addEventListener('load', global.handleImageLoad);

  window.addEventListener('online', () => { updateOnlineStatus(); showToast("Conexão restabelecida!", "success"); });
  window.addEventListener('offline', () => { updateOnlineStatus(); showToast("Você está offline. Alterações serão salvas no celular.", "info", 5000); });
  updateOnlineStatus();

  bindImageUploadHandlers();
  main();

  // ===== Notificacoes Push (FCM via Capacitor) — roda somente no APK =====
  setupPushNotifications();

  // Dispara o listener de auth (login anonimo / admin)
  setupAuthStateListener();
})(window);