# Cardápio Quatinga v2 — Especificação de PORT (reestruturação modular)

## Objetivo
Reestruturar o app v1.x (hoje UM único `index.html` de 1672 linhas) em um projeto v2 **MODULAR** em JavaScript puro (arquivos separados, SEM build/transpilador/framework). É um PORT: comportamento **100% idêntico** ao original. NÃO mudar feature, NÃO mudar modelo de dados, NÃO trocar Firebase config, admin UID, mealOptions, weekDays nem lógica de rotação.

## Referência
- Fonte da verdade: `C:/Users/menin/cardapio-v2/ref-1x/index.html` (1672 linhas, ~113KB — leia em chunks com read_file; confira cada função no arquivo antes de portar).
- Pasta destino: `C:/Users/menin/cardapio-v2/app` (crie; vazia).

## Regras absolutas
1. Gere TODOS os arquivos com `write_file`. NUNCA use cat/heredoc no shell.
2. Para cada função do 1.x, leia o código original e porte-o fielmente (comportamento idêntico).
3. Responda em português.

## Contexto do app (pra orientar; SEMPRE confira no index.html)
PWA de cardápio semanal ("Cardápio Quatinga" / "Delícias Urbanas"). Firebase: Auth anônima + Firestore, jsPDF+autotable, cropperjs, Tailwind CDN, browser-image-compression. Admin envia imagem do cardápio da próxima semana (cropper → compressão <=0.45MB → base64 em `cardapio/semanal`), marca feriados, gerencia funcionários (docId=RGF, campo `nome`) e pedidos (coleção `pedidosDaSemana`). Na segunda o app rotaciona (`targetRotationDate`) promovendo a próxima semana e apagando pedidos atuais. Funcionário digita RGF → autofill nome → wizard de Seg a Sex escolhe de 4 opções → grava pedido. Admin gera PDF (jsPDF+autotable) e compartilha via WhatsApp. Login admin email/password comparando `user.uid` com `APP_CONFIG.ADMIN_UID='LqAXao4FuOQAvzS3uQAd9et6OnK2'`.

Constantes quentes: `weekDays=['Segunda-feira',...,'Sexta-feira']`, `mealOptions` (4 opções), `firebaseConfig.projectId='cardapio-8ddea'`.

Funções-chave do 1.x (indica o que portar): `autoTurnWeek` (transaction read-write com lock + `metadata.fromCache`), `turnWeek` manual, `loadAndDisplayMenu`, `checkExistingOrder`, `submitOrder`, `renderOrdersTable`, `openEditOrderModal`, `generateAndShareReport`, `loadAndRenderEmployees`, `handleAddEmployee`, `handleAdminLogin`, `loadAdminData`, `renderWizardStep`, `renderHolidayCheckboxes`, `setupPWA`.

## Estrutura de saída (criar em `C:/Users/menin/cardapio-v2/app`)
- `index.html` — casca fina: estrutura HTML completa (todas as seções/modais/tabelas exatamente como no 1.x), carrega o CSS e os scripts modulares na ordem correta. Scripts clássicos, SEM `type=module`, pra funcionar via `file://` e GitHub Pages.
- `css/styles.css` — CSS explícito do 1.x extraído. Se o 1.x só usa Tailwind CDN, mantenha o CDN no index.html e crie `styles.css` apenas com o CSS custom que existir.
- `js/config.js` — `firebaseConfig`, `APP_CONFIG` (com `ADMIN_UID`), `weekDays`, `mealOptions`, `getDayId()`, constantes.
- `js/firebase.js` — inicialização do Firebase (`initializeApp`), auth anônima, refs de doc (`menuDocRef`), timestamps. Compartilhado via escopo global (`window`).
- `js/db.js` — camada de dados Firestore: CRUD de funcionários, cardápio, pedidosDaSemana, e a rotação `turnWeek`/`autoTurnWeek` (com transaction) e `clearCurrentOrders`.
- `js/auth.js` — login admin, `signOut`, checagem de `ADMIN_UID`, listeners de auth.
- `js/ui.js` — helpers de UI: `showToast`, `showCustomConfirm`, dark-mode, `renderWizardStep`, `updateWizardProgress`, `renderHolidayCheckboxes`, `showUserView`/`showAdminView`/`updateUserViewUI`, `renderOrdersTable`, `openEditOrderModal`.
- `js/order.js` — fluxo do funcionário: `checkExistingOrder`, `displayExistingOrder`, `handleWizardSelection`, `validateForm`, `openConfirmationModal`, `submitOrder`.
- `js/admin.js` — painel admin: `loadAdminData`, upload/cropper de imagem (cropperjs + browser-image-compression), CRUD de employees, report jsPDF+autotable, `generateAndShareReport`, WhatsApp, limpar/rotacionar semana.
- `js/app.js` — bootstrap/orquestração: init na carga, listeners globais, callbacks de auth que decidem user vs admin view.
- `manifest.json` — copiar do 1.x.
- `sw.js` — copiar do 1.x.

## Requisitos técnicos
1. Ordem de carregamento no index.html: `config.js`, `firebase.js`, `db.js`, `auth.js`, `ui.js`, `order.js`, `admin.js`, `app.js`, todos como script clássico, com CSS/Tailwind/CDNs primeiro no `<head>`.
2. Variáveis compartilhadas via `window` (ex: `window.APP_CONFIG`, `window.menuDocRef`, `window.weekDays`), referenciadas de forma consistente. Sem `import`/`export`.
3. Versões dos CDN (Firebase, Tailwind, jsPDF, autotable, cropperjs, browser-image-compression) **idênticas** às do 1.x — copie os `src` exatos, na MESMA ordem de script tags do Firebase (compat/app, firestore, auth, storage).
4. **PORTE TODO o JavaScript** — nenhuma função pode ficar de fora. Não resuma nem omita lógica.
5. Deve abrir offline (PWA) e funcionar via `file://` e GitHub Pages: caminhos relativos.

## Validação (obrigatória antes de terminar)
1. Liste as funções do 1.x com `grep 'function '` em `C:/Users/menin/cardapio-v2/ref-1x/index.html` e confira manualmente que cada uma existe no projeto novo.
2. Confira que nenhum `src` de script aponta pra caminho errado — todos os arquivos referenciados existem.
3. Rode `node --check` em cada `.js`; se apontar erro de sintaxe, corrija. (O app só roda de verdade no browser com credenciais Firebase, então a validação = sintaxe + integridade do port.)

## Resumo final (entregar)
(a) lista de arquivos criados com caminho absoluto; (b) tabela de mapeamento função-do-1.x → arquivo-novo; (c) resultado das validações (node --check por arquivo + conferência de 100% das funções migradas); (d) qualquer diferença intencional. Seja honesto se algo não pôde ser portado.