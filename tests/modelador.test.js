import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from '../src/stores/modelador.js'

beforeEach(()=>{
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}}
  setActivePinia(createPinia())
})

test('novas tabelas recebem nomes disponíveis, inclusive após exclusões',()=>{
  const store=useModelStore()
  store.addTable();store.addTable();store.addTable()
  assert.deepEqual(store.doc.tabelas.map(t=>t.nome),['nova_tabela','nova_tabela_2','nova_tabela_3'])
  store.selectedId=store.doc.tabelas[1].uid
  store.removeTable();store.addTable()
  assert.equal(store.selected.nome,'nova_tabela_2')
})

test('renomear tabela rejeita duplicata com caixa e espaços diferentes e preserva o nome',()=>{
  const store=useModelStore()
  store.addTable();store.renameTable(store.selected,'clientes')
  store.addTable()
  const table=store.selected
  assert.throws(()=>store.renameTable(table,' CLIENTES '),/Já existe uma tabela/)
  assert.equal(table.nome,'nova_tabela')
  store.renameTable(table,' pedidos ')
  store.renameTable(table,'PEDIDOS')
  assert.equal(table.nome,'PEDIDOS')
})

test('colunas só precisam ter nomes únicos dentro da própria tabela',()=>{
  const store=useModelStore()
  store.addTable();store.addColumn()
  store.renameColumn(store.columns[0],'nome')
  store.addColumn()
  const column=store.columns[1]
  assert.throws(()=>store.renameColumn(column,' NOME '),/Já existe uma coluna/)
  assert.equal(column.nome,'')
  store.renameColumn(column,'sobrenome')
  store.renameColumn(column,' SOBRENOME ')
  store.addTable();store.addColumn()
  store.renameColumn(store.columns[0],'nome')
  assert.equal(store.nameError,'')
})

test('nome sugerido para FK evita colisão com coluna existente',()=>{
  const store=useModelStore()
  store.addTable();store.addColumn()
  store.renameColumn(store.columns[0],'clientes_id')
  store.addColumn()
  const fk=store.columns[1]
  store.setForeignTable(fk,'clientes')
  assert.equal(fk.nome,'clientes_id_2')
  assert.equal(fk.fkTabela,'clientes')
  assert.equal(store.nameError,'')
})

test('importação com duplicatas não substitui o projeto atual',()=>{
  const store=useModelStore()
  store.addTable()
  const original=store.doc
  assert.throws(()=>store.importData({tabelas:[{nome:'clientes'},{nome:' Clientes '}]}),/Já existe uma tabela/)
  assert.equal(store.doc,original)
  assert.throws(()=>store.importData({tabelas:[{nome:'clientes',colunas:[{nome:'nome'},{nome:' NOME '}]}]}),/tem colunas/)
  assert.equal(store.doc,original)
  store.importData({tabelas:[{nome:'clientes',colunas:[{nome:'id'}]},{nome:'pedidos',colunas:[{nome:'id'}]}]})
  assert.equal(store.doc.tabelas.length,2)
})

test('duplicatas antigas são preservadas e sinalizadas até serem corrigidas',()=>{
  globalThis.localStorage.getItem=()=>JSON.stringify({tabelas:[{nome:'clientes',colunas:[{nome:'nome'},{nome:' NOME '}]},{nome:'Clientes',colunas:[]}]})
  const store=useModelStore()
  assert.equal(store.doc.tabelas.length,2)
  assert.match(store.nameError,/tem colunas/)
  store.renameColumn(store.columns[1],'sobrenome')
  assert.match(store.nameError,/Já existe uma tabela/)
  store.renameTable(store.doc.tabelas[1],'pedidos')
  assert.equal(store.nameError,'')
})

test('presets e novas colunas não criam nomes repetidos',()=>{
  const store=useModelStore()
  store.addTable();store.addDefaults();store.addDefaults();store.addColumn();store.addColumn()
  assert.equal(store.columns.filter(c=>c.nome==='id').length,1)
  assert.equal(store.nameError,'')
  assert.throws(()=>store.renameColumn(store.columns.find(c=>!c.nome),' ID '),/Já existe uma coluna/)
})

function parcelas(){
  const store=useModelStore()
  store.importData({tabelas:[{nome:'financeiro_parcelas',colunas:[{nome:'financeiro_id',tipo:'BIGINT',fk:true,fkTabela:'financeiro'},{nome:'numero',tipo:'SMALLINT'},{nome:'referencia',tipo:'TEXT'}]}]})
  return store
}

test('UNIQUE composto exporta a combinação sem impor UNIQUE individual ou PK',()=>{
  const store=parcelas()
  const ids=store.columns.slice(0,2).map(c=>c.uid)
  store.addCompositeUnique(ids)
  assert.deepEqual(store.exported.tabelas[0].uniqueCompostos,[{colunas:['financeiro_id','numero']}])
  assert.ok(store.columns.every(c=>!c.unique&&!c.pk))
  assert.throws(()=>store.addCompositeUnique([...ids].reverse()),/já possui/)
})

test('UNIQUE composto rejeita grupos incompletos, colunas repetidas ou de outra tabela',()=>{
  const store=parcelas()
  const id=store.columns[0].uid
  for(const ids of [[],[id],[id,id],[id,'outra-tabela']])assert.throws(()=>store.addCompositeUnique(ids))
  store.addColumn()
  assert.throws(()=>store.addCompositeUnique([id,store.columns.find(c=>!c.nome).uid]),/com nome/)
  assert.equal(store.selected.uniqueCompostos.length,0)
})

test('renomear e reordenar colunas preserva os vínculos do UNIQUE composto',()=>{
  const store=parcelas()
  const [financeiro,numero,referencia]=store.columns
  store.addCompositeUnique([financeiro.uid,numero.uid])
  store.renameColumn(numero,'parcela')
  store.moveColumn(numero.uid,referencia.uid,true)
  assert.deepEqual(store.exported.tabelas[0].uniqueCompostos[0].colunas,['financeiro_id','parcela'])
  assert.throws(()=>store.renameColumn(numero,''),/precisa manter um nome/)
  store.removeCompositeUnique(store.selected.uniqueCompostos[0].uid)
  store.renameColumn(numero,'')
  assert.equal(numero.nome,'')
})

test('excluir coluna remove suas combinações inteiras e preserva grupos independentes',()=>{
  const store=parcelas()
  const [financeiro,numero,referencia]=store.columns
  store.addCompositeUnique([financeiro.uid,numero.uid])
  store.addCompositeUnique([numero.uid,referencia.uid])
  assert.equal(store.removeColumn(financeiro.uid),1)
  assert.deepEqual(store.exported.tabelas[0].uniqueCompostos,[{colunas:['numero','referencia']}])
})

test('UNIQUE composto sobrevive à exportação/importação e à restauração local',()=>{
  const store=parcelas()
  store.addCompositeUnique(store.columns.slice(0,2).map(c=>c.uid))
  const exported=JSON.parse(JSON.stringify(store.exported))
  store.importData(exported)
  assert.deepEqual(store.exported,exported)
  const saved=JSON.stringify(store.doc)
  globalThis.localStorage.getItem=()=>saved
  setActivePinia(createPinia())
  const restored=useModelStore()
  assert.deepEqual(restored.exported,exported)
})

test('importação recusa UNIQUE composto inválido sem substituir o documento',()=>{
  const store=parcelas()
  const original=store.doc
  const data=JSON.parse(JSON.stringify(store.exported))
  data.tabelas[0].uniqueCompostos=[{colunas:['numero','inexistente']}]
  assert.throws(()=>store.importData(data),/existentes/)
  assert.equal(store.doc,original)
  data.tabelas[0].uniqueCompostos=[{colunas:['financeiro_id','numero']},{colunas:['numero','financeiro_id']}]
  assert.throws(()=>store.importData(data),/já possui/)
  assert.equal(store.doc,original)
})

test('UNIQUE composto substitui unicidade individual no fluxo de opções',()=>{
  const store=parcelas()
  const [financeiro,numero]=store.columns
  assert.equal(store.isUniqueEnabled(numero),false)
  store.setUnique(numero,true)
  assert.equal(store.isUnique(numero),true)
  store.setCompositeUnique(numero,true)
  assert.equal(store.isUnique(numero),false)
  assert.equal(store.isUniqueEnabled(numero),true)
  assert.equal(store.isCompositeUnique(numero),true)
  store.addCompositeUnique([numero.uid,financeiro.uid])
  assert.equal(store.isUniqueEnabled(financeiro),true)
  assert.equal(store.isCompositeUnique(financeiro),true)
  assert.equal(store.exported.tabelas[0].colunas.find(c=>c.nome==='numero').unique,false)
  store.setCompositeUnique(numero,false)
  assert.equal(store.isUnique(numero),true)
  assert.equal(store.selected.uniqueCompostos.length,0)
  store.setUnique(numero,false)
  assert.equal(store.isUniqueEnabled(numero),false)
})

test('desmarcar UNIQUE remove as composições da coluna e preserva outras',()=>{
  const store=parcelas()
  const [financeiro,numero,referencia]=store.columns
  store.setUnique(numero,true);store.setCompositeUnique(numero,true)
  store.addCompositeUnique([numero.uid,financeiro.uid])
  store.addCompositeUnique([financeiro.uid,referencia.uid])
  store.setUnique(numero,false)
  assert.equal(store.isCompositeUnique(numero),false)
  assert.deepEqual(store.exported.tabelas[0].uniqueCompostos,[{colunas:['financeiro_id','referencia']}])
})

test('segunda PK é recusada e os presets preservam a PK existente',()=>{
  const store=parcelas()
  const [financeiro,numero]=store.columns
  store.setPrimaryKey(financeiro,true)
  assert.throws(()=>store.setPrimaryKey(numero,true),/já possui uma chave primária/)
  assert.equal(numero.pk,false)
  store.addDefaults()
  assert.equal(store.primaryKeyColumns.length,1)
  assert.equal(store.primaryKeyColumns[0].uid,financeiro.uid)
  assert.ok(store.columns.some(c=>c.nome==='criado_em'))
  store.setPrimaryKey(financeiro,false)
  store.setPrimaryKey(numero,true)
  assert.equal(store.primaryKeyColumns[0].uid,numero.uid)
})

test('CHECK permite múltiplas expressões e edição sem alterar UNIQUE, PK ou NULL',()=>{
  const store=parcelas()
  const column=store.columns[0]
  store.setUnique(column,true)
  store.setCheck(column,true)
  store.saveCheck(column,null,'valor > 0')
  store.saveCheck(column,null,'numero >= 1')
  const id=column.checks[0].uid
  store.saveCheck(column,id,'valor > 10')
  assert.deepEqual(store.exported.tabelas[0].colunas[0].checks,[{expressao:'valor > 10'},{expressao:'numero >= 1'}])
  assert.equal(column.unique,true)
  assert.equal(column.pk,false)
  assert.equal(column.nullable,false)
  store.removeCheck(column,id)
  assert.deepEqual(column.checks.map(c=>c.expressao),['numero >= 1'])
  store.setCheck(column,false)
  assert.equal(store.isCheckEnabled(column),false)
  assert.equal(column.checks.length,0)
  assert.equal(column.unique,true)
})

test('CHECK composto mantém SQL multilinha com AND, OR e condições NULL na importação',()=>{
  const store=parcelas()
  const expression='(ficha_id IS NOT NULL AND organizacao_id IS NULL)\nOR\n(ficha_id IS NULL AND organizacao_id IS NOT NULL)'
  store.saveCheck(store.columns[0],null,expression)
  store.saveCheck(store.columns[1],null,'numero >= 1')
  const exported=JSON.parse(JSON.stringify(store.exported))
  store.importData(exported)
  assert.deepEqual(store.exported,exported)
  assert.equal(store.columns[0].checks[0].expressao,expression)
  assert.equal(store.isCheckEnabled(store.columns[0]),true)
  const saved=JSON.stringify(store.doc)
  globalThis.localStorage.getItem=()=>saved
  setActivePinia(createPinia())
  assert.deepEqual(useModelStore().exported,exported)
})

test('CHECK recusa expressão vazia e importação inválida preserva o documento atual',()=>{
  const store=parcelas()
  const column=store.columns[0]
  for(const expr of ['', '  ', null, {}])assert.throws(()=>store.saveCheck(column,null,expr),/expressão SQL/)
  assert.equal(column.checks.length,0)
  const original=store.doc
  const data=JSON.parse(JSON.stringify(store.exported))
  data.tabelas[0].colunas[0].checks=[{expressao:' '}]
  assert.throws(()=>store.importData(data),/expressão SQL/)
  assert.equal(store.doc,original)
  data.tabelas[0].colunas[0].checks='numero > 0'
  assert.throws(()=>store.importData(data),/Lista de restrições/)
  assert.equal(store.doc,original)
})

test('modelos antigos sem CHECK continuam importando e CHECK convive com composição',()=>{
  const store=parcelas()
  assert.ok(store.columns.every(c=>c.checks.length===0))
  store.addCompositeUnique(store.columns.slice(0,2).map(c=>c.uid))
  store.saveCheck(store.columns[1],null,'numero >= 1')
  assert.deepEqual(store.exported.tabelas[0].uniqueCompostos,[{colunas:['financeiro_id','numero']}])
  assert.equal(store.exported.tabelas[0].colunas[1].checks[0].expressao,'numero >= 1')
  assert.equal(store.exported.tabelas[0].colunas[1].unique,false)
})

test('construtor CHECK preserva seleções no JSON e acompanha renomeações',async()=>{
  const {makeCheckBuilder}=await import('../src/checkBuilder.js')
  const store=parcelas()
  const column=store.columns[1]
  const builder=makeCheckBuilder(column)
  store.saveCheck(column,null,'',builder)
  const exported=JSON.parse(JSON.stringify(store.exported))
  store.importData(exported)
  assert.deepEqual(store.exported,exported)
  const target=store.columns[1]
  store.renameColumn(target,'parcela')
  assert.equal(target.checks[0].expressao,'"parcela" >= 1')
  assert.equal(target.checks[0].construtor.grupos[0].condicoes[0].coluna,'parcela')
  assert.throws(()=>store.renameColumn(target,''),/CHECK/)
  assert.equal(target.nome,'parcela')
  const saved=JSON.stringify(store.doc)
  globalThis.localStorage.getItem=()=>saved
  setActivePinia(createPinia())
  assert.equal(useModelStore().columns[1].checks[0].expressao,'"parcela" >= 1')
})

test('remover coluna referenciada remove CHECK do construtor, preservando SQL avançado',async()=>{
  const {makeCheckBuilder}=await import('../src/checkBuilder.js')
  const store=parcelas()
  const [financeiro,numero]=store.columns
  const builder=makeCheckBuilder(numero)
  Object.assign(builder.grupos[0].condicoes[0],{origem:'coluna',valor:financeiro.nome})
  store.saveCheck(numero,null,'',builder)
  store.saveCheck(numero,null,'numero > 0')
  store.renameColumn(financeiro,'origem_id')
  assert.equal(numero.checks[0].expressao,'"numero" >= "origem_id"')
  assert.equal(store.removeColumn(financeiro.uid),1)
  assert.deepEqual(numero.checks.map(c=>c.expressao),['numero > 0'])
})

test('importação recusa construtor CHECK inconsistente com a expressão',async()=>{
  const {makeCheckBuilder}=await import('../src/checkBuilder.js')
  const store=parcelas()
  store.saveCheck(store.columns[1],null,'',makeCheckBuilder(store.columns[1]))
  const exported=JSON.parse(JSON.stringify(store.exported))
  exported.tabelas[0].colunas[1].checks[0].expressao='numero < 0'
  const original=store.doc
  assert.throws(()=>store.importData(exported),/não corresponde/)
  assert.equal(store.doc,original)
})
