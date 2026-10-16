import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from '../src/stores/modelador.js'
import { formatText } from '../src/textExport.js'

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
