import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from '../src/stores/modelador.js'
import { formatText } from '../src/textExport.js'

test('TXT e JSON não exportam default de FK, inclusive se houver um valor residual no estado',()=>{
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}}
  setActivePinia(createPinia())
  const store=useModelStore()
  store.importData({tabelas:[{nome:'conexoes',colunas:[{nome:'origem_id',tipo:'BIGINT',fk:true,padrao:'42'}]}]})
  // Simula um estado residual para verificar também a barreira da exportação.
  store.columns[0].padrao='42'
  assert.equal(store.exported.tabelas[0].colunas[0].padrao,'')
  assert.doesNotMatch(JSON.stringify(store.exported),/42/)
  assert.doesNotMatch(formatText(store.exported),/DEFAULT|42/)
})

test('TXT mantém UNIQUE, composições e múltiplos CHECKs junto às respectivas colunas',()=>{
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}}
  setActivePinia(createPinia())
  const store=useModelStore()
  const expression='numero >= 1 -- mínimo'
  const combined='(financeiro_id IS NOT NULL AND numero > 0)\nOR financeiro_id IS NULL'
  store.importData({projeto:'Teste',schema_alvo:'public',tabelas:[{
    nome:'parcelas',uniqueCompostos:[{colunas:['numero','financeiro_id']}],colunas:[
      {nome:'financeiro_id',tipo:'BIGINT',fk:true,fkTabela:'financeiro',fkColuna:'id'},
      {nome:'numero',tipo:'SMALLINT',descricao:'Sequência de parcelas.',checks:[{expressao:expression},{expressao:combined}]},
      {nome:'referencia',tipo:'TEXT',unique:true},
      {nome:'descricao',tipo:'TEXT'}
    ]
  }]})
  const exported=store.exported
  const before=JSON.stringify(exported)
  const text=formatText(exported)
  const columns=text.split(/(?=^- )/m)
  assert.doesNotMatch(columns[0],/CHECK|UNIQUE/)
  assert.ok(text.includes('TABELA: parcelas\n- financeiro_id:'))
  assert.match(columns[1],/financeiro_id: BIGINT \| FK -> financeiro.id \| NOT NULL/)
  assert.doesNotMatch(columns[1],/UNIQUE/)
  assert.doesNotMatch(columns[1],/CHECK/)
  assert.match(columns[2],/numero: SMALLINT \| NOT NULL \| UNIQUE Compose \(numero, financeiro_id\) \| Regra: Sequência de parcelas\./)
  assert.ok(columns[2].includes(' | CHECK (numero >= 1) | CHECK ((financeiro_id IS NOT NULL AND numero > 0) OR financeiro_id IS NULL)'))
  assert.equal(columns[2].trim().split('\n').length,1)
  assert.equal((text.match(/UNIQUE Compose/g)||[]).length,1)
  assert.equal((text.match(/CHECK \(/g)||[]).length,2)
  assert.match(columns[3],/referencia: TEXT \| NOT NULL \| UNIQUE/)
  assert.doesNotMatch(columns[3],/composto|CHECK/)
  assert.doesNotMatch(columns[4],/UNIQUE|CHECK/)
  assert.equal(JSON.stringify(exported),before,'Formatar TXT não altera JSON ou expressões salvas')
})

test('TXT mantém uma linha vazia entre tabelas e nenhuma após o título',()=>{
  const colunas=[{nome:'id',tipo:'BIGINT',pk:true,checks:[]}]
  const text=formatText({projeto:'Teste',schema_alvo:'public',tabelas:[{nome:'alpha',uniqueCompostos:[],colunas},{nome:'beta',uniqueCompostos:[],colunas}]})
  assert.ok(text.includes('TABELA: alpha\n- id:'))
  assert.ok(text.includes(' | PK | NOT NULL\n\nTABELA: beta\n- id:'))
  assert.doesNotMatch(text,/TABELA: [^\n]+\n\n/)
})

test('TXT exporta comentário como SQL com nomes, aspas, barras e quebras de linha preservados',()=>{
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}}
  setActivePinia(createPinia())
  const store=useModelStore()
  const comentario="Perspectiva d'origem.\nCaminho C:\\dados; '); DROP TABLE x; --"
  store.importData({schema_alvo:'RPG"Especial',tabelas:[{nome:'Conexões"A',comentario,colunas:[]}]})
  const sql='COMMENT ON TABLE "RPG""Especial"."Conexões""A" IS\nE\'Perspectiva d\'\'origem.\nCaminho C:\\\\dados; \'\'); DROP TABLE x; --\';'
  assert.equal(store.exported.tabelas[0].comentario_sql,sql)
  assert.ok(formatText(store.exported).includes(`TABELA: Conexões"A\n${sql}`))
  assert.equal(store.selected.comentario,comentario)
})

test('TXT emite COMMENT ON TABLE somente para comentários preenchidos',()=>{
  const table={nome:'conexoes',comentario:'A direção é significativa.',colunas:[],uniqueCompostos:[]}
  const doc={projeto:'Teste',schema_alvo:'rpg',tabelas:[table]}
  assert.ok(formatText(doc).includes('COMMENT ON TABLE "rpg"."conexoes" IS\n\'A direção é significativa.\';'))
  for(const comentario of [undefined,'',' \n ']){
    assert.doesNotMatch(formatText({...doc,tabelas:[{...table,comentario}]}),/COMMENT ON TABLE/)
  }
})

test('TXT e JSON geram COMMENT ON COLUMN separado da regra com escape dos identificadores e texto',()=>{
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}}
  setActivePinia(createPinia())
  const store=useModelStore()
  store.importData({schema_alvo:'rpg"A',tabelas:[{nome:'conexoes"B',colunas:[
    {nome:'lealdade"C',tipo:'SMALLINT',descricao:'Entre 0 e 5.',comentario:"Perspectiva d'origem.\nC:\\dados"},
    {nome:'sem_comentario',tipo:'TEXT',comentario:' \n '}
  ]}]})
  const exported=store.exported
  const sql=`COMMENT ON COLUMN "rpg""A"."conexoes""B"."lealdade""C" IS\nE'Perspectiva d''origem.\nC:\\\\dados';`
  assert.equal(exported.tabelas[0].colunas[0].comentario_sql,sql)
  const txt=formatText(exported)
  assert.ok(txt.includes(`Regra: Entre 0 e 5.\n${sql}\n- sem_comentario:`))
  assert.equal((txt.match(/COMMENT ON COLUMN/g)||[]).length,1)
  assert.equal(exported.tabelas[0].colunas[1].comentario_sql,undefined)
})


test('TXT preserva objetos e restrições SQL importados',()=>{
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}}
  setActivePinia(createPinia())
  const store=useModelStore()
  store.importSql([
    "CREATE TYPE rpg.estado AS ENUM ('ativo', 'inativo');",
    "CREATE TABLE rpg.fichas (id bigint PRIMARY KEY);",
    "ALTER TABLE rpg.fichas ADD CONSTRAINT fichas_ck CHECK (id > 0);",
    "CREATE TRIGGER atualizar BEFORE UPDATE ON rpg.fichas FOR EACH ROW EXECUTE FUNCTION rpg.atualizar();",
    "CREATE POLICY acesso ON rpg.fichas TO authenticated USING (true);"
  ].join('\n'),'replace')
  const txt=formatText(store.exported)
  assert.match(txt,/ENUMs do schema/)
  assert.match(txt,/Restrições SQL:/)
  assert.match(txt,/fichas_ck/)
  assert.match(txt,/Triggers SQL:/)
  assert.match(txt,/Políticas\/RLS:/)
})
