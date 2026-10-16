# ModeladorBanco

Modelador visual de propostas de banco de dados PostgreSQL/Supabase, feito com **Vue 3**, **Pinia** e **Vite**.

## Executar localmente

Requer Node.js 20.19+ (ou Node 22.12+ / 24+).

```bash
git clone https://github.com/ferreis/ModeladorBanco.git
cd ModeladorBanco
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
- Prévia TXT/JSON atualizada automaticamente.
- Exportação TXT/JSON e importação do JSON da ferramenta HTML anterior.
- Persistência automática local via `localStorage`.
- Regras de negócio, triggers e funções em um único campo de observações da tabela.

**Não se conecta ao Supabase e não executa SQL.** O JSON é uma proposta para revisão.

Os presets são exibidos fechados: `id` sempre no início, `criado_em` e `atualizado_em` no fim. Novas colunas entram no meio. Nos presets, `id` e `criado_em` são imutáveis após o primeiro preenchimento; as datas recebem `now()` na criação. A atualização de `atualizado_em` fica descrita nas regras da coluna. Essas regras integram a proposta, a implementar no banco ou na aplicação. Ao abrir ou importar modelos antigos, automações da tabela são incorporadas às regras e a antiga opção de atualização de datas é preservada como texto nas observações da coluna.

Ao marcar PK, o modelador exige imutabilidade e NOT NULL. Uma PK de uma coluna também marca UNIQUE automaticamente. Se várias colunas forem marcadas como PK, elas formam uma única chave composta: a unicidade vale para a combinação, e UNIQUE individual continua opcional. Desmarcar PK mantém as opções explícitas de imutabilidade e nulidade para revisão. FK, por si só, permite valores repetidos. A imutabilidade é uma regra desta ferramenta, não uma restrição implícita de PK no PostgreSQL.

## Validar

```bash
npm run build
```

A implantação e os testes completos no navegador ainda precisam ser realizados no ambiente local.
