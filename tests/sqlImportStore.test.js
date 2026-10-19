import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from '../src/stores/modelador.js'

const fixture = [
  'CREATE TYPE rpg.estado AS ENUM (\'ativo\',\'inativo\');',
  'CREATE TABLE rpg.fichas (id bigint PRIMARY KEY, nome varchar(100) NOT NULL);',
  'CREATE TABLE rpg.segredos (id bigint PRIMARY KEY, ficha_id bigint, tipo rpg.estado NOT NULL, CONSTRAINT segredos_ficha_fk FOREIGN KEY (ficha_id) REFERENCES rpg.fichas(id));',
  'CREATE TRIGGER segredos_trigger BEFORE DELETE ON rpg.segredos FOR EACH ROW EXECUTE FUNCTION rpg.bloquear();'
].join('\n')

function store(){
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}}
  setActivePinia(createPinia())
  return useModelStore()
}
test('mesclagem SQL preserva tabelas e colunas preexistentes',()=>{
  const s=store()
  s.importData({schema_alvo:'rpg',tabelas:[{nome:'fichas',colunas:[
    {nome:'id',tipo:'BIGINT',pk:true},{nome:'apelido',tipo:'TEXT',comentario:'Campo manual'}
  ]}]})
  const originalId=s.selected.uid
  const first=s.importSql(fixture,'merge')
  assert.equal(first.addedTables,1)
  assert.equal(first.addedColumns,4)
  assert.equal(s.doc.tabelas.length,2)
  assert.equal(s.doc.tabelas.find(t=>t.nome==='fichas').uid,originalId)
  assert.equal(s.doc.tabelas.find(t=>t.nome==='fichas').colunas.find(c=>c.nome==='apelido').comentario,'Campo manual')
  assert.equal(s.doc.tabelas.find(t=>t.nome==='segredos').sqlTriggers.length,1)
  const twice=s.importSql(fixture,'merge')
  assert.equal(twice.addedTables,0)
  assert.equal(twice.addedColumns,0)
  assert.equal(s.doc.tabelas.length,2)
  assert.equal(s.doc.enums.length,1)
  assert.equal(s.doc.tabelas.find(t=>t.nome==='segredos').sqlTriggers.length,1)
})
test('substituição carrega apenas tabelas do SQL',()=>{
  const s=store()
  s.importData({tabelas:[{nome:'legado',colunas:[{nome:'id'}]}]})
  const result=s.importSql(fixture,'replace')
  assert.equal(result.addedTables,2)
  assert.deepEqual(s.doc.tabelas.map(t=>t.nome),['fichas','segredos'])
  assert.equal(s.doc.enums[0].nome,'estado')
})
test('SQL inválido não modifica o documento e rejeita schema diferente na mesclagem',()=>{
  const s=store()
  s.addTable()
  const before=JSON.stringify(s.doc)
  assert.throws(()=>s.importSql('CREATE TABLE outro.testes (id bigint);','merge'),/schema/)
  assert.throws(()=>s.importSql('SELECT 1;','replace'),/CREATE TABLE/)
  assert.equal(JSON.stringify(s.doc),before)
})
test('o JSON exportado preserva ENUMs, funções, regras e triggers após nova importação',()=>{
  const s=store()
  s.importSql(fixture,'replace')
  const data=JSON.parse(JSON.stringify(s.exported))
  s.importData(data)
  assert.deepEqual(JSON.parse(JSON.stringify(s.exported)),data)
  assert.equal(s.doc.tabelas.find(t=>t.nome==='segredos').sqlRestricoes.length,1)
})
