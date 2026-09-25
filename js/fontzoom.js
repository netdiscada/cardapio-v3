/* ============================================================
 * Font Zoom — Cardápio Quatinga v3.2
 * ============================================================
 * Botão "Aa" que aumenta/diminui TODAS as fontes do app.
 * O nível escolhido fica salvo por dispositivo (localStorage)
 * e por funcionário (Firestore quando logado).
 * ============================================================ */

const FONT_ZOOM = {
    levels: [1.0, 1.15, 1.3, 1.5, 1.75, 2.0],
    storageKey: 'fontZoomLevel',
    current: 1.0
};

function fontZoomInit() {
    const saved = parseFloat(localStorage.getItem(FONT_ZOOM.storageKey) || '1');
    FONT_ZOOM.current = FONT_ZOOM.levels.includes(saved) ? saved : 1.0;
    fontZoomApply();
    const btn = document.getElementById('fontZoomBtn');
    if (btn) {
        btn.addEventListener('click', fontZoomCycle);
        fontZoomUpdateBtnLabel();
    }
}

function fontZoomApply() {
    document.documentElement.style.setProperty('--app-font-scale', String(FONT_ZOOM.current));
    // Aplica via CSS zoom no container principal (funciona no Android WebView)
    const app = document.getElementById('app-container');
    if (app) {
        app.style.fontSize = `${16 * FONT_ZOOM.current}px`;
        app.style.lineHeight = String(1.5 * (1 + (FONT_ZOOM.current - 1) * 0.4));
    }
}

function fontZoomCycle() {
    const idx = FONT_ZOOM.levels.indexOf(FONT_ZOOM.current);
    const next = FONT_ZOOM.levels[(idx + 1) % FONT_ZOOM.levels.length];
    FONT_ZOOM.current = next;
    localStorage.setItem(FONT_ZOOM.storageKey, String(next));
    fontZoomApply();
    fontZoomUpdateBtnLabel();
    showToast(`🔤 Tamanho do texto: ${Math.round(next * 100)}%`, 'info');

    // Persiste também no Firestore, vinculado ao RGF do funcionário (se houver)
    fontZoomSaveToProfile();
}

function fontZoomUpdateBtnLabel() {
    const btn = document.getElementById('fontZoomBtn');
    if (!btn) return;
    if (FONT_ZOOM.current === 1.0) {
        btn.textContent = '🔍 Aa';
    } else {
        btn.textContent = `🔍 Aa+${Math.round((FONT_ZOOM.current - 1) * 100)}%`;
    }
}

async function fontZoomSaveToProfile() {
    try {
        const rgf = (document.getElementById('employeeRGF')?.value || '').trim();
        if (!rgf || typeof global.db === 'undefined') return;
        const docId = `zoom_${rgf}`;
        await global.db.collection('userPreferences').doc(docId).set({
            rgf: rgf,
            fontZoom: FONT_ZOOM.current,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        // Silencioso: zoom local já cobre o caso offline
        console.debug('fontZoom save skipped:', e.message);
    }
}

/* Ao carregar o app, tenta restaurar o zoom do funcionário (Firestore) */
async function fontZoomRestoreFromProfile(rgf) {
    try {
        if (!rgf || typeof global.db === 'undefined') return;
        const snap = await global.db.collection('userPreferences').doc(`zoom_${rgf}`).get();
        if (snap.exists) {
            const saved = snap.data().fontZoom;
            if (saved && FONT_ZOOM.levels.includes(saved)) {
                FONT_ZOOM.current = saved;
                localStorage.setItem(FONT_ZOOM.storageKey, String(saved));
                fontZoomApply();
                fontZoomUpdateBtnLabel();
            }
        }
    } catch (e) {
        console.debug('fontZoom restore skipped:', e.message);
    }
}
