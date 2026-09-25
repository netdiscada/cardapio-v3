/* ============================================================
 * Gemini Vision OCR — Cardápio Quatinga v3.2
 * ============================================================
 * Usa Gemini 2.0 Flash (free tier: 1500 req/dia) para ler
 * cardápios de foto/tabela. Configurável no painel ADM.
 * ============================================================ */

const GEMINI_OCR = {
    DAYS: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
    DAYS_DISPLAY: {
        segunda: 'Segunda-feira',
        terca: 'Terça-feira',
        quarta: 'Quarta-feira',
        quinta: 'Quinta-feira',
        sexta: 'Sexta-feira'
    },
    // Modelo Gemini (configurável via ADM) - v1beta usa modelos 2.5 (2025)
    model: 'gemini-2.5-flash',
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    // Prompt otimizado para cardápios brasileiros
    prompt: `Você é um leitor de cardápios escolares/empresariais brasileiros.
Extraia APENAS os pratos principais de cada dia útil (segunda a sexta).

REGRAS:
1. Retorne JSON EXATO com chaves: "segunda", "terca", "quarta", "quinta", "sexta"
2. Cada valor = string com o prato do dia (pode ter quebras de linha)
3. Se não houver refeição no dia (feriado), valor = ""
4. IGNORE: cabeçalhos, datas, logotipos, observações, "arroz e feijão", sobremesas, "opção vegetariana", guarnições genéricas
5. FOCO: proteína principal + acompanhamento específico (ex: "Frango xadrez com arroz e brócolis")
6. Se a imagem estiver ilegível, retorne strings vazias
7. NÃO inclua markdown, NÃO explique, SÓ o JSON

Exemplo de saída:
{
  "segunda": "Frango xadrez com arroz e brócolis",
  "terca": "Carne moída com purê de batata",
  "quarta": "Peixe ao molho com legumes",
  "quinta": "",
  "sexta": "Macarronada com carne"
}`

};

/* Carrega config salva (localStorage + Firestore) */
async function geminiOcrLoadConfig() {
    // localStorage primeiro (rápido, offline)
    const local = localStorage.getItem('gemini_ocr_config');
    if (local) {
        try {
            const cfg = JSON.parse(local);
            GEMINI_OCR.apiKey = cfg.apiKey || '';
            GEMINI_OCR.model = cfg.model || 'gemini-2.0-flash';
            GEMINI_OCR.prompt = cfg.prompt || GEMINI_OCR.prompt;
        } catch (e) { /* ignora */ }
    }
    // Tenta sincronizar do Firestore se online e logado
    if (typeof global !== 'undefined' && global.db && navigator.onLine) {
        try {
            const snap = await global.db.collection('appConfig').doc('gemini_ocr').get();
            if (snap.exists) {
                const cfg = snap.data();
                if (cfg.apiKey) GEMINI_OCR.apiKey = cfg.apiKey;
                if (cfg.model) GEMINI_OCR.model = cfg.model;
                if (cfg.prompt) GEMINI_OCR.prompt = cfg.prompt;
                // Atualiza localStorage
                localStorage.setItem('gemini_ocr_config', JSON.stringify({
                    apiKey: GEMINI_OCR.apiKey,
                    model: GEMINI_OCR.model,
                    prompt: GEMINI_OCR.prompt
                }));
            }
        } catch (e) { /* offline ou sem permissão */ }
    }
}

/* Salva config (localStorage + Firestore) */
async function geminiOcrSaveConfig(cfg) {
    GEMINI_OCR.apiKey = cfg.apiKey || '';
    GEMINI_OCR.model = cfg.model || 'gemini-2.0-flash';
    GEMINI_OCR.prompt = cfg.prompt || GEMINI_OCR.prompt;

    localStorage.setItem('gemini_ocr_config', JSON.stringify({
        apiKey: GEMINI_OCR.apiKey,
        model: GEMINI_OCR.model,
        prompt: GEMINI_OCR.prompt
    }));

    // Persiste no Firestore (collection appConfig, doc gemini_ocr)
    if (typeof global !== 'undefined' && global.db && navigator.onLine) {
        try {
            await global.db.collection('appConfig').doc('gemini_ocr').set({
                apiKey: GEMINI_OCR.apiKey,
                model: GEMINI_OCR.model,
                prompt: GEMINI_OCR.prompt,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (e) { /* silencioso */ }
    }
}

/* Converte base64 para formato Gemini (inlineData) */
function geminiBase64ToInline(base64) {
    // Remove prefixo data:image/...;base64,
    const match = base64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return { mime_type: 'image/jpeg', data: base64 };
    return { mime_type: 'image/' + match[1], data: match[2] };
}

/* Chama Gemini Vision */
async function geminiOcrRun(imageBase64) {
    if (!GEMINI_OCR.apiKey) {
        throw new Error('API Key do Gemini não configurada. Vá em Configurações → Gemini OCR.');
    }
    showToast('🤖 Enviando para Gemini Vision...', 'info');

    const inline = geminiBase64ToInline(imageBase64);
    const body = {
        contents: [{
            parts: [
                { text: GEMINI_OCR.prompt },
                { inline_data: inline }
            ]
        }],
        generationConfig: {
            temperature: 0.1,
            topK: 1,
            topP: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'
        }
    };

    const url = `${GEMINI_OCR.baseUrl}/${GEMINI_OCR.model}:generateContent?key=${GEMINI_OCR.apiKey}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.text();
        let msg = 'Gemini erro ' + res.status + ': ' + err.slice(0, 200);
        if (res.status === 400 && err.includes('API_KEY')) msg = 'API Key inválida ou expirada.';
        if (res.status === 403 && err.includes('unregistered')) msg = 'API não habilitada no projeto. Vá em: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?project=SEU_PROJETO → "Ativar"';
        if (res.status === 429) msg = 'Limite diário atingido (1.500 req/dia grátis). Tente amanhã ou use outro projeto/key.';
        throw new Error(msg);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Resposta vazia do Gemini.');

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        // Tenta extrair JSON do meio do texto
        const match = text.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error('Resposta não é JSON válido: ' + text.slice(0, 200));
    }

    // Normaliza: garante todas as chaves existem
    const out = {};
    GEMINI_OCR.DAYS.forEach(d => out[d] = (parsed[d] || '').trim());
    return out;
}

/* ====== MODAL DE CONFIRMAÇÃO (ADM edita antes de salvar) ====== */
function geminiOcrShowConfirmModal(daysData) {
    const container = document.getElementById('gemini-ocr-days-container');
    if (!container) return;
    container.innerHTML = '';

    GEMINI_OCR.DAYS.forEach(day => {
        const label = GEMINI_OCR.DAYS_DISPLAY[day];
        const block = document.createElement('div');
        block.className = 'bg-gray-50 dark:bg-zinc-800/50 rounded-xl p-3 border border-gray-200 dark:border-zinc-700';
        block.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="font-bold text-gray-800 dark:text-gray-100">📌 ${label}</span>
                <label class="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 cursor-pointer">
                    <input type="checkbox" data-gemini-day-check="${day}" class="accent-blue-600 w-4 h-4">
                    sem refeição (feriado)
                </label>
            </div>
            <textarea data-gemini-day-input="${day}" rows="3" class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors" placeholder="Prato do dia (deixe vazio se não houver)">${daysData[day] || ''}</textarea>
        `;
        container.appendChild(block);
    });

    document.getElementById('gemini-ocr-modal').classList.remove('hidden');
}

/* Lê valores editados no modal */
function geminiOcrCollectFromModal() {
    const out = {};
    GEMINI_OCR.DAYS.forEach(day => {
        const input = document.querySelector(`[data-gemini-day-input="${day}"]`);
        const check = document.querySelector(`[data-gemini-day-check="${day}"]`);
        let text = input ? input.value.trim() : '';
        const holiday = check && check.checked;
        out[day] = holiday ? '' : text;
    });
    return out;
}

/* ====== ENTRY POINT: chamado pelo botão "🤖 Ler com Gemini" ====== */
async function geminiOcrStartFromUpload() {
    try {
        const preview = document.getElementById('imagePreview');
        if (!preview || !preview.src) {
            showToast('Selecione e recorte uma imagem primeiro.', 'error');
            return;
        }
        const daysData = await geminiOcrRun(preview.src);
        geminiOcrShowConfirmModal(daysData);
    } catch (err) {
        console.error('Gemini OCR falhou:', err);
        showToast('❌ ' + err.message, 'error');
    }
}

/* Confirma e guarda para o upload */
function geminiOcrConfirmAndStore() {
    const data = geminiOcrCollectFromModal();
    window.__menuTextExtracted = data;
    document.getElementById('gemini-ocr-modal').classList.add('hidden');
    showToast('✅ Texto do cardápio salvo! Agora clique em "Salvar Cardápio para a Próxima Semana".', 'success');
}

/* ====== ABA DE CONFIGURAÇÕES (adicionada ao painel ADM) ====== */
function geminiOcrRenderSettingsTab() {
    const tab = document.getElementById('gemini-ocr-settings-content');
    if (!tab) return;
    tab.innerHTML = `
        <div class="space-y-4">
            <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <h3 class="font-bold text-blue-800 dark:text-blue-300 mb-2">🤖 Gemini Vision OCR</h3>
                <p class="text-sm text-blue-700 dark:text-blue-400 mb-4">Configure a API Key para leitura automática de cardápios por IA. Free tier: 1.500 req/dia.</p>
                <div class="space-y-3">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">API Key do Google AI Studio</label>
                        <input type="password" id="gemini-api-key-input" value="${GEMINI_OCR.apiKey || ''}" placeholder="Cole sua API Key aqui (get: aistudio.google.com)" class="w-full px-3 py-2 border border-gray-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors font-mono text-sm">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Nunca commitada. Salva no localStorage + Firestore (appConfig/gemini_ocr).</p>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Modelo</label>
                        <select id="gemini-model-select" class="w-full px-3 py-2 border border-gray-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors">
                            <option value="gemini-2.5-flash" ${GEMINI_OCR.model === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash (recomendado, 1.500/dia grátis, estável)</option>
                            <option value="gemini-2.5-pro" ${GEMINI_OCR.model === 'gemini-2.5-pro' ? 'selected' : ''}>gemini-2.5-pro (50/dia grátis, mais preciso)</option>
                        </select>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Modelos 1.5 removidos da API v1beta. Use 2.5-flash ou 2.5-pro.</p>
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Prompt (avançado)</label>
                        <textarea id="gemini-prompt-textarea" rows="6" class="w-full px-3 py-2 border border-gray-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors font-mono text-xs" placeholder="Prompt personalizado...">${GEMINI_OCR.prompt}</textarea>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">JSON com chaves: segunda, terca, quarta, quinta, sexta.</p>
                    </div>
                    <button id="gemini-save-config-btn" class="w-full bg-blue-600 dark:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors cursor-pointer">💾 Salvar Configuração</button>
                    <button id="gemini-test-btn" class="w-full bg-purple-600 dark:bg-purple-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors cursor-pointer mt-2">🧪 Testar Conexão</button>
                </div>
            </div>
            <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                <h3 class="font-bold text-green-800 dark:text-green-300 mb-2">📋 Como usar</h3>
                <ol class="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
                    <li>Vá em <a href="https://aistudio.google.com/apikey" target="_blank" class="text-blue-600 hover:underline">Google AI Studio</a> → "Create API Key"</li>
                    <li>Cole a key acima e salve</li>
                    <li>No upload do cardápio: recorte a imagem → clique "🤖 Ler com Gemini"</li>
                    <li>Confira/edite os pratos no modal → "Salvar Texto do Cardápio"</li>
                    <li>Depois clique "Salvar Cardápio para a Próxima Semana" (imagem + texto vão juntos)</li>
                </ol>
            </div>
        </div>
    `;

    // Handlers
    document.getElementById('gemini-save-config-btn')?.addEventListener('click', async () => {
        const cfg = {
            apiKey: document.getElementById('gemini-api-key-input')?.value?.trim() || '',
            model: document.getElementById('gemini-model-select')?.value || 'gemini-2.0-flash',
            prompt: document.getElementById('gemini-prompt-textarea')?.value?.trim() || GEMINI_OCR.prompt
        };
        await geminiOcrSaveConfig(cfg);
        showToast('✅ Configuração salva (local + Firestore)', 'success');
    });

    document.getElementById('gemini-test-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('gemini-test-btn');
        btn.disabled = true;
        btn.textContent = '🔄 Testando...';
        try {
            // Teste leve: countTokens (consome menos quota que generateContent)
            const res = await fetch(`${GEMINI_OCR.baseUrl}/${GEMINI_OCR.model}:countTokens?key=${GEMINI_OCR.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'teste' }] }]
                })
            });
            if (res.ok) {
                showToast('✅ Conexão OK! API Key válida e Generative Language API ativada.', 'success');
            } else {
                const err = await res.json();
                const msg = err.error?.message || 'Erro desconhecido';
                if (res.status === 403 && msg.includes('unregistered')) {
                    showToast('❌ 403: API "Generative Language API" NÃO ATIVADA. Ative em: console.cloud.google.com → APIs → Generative Language API', 'error', 15000);
                } else if (res.status === 400 && msg.includes('API_KEY')) {
                    showToast('❌ API Key inválida ou mal formada.', 'error');
                } else if (res.status === 429) {
                    showToast('⚠️ Limite diário atingido (1.500 req/dia). Tente amanhã.', 'error');
                } else {
                    showToast('❌ ' + res.status + ': ' + msg.slice(0, 200), 'error');
                }
            }
        } catch (e) {
            showToast('❌ Erro de rede: ' + e.message, 'error');
        }
        finally {
            btn.disabled = false;
            btn.textContent = '🧪 Testar Conexão';
        }
    });
}