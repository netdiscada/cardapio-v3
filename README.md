# Cardápio Quatinga — v2 modular (área de testes)

Esta é a **versão 2.0** do site Cardápio Quatinga (Delícias Urbanas), reestruturada do zero em JavaScript modular puro (sem build/transpilador/framework). É uma **área de testes** — não afeta o site principal (que hoje é um `index.html` monolítico no repo `netdiscada/Card-pio-Regional`).

## Estrutura
- `index.html` — casca fina com toda a estrutura HTML
- `css/styles.css` — estilos custom
- `js/` — módulos separados por responsabilidade:
  - `config.js` — Firebase config, constantes (weekDays, mealOptions, ADMIN_UID)
  - `firebase.js` — inicialização Firebase (auth anônima, Firestore)
  - `db.js` — camada de dados Firestore + rotação de semana
  - `auth.js` — login admin
  - `ui.js` — componentes de UI (toast, wizard, tabelas, modais)
  - `order.js` — fluxo de pedido do funcionário
  - `admin.js` — painel admin (upload de cardápio, CRUD employees, relatório PDF)
  - `app.js` — bootstrap/orquestração (PWA, listeners, views)
- `manifest.json`, `sw.js` — PWA (offline)

## Comportamento
Comportamento **100% idêntico** ao v1.x — é um port (reorganização), não mudança de features ou modelo de dados.

## Deploy
Publicado no GitHub Pages na branch `main` (raiz). O Firestore é compartilhado com o app principal (mesmo projeto `cardapio-8ddea`).