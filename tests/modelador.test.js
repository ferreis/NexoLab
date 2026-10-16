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
