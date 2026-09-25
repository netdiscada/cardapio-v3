/* ============================================================
 * Menu Image Viewer — Cardápio Quatinga v3.3
 * ============================================================
 * Visualizador fullscreen da imagem do cardápio com:
 * - Pinch-zoom (2 dedos) e duplo toque
 * - Pan (arrastar com 1 dedo quando ampliado)
 * - Botões de ESCOLHA FIXOS na parte de baixo (não somem,
 *   não ficam cobertos, ficam sempre acessíveis)
 * - Botão de zoom +/- e reset para quem tem dificuldade
 *   com gestos de pinça
 * ============================================================ */

const MENU_VIEWER = {
    scale: 1,
    minScale: 1,
    maxScale: 5,
    lastScale: 1,
    posX: 0,
    posY: 0,
    isOpen: false,
    // Ponteiros ativos (para pinch)
    pointers: new Map(),
    lastPinchDist: 0
};

/* ====== ABRIR / FECHAR ====== */
function menuViewerOpen() {
    const img = document.getElementById('menu-image');
    const modal = document.getElementById('menu-viewer-modal');
    const viewerImg = document.getElementById('menu-viewer-img');
    if (!img || !modal || !viewerImg || !img.src || img.src === window.location.href) return;

    viewerImg.src = img.src;
    MENU_VIEWER.scale = 1;
    MENU_VIEWER.posX = 0;
    MENU_VIEWER.posY = 0;
    MENU_VIEWER.lastScale = 1;
    menuViewerApplyTransform();
    modal.classList.remove('hidden');
    MENU_VIEWER.isOpen = true;

    // Move o wizard E o botão de revisar pra dentro do viewer (botões fixos embaixo)
    const wizardHost = document.getElementById('menu-viewer-buttons');
    const wizard = document.getElementById('order-wizard-container');
    const submitBtn = document.getElementById('submitButtonContainer');
    if (wizardHost) {
        if (wizard) {
            if (!wizard.dataset.origParent) wizard.dataset.origParent = 'order-section';
            wizardHost.appendChild(wizard);
        }
        if (submitBtn) {
            if (!submitBtn.dataset.origParent) submitBtn.dataset.origParent = 'order-section';
            wizardHost.appendChild(submitBtn);
        }
    }
}

function menuViewerClose() {
    const modal = document.getElementById('menu-viewer-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    MENU_VIEWER.isOpen = false;

    // Devolve wizard e botão de revisar pro lugar original (após menu-image-container)
    const imgContainer = document.getElementById('menu-image-container');
    const wizard = document.getElementById('order-wizard-container');
    const submitBtn = document.getElementById('submitButtonContainer');
    if (imgContainer && imgContainer.parentNode) {
        let anchor = imgContainer.nextSibling;
        if (wizard && wizard.parentElement?.id === 'menu-viewer-buttons') {
            imgContainer.parentNode.insertBefore(wizard, anchor);
            anchor = wizard.nextSibling;
        }
        if (submitBtn && submitBtn.parentElement?.id === 'menu-viewer-buttons') {
            imgContainer.parentNode.insertBefore(submitBtn, anchor);
        }
    }
}

/* ====== TRANSFORM ====== */
function menuViewerApplyTransform() {
    const img = document.getElementById('menu-viewer-img');
    const stage = document.getElementById('menu-viewer-stage');
    if (!img || !stage) return;

    const imgRect = img.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();

    // A imagem escalada ocupa: naturalWidth * scale, naturalHeight * scale
    // O container é stageRect
    // O centro da imagem está em: stageRect.center + translate
    // Para não deixar espaço vazio nas bordas, limitamos o translate

    const scaledW = img.naturalWidth * MENU_VIEWER.scale;
    const scaledH = img.naturalHeight * MENU_VIEWER.scale;

    // Se a imagem cabe no container, centraliza (posX/posY = 0)
    // Se não cabe, pode mover até a borda da imagem coincidir com a borda do container
    const maxX = Math.max(0, (scaledW - stageRect.width) / 2);
    const maxY = Math.max(0, (scaledH - stageRect.height) / 2);

    MENU_VIEWER.posX = Math.max(-maxX, Math.min(maxX, MENU_VIEWER.posX));
    MENU_VIEWER.posY = Math.max(-maxY, Math.min(maxY, MENU_VIEWER.posY));

    img.style.transform = `translate(${MENU_VIEWER.posX}px, ${MENU_VIEWER.posY}px) scale(${MENU_VIEWER.scale})`;
}

function menuViewerZoomBy(delta) {
    MENU_VIEWER.lastScale = MENU_VIEWER.scale;
    MENU_VIEWER.scale = Math.min(MENU_VIEWER.maxScale, Math.max(MENU_VIEWER.minScale, MENU_VIEWER.scale + delta));
    // Ao dar zoom-out total, recentraliza
    if (MENU_VIEWER.scale === 1) { MENU_VIEWER.posX = 0; MENU_VIEWER.posY = 0; }
    menuViewerApplyTransform();
}

function menuViewerReset() {
    MENU_VIEWER.scale = 1;
    MENU_VIEWER.posX = 0;
    MENU_VIEWER.posY = 0;
    menuViewerApplyTransform();
}

/* ====== EVENTOS DE TOQUE (pinch + pan) ====== */
function menuViewerBindEvents() {
    const stage = document.getElementById('menu-viewer-stage');
    const img = document.getElementById('menu-viewer-img');
    if (!stage || !img) return;

    let panStart = null; // {x, y, posX, posY} do início do arrasto

    stage.addEventListener('pointerdown', (e) => {
        stage.setPointerCapture(e.pointerId);
        MENU_VIEWER.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (MENU_VIEWER.pointers.size === 1) {
            panStart = { x: e.clientX, y: e.clientY, posX: MENU_VIEWER.posX, posY: MENU_VIEWER.posY };
        } else if (MENU_VIEWER.pointers.size === 2) {
            const pts = [...MENU_VIEWER.pointers.values()];
            MENU_VIEWER.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            MENU_VIEWER.lastScale = MENU_VIEWER.scale;
            panStart = null;
        }
    });

    stage.addEventListener('pointermove', (e) => {
        if (!MENU_VIEWER.pointers.has(e.pointerId)) return;
        MENU_VIEWER.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (MENU_VIEWER.pointers.size === 1 && panStart && MENU_VIEWER.scale > 1) {
            // PAN com 1 dedo (só quando ampliado)
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            MENU_VIEWER.posX = panStart.posX + dx;
            MENU_VIEWER.posY = panStart.posY + dy;
            menuViewerApplyTransform();
        } else if (MENU_VIEWER.pointers.size === 2) {
            // PINCH com 2 dedos
            const pts = [...MENU_VIEWER.pointers.values()];
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            if (MENU_VIEWER.lastPinchDist > 0) {
                const factor = dist / MENU_VIEWER.lastPinchDist;
                MENU_VIEWER.scale = Math.min(MENU_VIEWER.maxScale, Math.max(MENU_VIEWER.minScale, MENU_VIEWER.lastScale * factor));
                if (MENU_VIEWER.scale === 1) { MENU_VIEWER.posX = 0; MENU_VIEWER.posY = 0; }
                menuViewerApplyTransform();
            }
        }
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
        stage.addEventListener(ev, (e) => {
            MENU_VIEWER.pointers.delete(e.pointerId);
            if (MENU_VIEWER.pointers.size === 0) panStart = null;
            if (MENU_VIEWER.pointers.size < 2) MENU_VIEWER.lastPinchDist = 0;
            // NÃO reinicia panStart aqui - evita zoom/pann jump ao levantar dedos
            if (MENU_VIEWER.pointers.size === 1) {
                MENU_VIEWER.lastScale = MENU_VIEWER.scale;
            }
        })
    );

    // Duplo toque = zoom in/out rápido
    let lastTap = 0;
    stage.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTap < 300 && MENU_VIEWER.pointers.size === 0) {
            if (MENU_VIEWER.scale > 1) menuViewerReset();
            else menuViewerZoomBy(1.5);
        }
        lastTap = now;
    });

    // Roda do mouse (desktop)
    stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        menuViewerZoomBy(e.deltaY < 0 ? 0.2 : -0.2);
    }, { passive: false });

    // Botões de controle
    document.getElementById('viewer-zoom-in')?.addEventListener('click', () => menuViewerZoomBy(0.5));
    document.getElementById('viewer-zoom-out')?.addEventListener('click', () => menuViewerZoomBy(-0.5));
    document.getElementById('viewer-reset')?.addEventListener('click', menuViewerReset);
    document.getElementById('viewer-close-btn')?.addEventListener('click', menuViewerClose);
    document.getElementById('menu-viewer-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'menu-viewer-modal') menuViewerClose();
    });
}