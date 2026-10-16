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

**Não se conecta ao Supabase e não executa SQL.** O JSON é uma proposta para revisão.

Os presets são exibidos fechados: `id` sempre no início, `criado_em` e `atualizado_em` no fim. Novas colunas entram no meio. Nos presets, `id` e `criado_em` são imutáveis após o primeiro preenchimento; as datas recebem `now()` na criação. A atualização de `atualizado_em` fica descrita nas regras da coluna. Essas regras integram a proposta, a implementar no banco ou na aplicação. Ao abrir ou importar modelos antigos, automações da tabela são incorporadas às regras e a antiga opção de atualização de datas é preservada como texto nas observações da coluna.

Ao marcar PK, o modelador exige imutabilidade e NOT NULL. Uma PK de uma coluna também marca UNIQUE automaticamente. Se várias colunas forem marcadas como PK, elas formam uma única chave composta: a unicidade vale para a combinação, e UNIQUE individual continua opcional. Desmarcar PK mantém as opções explícitas de imutabilidade e nulidade para revisão. FK, por si só, permite valores repetidos. A imutabilidade é uma regra desta ferramenta, não uma restrição implícita de PK no PostgreSQL.

Para números de parcelas únicos por financeiro, abra uma das colunas, marque **UNIQUE**, depois **UNIQUE composto** e clique em **Adicionar composição única**. Selecione a outra coluna e adicione a combinação `(financeiro_id, numero)`. Assim, `(1, 6)` e `(2, 6)` são permitidos, mas duas ocorrências de `(1, 6)` são rejeitadas quando a restrição for implementada no banco. O modo composto desativa o UNIQUE individual. Desmarcá-lo remove as combinações da coluna e volta ao UNIQUE individual; desmarcar UNIQUE remove também suas combinações. As colunas não precisam ser FKs para participar.

Depois de definir uma PK, a opção PK fica oculta nas outras colunas. A coluna que já é PK mantém o controle para permitir desmarcá-la e escolher outra. O botão de ID e datas padrão preserva a PK existente e não adiciona outra. Modelos antigos com PK composta continuam sendo importados.

O JSON inclui `uniqueCompostos: [{ "colunas": ["financeiro_id", "numero"] }]` em cada tabela; o TXT descreve a mesma combinação. Os grupos acompanham renomeações e reordenações, são restaurados ao importar e aparecem nas colunas participantes. Excluir uma coluna remove as combinações inteiras que dependiam dela. Se Permite NULL estiver marcado, vale o comportamento padrão do PostgreSQL: combinações contendo NULL podem se repetir. A ferramenta registra a proposta, sem executar a restrição no banco.

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
