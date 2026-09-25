/* ============================================================
 * OCR Menu Extractor — Cardápio Quatinga v3.2
 * ============================================================
 * Usa Tesseract.js (gratuito) para extrair o texto do cardápio
 * a partir da imagem cortada pelo ADM. Depois de extrair, o ADM
 * CONFIRMA/EDITA os pratos de cada dia num modal antes de salvar.
 * O texto confirmado vai junto com o cardápio pro Firestore,
 * e o funcionário vê o cardápio em TEXTO GRANDE (sem precisar
 * de zoom na imagem).
 * ============================================================ */

// ====== ESTADO GLOBAL DO OCR ======
const OCR = {
    DAYS: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    DAYS_DISPLAY: {
        segunda: 'Segunda-feira',
        terca: 'Terça-feira',
        quarta: 'Quarta-feira',
        quinta: 'Quinta-feira',
        sexta: 'Sexta-feira'
    },
    // Pratos extraídos (editáveis no modal): { segunda: 'texto', ... }
    extracted: {},
    // Copia da imagem (base64) usada no upload
    imageBase64: null
};

// Padrões que NÃO são comida (removidos da extração)
const NOISE_PATTERNS = [
    /card[áa]pio\s*(da\s*semana)?/gi,
    /sem[ai]na\s*de\s*\d+/gi,
    /dia[s]?\s*da\s*semana/gi,
    /pre[fo]rito(ra)?\s*de\s*mogi/gi,
    /departamento/gi,
    /secretaria/gi,
    /divis[ãa]o\s*de/gi,
    /seção\s*de/gi,
    /^[\W_]+$/g,               // só símbolos
    /^\d{1,2}[\/\-\.]\d{1,2}([\/\-\.]\d{2,4})?$/g, // datas soltas
    /^R\$\s*[\d,\.]+$/gi,       // preços
    /refei[çc][ãa]o\s*di[áa]ria/gi,
    /alimenta[çc][ãa]o\s*escolar/gi,
    /merenda/gi,
    /programa\s*de\s*alimenta/gi,
    /p[áa]gina\s*\d+/gi,
    /https?:\/\/\S+/gi
];

/* Remove linhas de ruído (não-comida) do texto extraído */
function ocrCleanLine(line) {
    let t = (line || '').trim();
    if (!t || t.length < 3) return '';
    for (const rx of NOISE_PATTERNS) {
        if (rx.test(t)) return '';
        rx.lastIndex = 0;
    }
    // Remove caracteres estranhos comuns de OCR
    t = t.replace(/[|]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    // Se depois da limpeza ficou muito curto, descarta
    if (t.length < 3) return '';
    return t;
}

/* Executa OCR na imagem (base64) com idioma português */
async function ocrRun(imageBase64) {
    if (typeof Tesseract === 'undefined') {
        throw new Error('Tesseract.js não carregado (verifique sua conexão na primeira vez).');
    }
    showToast('🔄 Lendo o cardápio... isso pode levar ~30s', 'info');
    const result = await Tesseract.recognize(imageBase64, 'por', {
        logger: m => {
            if (m.status === 'recognizing text') {
                const pct = Math.round(m.progress * 100);
                // Atualiza toast com progresso sem spammar
                showToast(`🔄 Lendo o cardápio... ${pct}%`, 'info');
            }
        }
    });
    const rawText = (result && result.data && result.data.text) ? result.data.text : '';
    return ocrParseDays(rawText);
}

/* Divide o texto cru em dias da semana e limpa o conteúdo */
function ocrParseDays(rawText) {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const found = {};
    OCR.DAYS.forEach(d => found[d] = []);

    // Mapeia variações de escrita de cada dia para o id canonical
    const dayRegexes = {
        segunda: /segunda[\s\-]*feira|segunda\b|^seg\.?$/i,
        terca:   /ter[çc]a[\s\-]*feira|ter[çc]a\b|^ter\.?$/i,
        quarta:  /quarta[\s\-]*feira|quarta\b|^qua\.?$/i,
        quinta:  /quinta[\s\-]*feira|quinta\b|^qui\.?$/i,
        sexta:   /sexta[\s\-]*feira|sexta\b|^sex\.?$/i
    };

    let currentDay = null;
    for (const line of lines) {
        let matchedDay = null;
        for (const [day, rx] of Object.entries(dayRegexes)) {
            if (rx.test(line)) { matchedDay = day; break; }
        }
        if (matchedDay) {
            currentDay = matchedDay;
            // Se a linha do dia já contém comida junto (ex: "Segunda: arroz...")
            const rest = line.replace(dayRegexes[matchedDay], '').replace(/^[\s:\-–—,]+/, '');
            const clean = ocrCleanLine(rest);
            if (clean && currentDay) found[currentDay].push(clean);
            continue;
        }
        if (currentDay) {
            const clean = ocrCleanLine(line);
            if (clean) found[currentDay].push(clean);
        }
    }

    // Junta linhas de cada dia num único texto de prato
    const out = {};
    OCR.DAYS.forEach(d => {
        out[d] = found[d].join('\n');
    });
    return out;
}

/* ====== MODAL DE CONFIRMAÇÃO (ADM edita antes de salvar) ====== */
function ocrShowConfirmModal(daysData) {
    OCR.extracted = daysData || {};
    const container = document.getElementById('ocr-days-container');
    if (!container) return;
    container.innerHTML = '';

    OCR.DAYS.forEach(day => {
        const label = OCR.DAYS_DISPLAY[day];
        const block = document.createElement('div');
        block.className = 'bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-3 border border-gray-200 dark:border-zinc-700';
        block.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="font-bold text-gray-800 dark:text-gray-100">📌 ${label}</span>
                <label class="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 cursor-pointer">
                    <input type="checkbox" data-ocr-day-check="${day}" class="accent-blue-600 w-4 h-4">
                    sem refeição (feriado)
                </label>
            </div>
            <textarea data-ocr-day-input="${day}" rows="3" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors" placeholder="Prato do dia (deixe vazio se não houver)">${OCR.extracted[day] || ''}</textarea>
        `;
        container.appendChild(block);
    });

    document.getElementById('ocr-modal').classList.remove('hidden');
}

/* Lê os valores editados no modal e devolve {dia: texto} */
function ocrCollectFromModal() {
    const out = {};
    OCR.DAYS.forEach(day => {
        const input = document.querySelector(`[data-ocr-day-input="${day}"]`);
        const check = document.querySelector(`[data-ocr-day-check="${day}"]`);
        let text = input ? input.value.trim() : '';
        const holiday = check && check.checked;
        out[day] = holiday ? '' : text;
    });
    return out;
}

/* ====== INTEGRAÇÃO COM O UPLOAD DO ADM ======
 * Chamado pelo botão "🔍 Extrair Texto (OCR)".
 * Depois que o ADM recorta a imagem, extrai e mostra o modal.
 */
async function ocrStartFromUpload() {
    try {
        // Usa a mesma imagem que está no preview (já recortada/comprimida)
        const preview = document.getElementById('imagePreview');
        if (!preview || !preview.src) {
            showToast('Selecione uma imagem primeiro.', 'error');
            return;
        }
        OCR.imageBase64 = preview.src;

        const daysData = await ocrRun(OCR.imageBase64);
        ocrShowConfirmModal(daysData);
    } catch (err) {
        console.error('OCR falhou:', err);
        showToast('❌ Falha no OCR: ' + err.message, 'error');
    }
}

/* Quando o ADM confirma o modal, guarda o texto extraído para
 * ser anexado ao cardápio quando ele salvar a próxima semana. */
function ocrConfirmAndStore() {
    const data = ocrCollectFromModal();
    OCR.extracted = data;
    // Expõe para o admin.js pegar no momento do upload
    window.__menuTextExtracted = data;
    document.getElementById('ocr-modal').classList.add('hidden');
    showToast('✅ Texto do cardápio salvo! Agora clique em "Salvar Cardápio para a Próxima Semana".', 'success');
}

/* ====== RENDERIZAÇÃO PARA O FUNCIONÁRIO ======
 * Mostra o cardápio em TEXTO (grandão, sem zoom).
 * Recebe menuData = { segunda: 'texto', ... } do Firestore.
 */
function renderMenuTextForUser(menuText) {
    const container = document.getElementById('menu-text-container');
    const list = document.getElementById('menu-text-list');
    if (!container || !list) return;

    if (!menuText || !OCR.DAYS.some(d => (menuText[d] || '').trim())) {
        container.classList.add('hidden');
        return;
    }

    const dayNames = { segunda: 'SEGUNDA', terca: 'TERÇA', quarta: 'QUARTA', quinta: 'QUINTA', sexta: 'SEXTA' };
    const dayIcons = { segunda: '🍛', terca: '🍲', quarta: '🥘', quinta: '🍝', sexta: '🐟' };

    list.innerHTML = '';
    OCR.DAYS.forEach(day => {
        const text = (menuText[day] || '').trim();
        const row = document.createElement('div');
        row.className = 'flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-700 transition-colors';
        if (!text) {
            row.innerHTML = `
                <span class="text-2xl shrink-0">🎉</span>
                <div class="flex-1">
                    <div class="font-bold text-gray-700 dark:text-gray-200">${dayNames[day]}</div>
                    <div class="text-sm text-gray-400 dark:text-gray-500 font-medium">Sem refeição (feriado)</div>
                </div>`;
        } else {
            row.innerHTML = `
                <span class="text-2xl shrink-0">${dayIcons[day]}</span>
                <div class="flex-1">
                    <div class="font-bold text-gray-700 dark:text-gray-200">${dayNames[day]}</div>
                    <div class="text-gray-600 dark:text-gray-300 font-medium" style="white-space:pre-line">${text}</div>
                </div>`;
        }
        list.appendChild(row);
    });

    container.classList.remove('hidden');
}

/* ====== TTS: LER O CARDÁPIO EM VOZ ALTA ====== */
function speakMenuText(menuText) {
    if (!('speechSynthesis' in window)) {
        showToast('Seu dispositivo não suporta leitura em voz alta.', 'error');
        return;
    }
    // Se já está falando, para (botão vira pause)
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        showToast('⏹️ Leitura interrompida', 'info');
        return;
    }
    const parts = [];
    OCR.DAYS.forEach(day => {
        const text = (menuText[day] || '').trim();
        if (text) parts.push(`${OCR.DAYS_DISPLAY[day]}. ${text.replace(/\n/g, '. ')}`);
    });
    if (!parts.length) {
        showToast('Não há cardápio em texto para ler.', 'info');
        return;
    }
    const utter = new SpeechSynthesisUtterance(parts.join('. '));
    utter.lang = 'pt-BR';
    utter.rate = 0.9;
    speechSynthesis.speak(utter);
}
