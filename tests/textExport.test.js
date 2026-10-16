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
    nome:'parcelas',uniqueCompostos:[{colunas:['financeiro_id','numero']}],colunas:[
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
  assert.match(columns[1],/financeiro_id: BIGINT \| FK -> financeiro.id \| NOT NULL \| UNIQUE composto \(financeiro_id, numero\)/)
  assert.doesNotMatch(columns[1],/CHECK/)
  assert.match(columns[2],/numero: SMALLINT \| NOT NULL \| UNIQUE composto \(financeiro_id, numero\) \| Regra: Sequência de parcelas\./)
  for(const sql of [expression,combined]){
    assert.ok(columns[2].includes('\n  CHECK (\n'+sql.split('\n').map(line=>'  '+line).join('\n')+'\n  )'))
  }
  assert.equal((text.match(/CHECK \(/g)||[]).length,2)
  assert.match(columns[3],/referencia: TEXT \| NOT NULL \| UNIQUE/)
  assert.doesNotMatch(columns[3],/composto|CHECK/)
  assert.doesNotMatch(columns[4],/UNIQUE|CHECK/)
  assert.equal(JSON.stringify(exported),before,'Formatar TXT não altera JSON ou expressões salvas')
})
