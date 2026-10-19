import test from 'node:test'
import assert from 'node:assert/strict'
import { schemaCategories, schemaEntries, triggerName } from '../src/schemaNavigation.js'

const model={
  tabelas:[
    {uid:'b',nome:'cenas',colunas:[{nome:'id'}],sqlTriggers:[
      'CREATE TRIGGER "atualizar_cenas" BEFORE UPDATE ON "rpg"."cenas" FOR EACH ROW EXECUTE FUNCTION rpg.validar();',
      'CREATE OR REPLACE TRIGGER validar_cena BEFORE INSERT ON rpg.cenas FOR EACH ROW EXECUTE FUNCTION rpg.validar();'
    ]},
    {uid:'a',nome:'arcos',colunas:[{nome:'id'},{nome:'nome'}],sqlTriggers:['CREATE TRIGGER atualizar_arcos BEFORE UPDATE ON rpg.arcos FOR EACH ROW EXECUTE FUNCTION rpg.validar();']}
  ],
  enums:[
    {schema:'rpg',nome:'situacao',valores:['vivo','morto']},
    {schema:'rpg',nome:'categoria',valores:['a']}
  ],
  funcoesSql:[
    'CREATE OR REPLACE FUNCTION rpg.validar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;',
    'CREATE FUNCTION "rpg"."fn_contexto_cena"() RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;'
  ]
}

test('categorias contam tabelas, enums, triggers por tabela e funções globais',()=>{
  assert.deepEqual(schemaCategories(model),[
    {value:'tables',label:'Tabelas',count:2},
    {value:'enums',label:'Enum',count:2},
    {value:'triggers',label:'Triggers',count:3},
    {value:'functions',label:'Functions',count:2}
  ])
})

test('listas exibem cada objeto real, com ordenação e vínculo da trigger à tabela',()=>{
  assert.deepEqual(schemaEntries(model,'tables').map(e=>[e.label,e.count,e.tableId]),[['arcos',2,'a'],['cenas',1,'b']])
  assert.deepEqual(schemaEntries(model,'enums').map(e=>[e.label,e.count,e.index]),[['categoria',1,1],['situacao',2,0]])
  const triggers=schemaEntries(model,'triggers')
  assert.deepEqual(triggers.map(e=>e.label),['atualizar_arcos','atualizar_cenas','validar_cena'])
  assert.equal(triggers[1].tableId,'b')
  assert.equal(triggers[1].tableName,'cenas')
  assert.equal(triggers[1].index,0)
  assert.deepEqual(schemaEntries(model,'functions').map(e=>e.label),['fn_contexto_cena','validar'])
})

test('nomes de trigger SQL quoted e objetos ausentes são tolerados',()=>{
  assert.equal(triggerName('CREATE OR REPLACE TRIGGER "Meu ""Trigger""" BEFORE INSERT ON rpg.tabela EXECUTE FUNCTION rpg.f();'),'Meu "Trigger"')
  assert.equal(triggerName('CREATE TRIGGER trigger_x AFTER UPDATE ON rpg.t FOR EACH ROW EXECUTE FUNCTION rpg.f();'),'trigger_x')
  assert.deepEqual(schemaCategories({tabelas:[]}).map(x=>x.count),[0,0,0,0])
  assert.deepEqual(schemaEntries({},'triggers'),[])
  assert.deepEqual(schemaEntries(model,'desconhecido'),[])
})
