# Reestruturação visual COMPLETA do Cardápio Quatinga v2

## Objetivo
Tornar o app BONITO, VIBRANTE e AGRADÁVEL, especialmente no modo escuro. A interface atual é visualmente pobre (usa azul padrão + fundo PRETO puro no dark mode, que cansa os olhos). A nova identidade deve ter personalidade e conforto visual. **É 100% mudança de aparência — NENHUMA funcionalidade, id, estrutura ou lógica pode mudar.**

## Novo tema (abraçado pelo usuário)
- **Modo escuro:** fundo CINZA-CHUMBO suave (NUNCA preto puro `#000`) + texturas de cinza-ardósia. Alvo agradável aos olhos, tipo paleta Tailwind `slate-800`/`slate-900`/`zinc-800` (não `black`).
- **Cor de destaque (accent):** LARANJA / ÂMBAR QUENTE (Tailwind `orange-500`/`orange-600`/`amber-500`) — substitui o azul como cor primária de ações/botões. Tons quentes e vibrantes.
- **Verde semântico:** manter para sucesso/pedido registrado/preenchido (emerald/green), é cor de confirmação.
- **Fonte:** fonte moderna (Poppins já é a base). No título, manter a fonte decorativa (Lobster Two) OU trocar por algo igualmente marcante — escolha o que ficar mais bonito no conjunto.
- **Modo claro:** também vibrante e colorido (não pode ficar lavado).

## Arquivos a modificar (TODOS para consistência)
1. `C:/Users/menin/cardapio-v2/app/index.html` — todas as classes de cor/visual dos elementos.
2. `C:/Users/menin/cardapio-v2/app/js/admin.js` — classes de cor hardcoded (bg-gray-50, dark:bg-zinc-800/900, text-blue-600/800, dark:text-blue-400/300, red, etc.).
3. `C:/Users/menin/cardapio-v2/app/js/order.js` — classes de cor hardcoded (green de pedido registrado, gray, zinc).
4. `C:/Users/menin/cardapio-v2/app/js/ui.js` — classes de cor hardcoded (bg-blue-600, bg-gray-100/200/300, bg-green-50, bg-red-50, e o LÓGICA dos toggles de semana).
5. `C:/Users/menin/cardapio-v2/app/css/styles.css` — qualquer cor/estilo custom.

## REGRAS CRÍTICAS (não quebrar)
1. **IDs, atributos, estrutura HTML e toda a lógica JS permanecem INALTERADOS.** Só muda a aparência (classes CSS).
2. **ATENÇÃO ao `ui.js`:** a função `updateUserViewUI` faz `classList.replace` para alternar entre os botões da semana (`bg-blue-600` ↔ `bg-gray-100`, `text-white` ↔ `text-gray-700`, etc.). Se mudar essas classes, ATUALIZE os *strings* do `classList.replace` no mesmo trecho para os novos nomes — senão a alternância visual quebra. Procure `classList.replace('bg-blue-600'` em ui.js e reflita o novo accent.
3. **Mapeamento temático a aplicar em todo lugar:**
   - azul primário de ação/botão (`bg-blue-600`, `text-blue-600`, `dark:text-blue-400`, p.ex. em wizard, botões de semana, "Ver relatório") → **laranja/âmbar** (> `bg-orange-500`/`text-orange-600`/`dark:text-orange-400`)
   - foco de input `focus:ring-blue-500` → `focus:ring-orange-500`
   - fundo dark `dark:bg-black` → tom cinza-ardósia (ex: `dark:bg-slate-900` ou `dark:bg-[#16181d]`)
   - cards dark `dark:bg-zinc-900` → tom um pouco mais claro/azulado (ex `dark:bg-slate-800/60` ou manter zinc-900, escolha o mais agradável)
   - verde de sucesso mantém (pode ir p/ `emerald`)
   - vermelho de perigo mantém (red)
   - amarelo de aviso (guidance/yellow) pode ganhar tom laranja harmonioso
   - tons de texto gray/zinc mantêm a hierarquia (claro no dark, escuro no claro)
4. **Contraste:** no dark mode o texto primário deve ser claro (`dark:text-slate-100`/`dark:text-gray-100`), não `gray-400` onde for título/botão. Texto secundário `dark:text-slate-400`. Garanta legibilidade confortável.
5. **Botão "🌙 Modo Noturno" e "⚙️ ADM":** devem combinar com o novo tema (no escuro, tom ardo-sia com hover).
6. **O banner offline (amarelo), toasts, modais de confirmação, cropper, wizard de pedido, tabela de pedidos do admin, cards de feriado, feedback de escolha de refeição** — TODOS devem refletir o novo tema (ardósia escuro + laranja/âmbar + verde sucesso), mantendo função.

## Como melhorar visualmente (crie valor além da troca de cor)
- Gradientes sutis em cards/botões principais (ex: de `orange-500` a `amber-500`) pra vibrar.
- Sombras mais profundas/suaves (`shadow-lg`, `shadow-xl` com `shadow-orange-500/10` em elementos de destaque).
- Bordas com `border-zinc-700/60` no dark em vez de `border-zinc-800` (mais definido).
- Cantos arredondados consistentes (`rounded-xl`/`rounded-2xl`).
- Hover states mais expressivos (`hover:translate-y-[-1px]`, `hover:shadow-lg`).
- Ícones/emojis já existentes mantidos (não adicionar dependências).

## Não pode
- Mexer em qualquer `id`, `onclick`, listener, nome de função, ou lógica de dados.
- Adicionar CSS/JS externos, bibliotecas, ou classes utilitárias que não existam no Tailwind CDN já carregado (tailwind.config = darkMode:'class' — pode estender `extend.colors` se precisar, mas prefira laranja/âmbar/ardósia padrão do Tailwind).
- Quebrar o modo claro vibrante (o app começa claro, `localStorage theme=light` por padrão).

## Validação antes de terminar
- `node --check` em cada `.js` modificado (os 4).
- `grep` confirme que NÃO sobrou `bg-black` ou `dark:bg-black` no index.html (deve ser ardósia).
- Confira que os `classList.replace` do ui.js estão coerentes com as novas classes (ex: se trocou bg-blue-600 por bg-orange-500, o replace deve usar orange).
- Confira que nenhum `id` mudou (diff de IDs entre antes/depois se puder).

## Entrega no resumo
(a) lista de arquivos modificados; (b) paleta final usada (background dark, accent, verde, aviso, texto); (c) o mapeamento azul→laranja que aplicou; (d) validações (node --check + grep de bg-black + coerência do classList.replace); (e) qualquer mudança visual extra que você adicionou (gradientes, sombras, etc.). Responda em português.

Use read_file para ler cada arquivo em chunks (index.html 440 linhas, admin.js ~430, ui.js ~300, order.js ~220, styles.css). Gere as edições com patch — NUNCA cat/heredoc.