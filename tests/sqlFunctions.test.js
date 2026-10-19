import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from '../src/stores/modelador.js'
import { functionTemplate, parseFunction, functionNames, referencesInText, validateFunctionSql, replaceFunctionReference } from '../src/sqlFunctions.js'
import { formatText } from '../src/textExport.js'

const sql=`CREATE OR REPLACE FUNCTION "rpg"."validar_atualizacao"() RETURNS "trigger"
 LANGUAGE "plpgsql" AS $$ BEGIN NEW.atualizado_em:=now(); RETURN NEW; END $$;`

test('reconhece funções importadas, cria boilerplate e valida instrução isolada',()=>{
  assert.deepEqual(parseFunction(sql),{schema:'rpg',name:'validar_atualizacao',qualified:'rpg.validar_atualizacao'})
  assert.equal(validateFunctionSql(sql).name,'validar_atualizacao')
  const template=functionTemplate('rpg','nova_funcao')
  assert.equal(validateFunctionSql(template).name,'nova_funcao')
  assert.throws(()=>validateFunctionSql(template+' DROP TABLE rpg.arcos;'),/somente uma instrução/)
  assert.throws(()=>validateFunctionSql('SELECT 1;'),/CREATE FUNCTION/)
  assert.throws(()=>functionTemplate('rpg','nome inválido'),/Nome da função/)
})

test('texto livre e referências # coexistem com sugestões de funções',()=>{
  assert.deepEqual(functionNames([sql,functionTemplate('rpg','fn_teste'),sql]),['fn_teste','validar_atualizacao'])
  assert.deepEqual(referencesInText('Explica sem tag. #validar_atualizacao texto #inexistente #fn_teste',[sql,functionTemplate('rpg','fn_teste')]),['validar_atualizacao','fn_teste'])
  assert.equal(replaceFunctionReference('Não mudar #validar_atualizacao_extra, apenas #validar_atualizacao.','validar_atualizacao','outra'),'Não mudar #validar_atualizacao_extra, apenas #outra.')
})

test('funções, regras e referências sobrevivem a exportação e renomeação',()=>{
  globalThis.localStorage={getItem:()=>null,setItem:()=>{}}
  setActivePinia(createPinia())
  const store=useModelStore()
  store.importData({projeto:'RPG',schema_alvo:'rpg',tabelas:[{nome:'arcos',regras:'Validação: #validar_atualizacao e texto livre.',colunas:[{nome:'id',tipo:'BIGINT',descricao:'Usa #validar_atualizacao'}]}],funcoesSql:[sql],regrasSchema:'Todas as tabelas seguem #validar_atualizacao.'})
  const newSql=sql.replace('validar_atualizacao','validar_colunas')
  assert.equal(store.saveFunctionSql(newSql,0).name,'validar_colunas')
  assert.match(store.doc.regrasSchema,/#validar_colunas/)
  assert.match(store.doc.tabelas[0].regras,/#validar_colunas/)
  assert.match(store.doc.tabelas[0].colunas[0].descricao,/#validar_colunas/)
  assert.match(formatText(store.exported),/Regras do schema:/)
  assert.match(formatText(store.exported),/Regras da tabela:/)
  const data=JSON.parse(JSON.stringify(store.exported))
  store.importData(data)
  assert.match(store.doc.regrasSchema,/#validar_colunas/)
  assert.match(store.doc.tabelas[0].regras,/#validar_colunas/)
  assert.throws(()=>store.removeFunctionSql(0),/referenciada em regras/)
  store.doc.regrasSchema='Texto sem #.'
  store.doc.tabelas[0].regras='Outra regra comum.'
  store.doc.tabelas[0].colunas[0].descricao='Descrição simples.'
  store.removeFunctionSql(0)
  assert.equal(store.doc.funcoesSql.length,0)
})
