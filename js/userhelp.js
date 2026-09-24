// Cardapio Quatinga v3.2 - userhelp.js
// Abas do funcionario: Feriados, Pagamento (com consulta RGF), Ponto.
// Dados embutidos do calendario administrativo e escala de pagamento de Mogi das Cruzes (2026).

(function (global) {
  // ===== Feriados e pontos facultativos 2026 (prefeitura de Mogi das Cruzes) =====
  // 'data' usa o ano implicito 2026; o ultimo item e 01/01/2027.
  const HOLIDAYS_2026 = [
    { data: '01/01', evento: 'Dia da Confraternização Universal e da Paz', dia: 'Quinta' },
    { data: '02/01', evento: 'Facultativo', dia: 'Sexta' },
    { data: '16/02', evento: 'Facultativo', dia: 'Segunda' },
    { data: '17/02', evento: 'Carnaval', dia: 'Terça' },
    { data: '18/02', evento: 'Cinzas (Ponto Facultativo até 13h)', dia: 'Quarta' },
    { data: '03/04', evento: 'Paixão de Cristo', dia: 'Sexta' },
    { data: '20/04', evento: 'Facultativo', dia: 'Segunda' },
    { data: '21/04', evento: 'Tiradentes', dia: 'Terça' },
    { data: '01/05', evento: 'Dia do Trabalho', dia: 'Sexta' },
    { data: '04/06', evento: 'Corpus Christi', dia: 'Quinta' },
    { data: '05/06', evento: 'Facultativo', dia: 'Sexta' },
    { data: '09/07', evento: 'Data Magna do Estado de São Paulo', dia: 'Quinta' },
    { data: '10/07', evento: 'Facultativo', dia: 'Sexta' },
    { data: '26/07', evento: 'N. S. de Sant\'Ana - Padroeira da Cidade', dia: 'Domingo' },
    { data: '31/08', evento: 'Facultativo', dia: 'Segunda' },
    { data: '01/09', evento: 'Aniversário da Cidade', dia: 'Terça' },
    { data: '07/09', evento: 'Independência', dia: 'Segunda' },
    { data: '12/10', evento: 'Nossa Senhora Aparecida', dia: 'Segunda' },
    { data: '30/10', evento: 'Dia do Servidor Público', dia: 'Sexta' },
    { data: '02/11', evento: 'Finados', dia: 'Segunda' },
    { data: '15/11', evento: 'Proclamação da República', dia: 'Domingo' },
    { data: '20/11', evento: 'Consciência Negra', dia: 'Sexta' },
    { data: '24/12', evento: 'Véspera de Natal', dia: 'Quinta' },
    { data: '25/12', evento: 'Natal', dia: 'Sexta' },
    { data: '31/12', evento: 'Véspera de Ano Novo', dia: 'Quinta' },
    { data: '01/01/2027', evento: 'Dia da Confraternização Universal e da Paz', dia: 'Sexta' }
  ];

  // ===== Escala de pagamento 2026 (dia do pagamento e do adiantamento) =====
  const PAYMENT_2026 = [
    { mes: 'Janeiro', pag: 7, adi: 20 },
    { mes: 'Fevereiro', pag: 6, adi: 20 },
    { mes: 'Março', pag: 6, adi: 20 },
    { mes: 'Abril', pag: 7, adi: 17 },
    { mes: 'Maio', pag: 7, adi: 20 },
    { mes: 'Junho', pag: 3, adi: 19 },
    { mes: 'Julho', pag: 6, adi: 20 },
    { mes: 'Agosto', pag: 6, adi: 20 },
    { mes: 'Setembro', pag: 4, adi: 18 },
    { mes: 'Outubro', pag: 6, adi: 20 },
    { mes: 'Novembro', pag: 6, adi: 19 },
    { mes: 'Dezembro', pag: 6, adi: 18 }
  ];

  const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const PREFEITURA_API = "https://dadosadm.mogidascruzes.sp.gov.br/api";

  // ===== Render: Feriados =====
  function renderUserHolidays() {
    const listEl = document.getElementById('user-holidays-list');
    if (!listEl) return;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const anoAtual = hoje.getFullYear();
    let proximoIdx = -1;
    let html = '';
    HOLIDAYS_2026.forEach((f, i) => {
      // converte dd/mm(yyyy?) para Date
      const parts = f.data.split('/');
      const d = new Date(parseInt(parts[2] || anoAtual, 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      const passou = d < hoje;
      if (!passou && proximoIdx === -1) proximoIdx = i;
      const destaque = i === proximoIdx ? ' ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900/20' : (passou ? ' opacity-50' : '');
      const badge = i === proximoIdx ? '<span class="ml-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">PRÓXIMO</span>' : '';
      const facilito = /facultativo/i.test(f.evento) || /Facultativo/.test(f.evento);
      html += `<div class="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-100 dark:border-zinc-800${destaque}">
        <div class="min-w-0"><p class="font-bold text-sm text-gray-800 dark:text-gray-100 truncate">${f.evento}${badge}</p></div>
        <div class="text-right whitespace-nowrap"><p class="text-sm font-bold ${facilito ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}">${f.data}</p><p class="text-[10px] text-gray-400">${f.dia}</p></div>
      </div>`;
    });
    // Cartao do proximo feriado no topo
    if (proximoIdx >= 0) {
      const f = HOLIDAYS_2026[proximoIdx];
      const parts = f.data.split('/');
      const d = new Date(parseInt(parts[2] || anoAtual, 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      const dias = Math.ceil((d - hoje) / 86400000);
      html = `<div class="rounded-xl p-4 mb-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50 text-center">
        <p class="text-xs font-bold text-blue-500 uppercase tracking-wide">Próximo feriado/ponto facultativo</p>
        <p class="text-lg font-bold text-blue-800 dark:text-blue-200 mt-1">${f.data} · ${f.dia}</p>
        <p class="text-sm font-semibold text-blue-600 dark:text-blue-300">${f.evento}</p>
        <p class="text-xs text-blue-500 dark:text-blue-400 mt-1">${dias === 0 ? 'É HOJE!' : dias === 1 ? 'É amanhã!' : `Faltam ${dias} dias`}</p>
      </div>` + html;
    }
    listEl.innerHTML = html;
  }

  // ===== Render: Pagamento =====
  function renderUserPayment() {
    const tableEl = document.getElementById('user-payment-table');
    const nextEl = document.getElementById('user-next-payment');
    if (!tableEl) return;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    let html = '';
    let proximo = null;
    PAYMENT_2026.forEach((p, i) => {
      const dPag = new Date(2026, i, p.pag);
      const dAdi = new Date(2026, i, p.adi);
      const passou = dPag < hoje && dAdi < hoje;
      if (!passou && !proximo) proximo = { ...p, idx: i };
      const isCurrentMonth = hoje.getMonth() === i && hoje.getFullYear() === 2026;
      const destaque = isCurrentMonth ? ' ring-2 ring-green-400' : (passou ? ' opacity-50' : '');
      html += `<div class="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-100 dark:border-zinc-800${destaque}">
        <p class="font-bold text-sm text-gray-800 dark:text-gray-100">${p.mes}</p>
        <div class="flex gap-3 text-sm">
          <span class="font-bold text-green-700 dark:text-green-400">💵 ${String(p.pag).padStart(2, '0')}</span>
          <span class="font-bold text-blue-600 dark:text-blue-400">⏩ ${String(p.adi).padStart(2, '0')}</span>
        </div>
      </div>`;
    });
    tableEl.innerHTML = html;
    // Cartao do proximo pagamento
    if (nextEl && proximo) {
      const dPag = new Date(2026, proximo.idx, proximo.pag);
      const dAdi = new Date(2026, proximo.idx, proximo.adi);
      const target = dAdi >= hoje && dAdi <= dPag ? dAdi : dPag; // o mais proximo dos dois
      const isAdi = target.getTime() === dAdi.getTime();
      const dias = Math.ceil((target - hoje) / 86400000);
      const label = isAdi ? 'Adiantamento' : 'Pagamento';
      nextEl.innerHTML = `<p class="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide">Próximo ${label}</p>
        <p class="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">Dia ${String(target.getDate()).padStart(2, '0')}/${MES_ABREV[target.getMonth()]}</p>
        <p class="text-xs text-green-600 dark:text-green-400 mt-1 font-semibold">${dias === 0 ? 'É HOJE!' : dias === 1 ? 'É amanhã!' : `Faltam ${dias} dias`}</p>`;
      nextEl.classList.remove('hidden');
    }
  }

  // ===== Abas do funcionario =====
  function bindUserTabs() {
    const nav = document.getElementById('user-tabs');
    if (!nav) return;

    const showUserPanel = (name) => {
      // Esconde o conteudo principal do cardapio quando sai da aba menu
      const menuContent = document.getElementById('form-container');
      const menuSections = document.querySelectorAll('#user-view > [data-user-panel], #user-view > section[data-user-panel]');
      document.querySelectorAll('#user-view section[data-user-panel]').forEach(sec => {
        sec.classList.toggle('hidden', sec.dataset.userPanel !== name);
      });
      // aba menu = mostra o fluxo normal (form-container), outras = escondem
      if (menuContent) menuContent.classList.toggle('hidden', name !== 'menu');
      // atualiza botoes
      document.querySelectorAll('#user-tabs .admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.userTab === name);
      });
      global.__state.userActiveTab = name;
    };

    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-tab-btn');
      if (!btn) return;
      showUserPanel(btn.dataset.userTab);
    });

    showUserPanel(global.__state.userActiveTab || 'menu');
  }

  // ===== Consulta RGF (funcionario) =====
  function fmtMoneyUser(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    if (isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function fmtDateUser(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
  }

  function userRgfSetStatus(msg, type) {
    const el = document.getElementById('user-rgf-consult-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'mb-4 text-sm font-semibold ' + (type === 'error' ? 'text-red-600 dark:text-red-400'
      : type === 'loading' ? 'text-blue-600 dark:text-blue-400'
      : 'text-green-600 dark:text-green-400');
  }

  function userRgfRender(latest, verbas) {
    const resultEl = document.getElementById('user-rgf-consult-result');
    if (!resultEl) return;
    const badge = latest.situacao === 'Ativo'
      ? '<span class="inline-block px-2 py-0.5 text-xs font-bold rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Ativo</span>'
      : `<span class="inline-block px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">${latest.situacao || 'Inativo'}</span>`;
    let html = `
      <div class="rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
        <div class="bg-blue-600 dark:bg-blue-500 px-4 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="text-white/80 text-[10px] font-semibold uppercase tracking-wide">Matrícula ${latest.matricula}</p>
              <h3 class="text-lg font-bold text-white leading-tight truncate">${latest.nome}</h3>
            </div>
            ${badge}
          </div>
        </div>
        <div class="p-4 space-y-2 bg-white dark:bg-zinc-900">
          <div class="flex justify-between gap-2 text-sm"><span class="text-gray-500 dark:text-gray-400">Função</span><span class="font-semibold text-gray-800 dark:text-gray-100 text-right">${latest.cargo || '—'}</span></div>
          <div class="flex justify-between gap-2 text-sm"><span class="text-gray-500 dark:text-gray-400">Local</span><span class="font-semibold text-gray-800 dark:text-gray-100 text-right">${latest.localtrabalho || '—'}</span></div>
          <div class="flex justify-between gap-2 text-sm"><span class="text-gray-500 dark:text-gray-400">Competência</span><span class="font-semibold text-gray-800 dark:text-gray-100">${MES_ABREV[(latest.mes || 1) - 1]}/${latest.ano}</span></div>
          <div class="flex justify-between gap-2 text-sm"><span class="text-gray-500 dark:text-gray-400">Bruto</span><span class="font-bold text-green-700 dark:text-green-400">${fmtMoneyUser(latest.bruto)}</span></div>
          <div class="flex justify-between gap-2 text-sm"><span class="text-gray-500 dark:text-gray-400">Líquido</span><span class="font-bold text-blue-700 dark:text-blue-400">${fmtMoneyUser(latest.liquido)}</span></div>
        </div>
      </div>`;
    if (verbas && verbas.length > 0) {
      const rend = verbas.filter(v => v.tipoVerba === 'Rendimentos');
      const desc = verbas.filter(v => v.tipoVerba === 'Descontos');
      const row = (v) => `<div class="flex justify-between gap-2 py-1 text-sm border-b border-gray-100 dark:border-zinc-800"><span class="text-gray-700 dark:text-gray-300 flex-1">${v.desnoverba}</span><span class="font-bold ${v.tipoVerba === 'Rendimentos' ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'} whitespace-nowrap">${v.tipoVerba === 'Rendimentos' ? '+' : '−'} ${fmtMoneyUser(Math.abs(parseFloat(v.valorverba)))}</span></div>`;
      html += `
        <div class="rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <h4 class="font-bold text-gray-800 dark:text-gray-100 mb-2 text-sm">Contracheque ${MES_ABREV[(latest.mes || 1) - 1]}/${latest.ano}</h4>
          ${rend.map(row).join('')}
          ${desc.map(row).join('')}
          <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-right">fonte: portal da transparência</p>
        </div>`;
    }
    resultEl.innerHTML = html;
  }

  async function handleUserRgfConsult(e) {
    e.preventDefault();
    const input = document.getElementById('user-rgf-consult-input');
    const resultEl = document.getElementById('user-rgf-consult-result');
    const btn = document.getElementById('user-rgf-consult-btn');
    if (!input || !resultEl) return;
    const rgf = input.value.trim().replace(/\D/g, '');
    if (!rgf) { userRgfSetStatus('Digite um RGF para consultar.', 'error'); return; }

    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Consultando...';
    resultEl.innerHTML = '';
    userRgfSetStatus('Consultando RGF ' + rgf + '...', 'loading');
    try {
      const anoAtual = new Date().getFullYear();
      let results = [];
      for (let ano = anoAtual; ano >= anoAtual - 8 && results.length === 0; ano--) {
        const resp = await fetch(`${PREFEITURA_API}/folha_pagamento?matricula=${rgf}&ano=${ano}`);
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.results && data.results.length > 0) results = data.results;
      }
      if (results.length === 0) {
        userRgfSetStatus('Nenhum registro encontrado para o RGF ' + rgf + '.', 'error');
        return;
      }
      const mensais = results.filter(r => r.tipo_folha === 'Folha de Pagamento Mensal');
      const pool = mensais.length > 0 ? mensais : results;
      const latest = pool.reduce((a, b) => ((b.ano * 12 + b.mes) > (a.ano * 12 + a.mes) ? b : a));
      userRgfSetStatus(`${latest.nome} — competência ${MES_ABREV[(latest.mes || 1) - 1]}/${latest.ano}.`, 'success');

      let verbas = null;
      try {
        const respF = await fetch(`${PREFEITURA_API}/detalhe_folha?idfunselec=${latest.idfunselec}`);
        if (respF.ok) {
          const fd = await respF.json();
          if (fd.results && fd.results.length > 0) verbas = fd.results;
        }
      } catch (_) { /* detalhe opcional */ }

      userRgfRender(latest, verbas);
    } catch (err) {
      userRgfSetStatus('Erro na consulta: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function bindUserRgfConsult() {
    const form = document.getElementById('user-rgf-consult-form');
    if (!form) return;
    form.addEventListener('submit', handleUserRgfConsult);
  }

  // ===== Boot =====
  function initUserHelp() {
    renderUserHolidays();
    renderUserPayment();
    bindUserTabs();
    bindUserRgfConsult();
  }

  global.initUserHelp = initUserHelp;
})(window);
