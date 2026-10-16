# NexoDB Lab

Modelador visual de propostas de banco de dados PostgreSQL/Supabase, feito com **Vue 3**, **Pinia** e **Vite**.

## Executar localmente

Requer Node.js 20.19+ (ou Node 22.12+ / 24+).

```bash
git clone https://github.com/ferreis/NexoLab.git NexoLab
cd NexoLab
git checkout Dev
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite (normalmente `http://localhost:5173`).

## Funcionalidades

- Editor de tabelas e colunas; inserção de ID e datas padrão sem duplicação.
- Valor padrão na criação, opção de coluna imutável e regras em texto livre, incluídos nas propostas TXT/JSON.
- Suporte a ENUM, VARCHAR, NUMERIC, tipos comuns do PostgreSQL, PK, FK, NULL e UNIQUE.
- Ajuda contextual para os tipos de dados.
- Painéis esquerdo e direito recolhíveis com botões sempre acessíveis.
- Prévia TXT/JSON atualizada automaticamente, com abas para o projeto inteiro ou apenas a tabela selecionada; copiar acompanha a aba ativa.
- Reordenação das colunas pela alça de arrastar ou pelas setas do teclado, mantendo ID e datas fixos; ordem preservada ao salvar e exportar.
- Exportação TXT/JSON e importação do JSON da ferramenta HTML anterior.
- Persistência automática local via `localStorage`.
- Regras de negócio, validações e triggers no campo Regra de cada coluna.
- UNIQUE composto configurado dentro das colunas, com seleção das demais colunas da combinação e exportação em TXT/JSON.
- CHECK com múltiplas expressões SQL por coluna, incluindo condições que envolvem várias colunas da mesma linha, edição e exportação em TXT/JSON.

**Não se conecta ao Supabase e não executa SQL.** O JSON é uma proposta para revisão.

Os presets são exibidos fechados: `id` sempre no início, `criado_em` e `atualizado_em` no fim. Novas colunas entram no meio. Nos presets, `id` e `criado_em` são imutáveis após o primeiro preenchimento; as datas recebem `now()` na criação. A atualização de `atualizado_em` fica descrita nas regras da coluna. Essas regras integram a proposta, a implementar no banco ou na aplicação. Ao abrir ou importar modelos antigos, automações da tabela são incorporadas às regras e a antiga opção de atualização de datas é preservada como texto nas observações da coluna.

Ao marcar PK, o modelador exige imutabilidade e NOT NULL. Uma PK de uma coluna também marca UNIQUE automaticamente. Se várias colunas forem marcadas como PK, elas formam uma única chave composta: a unicidade vale para a combinação, e UNIQUE individual continua opcional. Desmarcar PK mantém as opções explícitas de imutabilidade e nulidade para revisão. FK, por si só, permite valores repetidos. A imutabilidade é uma regra desta ferramenta, não uma restrição implícita de PK no PostgreSQL.

Para números de parcelas únicos por financeiro, abra uma das colunas, marque **UNIQUE**, depois **Composto** e clique em **Adicionar unique compose**. Selecione a outra coluna e adicione a combinação `(financeiro_id, numero)`. Assim, `(1, 6)` e `(2, 6)` são permitidos, mas duas ocorrências de `(1, 6)` são rejeitadas quando a restrição for implementada no banco. O modo composto desativa o UNIQUE individual. Desmarcá-lo remove as combinações da coluna e volta ao UNIQUE individual; desmarcar UNIQUE remove também suas combinações. As colunas não precisam ser FKs para participar.

Depois de definir uma PK, a opção PK fica oculta nas outras colunas. A coluna que já é PK mantém o controle para permitir desmarcá-la e escolher outra. O botão de ID e datas padrão preserva a PK existente e não adiciona outra. Modelos antigos com PK composta continuam sendo importados.

O JSON inclui `uniqueCompostos: [{ "colunas": ["financeiro_id", "numero"] }]` em cada tabela; o TXT descreve a mesma combinação. Os grupos acompanham renomeações e reordenações, são restaurados ao importar e aparecem nas colunas participantes. Excluir uma coluna remove as combinações inteiras que dependiam dela. Se Permite NULL estiver marcado, vale o comportamento padrão do PostgreSQL: combinações contendo NULL podem se repetir. A ferramenta registra a proposta, sem executar a restrição no banco.

Novos CHECKs abrem no modo **SQL**, para colar ou escrever uma expressão. A ação **Adicionar restrição** fica na mesma barra dos botões **SQL** e **Montar**. Use **Converter para seleções** para abrir o formulário **Montar** com os grupos preenchidos; com SQL vazio, também é possível escolher **Montar** para começar pelas seleções. No formulário, escolha a coluna, a condição e um valor ou outra coluna para comparar. Cada grupo tem seu próprio operador **E/OU** e pode receber condições ou **subgrupos recursivos**, sem o limite anterior de dois níveis. Parênteses preservam o agrupamento ao gerar SQL. Valores booleanos e de ENUM usam listas de seleção. Números personalizados e textos podem ser informados no campo de valor. Os botões **Adicionar unique compose** e **Adicionar CHECK** ficam juntos abaixo das opções da coluna. O conteúdo do CHECK pode ser expandido ou recolhido sem esconder esses botões; salvar uma restrição recolhe a seção. Recolher durante a edição preserva as seleções ainda não salvas. É possível adicionar, editar e excluir várias restrições na mesma coluna ou tabela. O PostgreSQL rejeita o registro quando uma condição CHECK é FALSE; TRUE e NULL satisfazem a condição, portanto CHECK não substitui NOT NULL e não é uma trigger.

Os CHECKs ficam no JSON de cada coluna como `checks: [{ "expressao": "numero >= 1" }]`. Regras criadas por seleções também guardam `construtor`, com grupos, condições e valores, para reabrir a edição visual após importar ou recarregar. Novos grupos usam `{ operador, itens }`; cada item pode ser uma condição ou outro grupo. Os formatos antigos com `grupos` e `condicoes` continuam importando. O SQL é gerado com identificadores e valores escapados; os CHECKs do construtor acompanham renomeações e são removidos quando uma coluna da qual dependem é excluída.

No modo **SQL**, cole uma expressão ou `CHECK (...)` e clique em **Converter para seleções**. A conversão suporta parênteses, AND/OR, comparações (`=`, `<>`, `!=`, `>`, `>=`, `<`, `<=`), números, textos entre aspas simples, TRUE/FALSE, comparação entre colunas e IS NULL/IS NOT NULL, respeitando a precedência de AND sobre OR. Identificadores entre aspas duplas preservam a caixa; nomes sem aspas são convertidos para minúsculas como no PostgreSQL. Funções, casts, subconsultas e outros recursos fora desse subconjunto permanecem no modo SQL, com mensagem explicativa e o texto original preservado. A conversão não executa SQL. Expressões que permanecerem livres continuam exigindo revisão manual ao renomear ou excluir colunas.

O TXT documenta UNIQUE individual e UNIQUE composto na linha de cada coluna envolvida, e os CHECKs logo abaixo da coluna em que foram cadastrados, com recuo. Prévia, cópia e download usam essa mesma formatação, com cláusulas `CHECK (expressão)` do formatador PostgreSQL compartilhado. O modelo atual oferece TXT/JSON, sem exportador SQL completo nem execução ou validação de sintaxe contra um banco. Desmarcar CHECK remove as restrições cadastradas naquela coluna. Modelos antigos sem o campo `checks` continuam sendo importados.

## Validar

```bash
npm test
npm run build
```

Nomes de tabelas devem ser únicos no projeto; nomes de colunas devem ser únicos dentro de cada tabela. A comparação ignora maiúsculas/minúsculas e espaços nas pontas. Nomes repetidos são rejeitados ao sair do campo ou pressionar Enter, mantendo o nome anterior. Importações com duplicatas são recusadas. Projetos antigos com duplicatas continuam disponíveis para correção, com exportação e cópia bloqueadas até resolver os conflitos.

## Hospedagem no Cloudflare

Endereço: https://nexodblab.pages.dev

A hospedagem usa Cloudflare Pages, servindo apenas o conteúdo de `dist/`. Não há backend nem banco de dados. O favicon da aba do navegador está em `public/favicon.svg`.

Para publicar atualizações com a CLI autenticada na conta do projeto:

```bash
npx wrangler login
npm run deploy
```

Para conferir a configuração sem publicar:

```bash
npm run build
npx wrangler pages dev dist
```

O salvamento continua no `localStorage` do navegador, separado por dispositivo, perfil e endereço do site. Dados salvos em `localhost` não aparecem automaticamente no endereço público: exporte o JSON local e importe no site publicado. Para usar o mesmo projeto em outro dispositivo, transfira o JSON da mesma forma. Limpar os dados do site remove o armazenamento local; mantenha uma exportação dos projetos que quiser guardar.

As explicações de Imutável, UNIQUE, Composto e CHECK ficam em ajudas compactas integradas à borda dos controles, sem ícones soltos nem exemplos: mantenha o mouse parado sobre a opção por três segundos para abrir. Mover o mouse reinicia a espera; sair cancela a abertura ou fecha a mensagem, sem fixação por clique. Os ícones são informativos, sem aparência ou ação de botão. A ajuda de CHECK fica na opção da coluna; o contador apenas expande ou recolhe as restrições. As ajudas também respondem ao foco do teclado e Escape, sem alternar o checkbox. Detalhes de conversão SQL e avisos sobre NULL nas composições usam o mesmo componente.
