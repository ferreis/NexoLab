import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeCheckBuilder, makeCondition, compileCheckBuilder } from '../src/checkBuilder.js'
const columns=[{nome:'numero',tipo:'SMALLINT'},{nome:'limite',tipo:'INTEGER'},{nome:'ficha_id',tipo:'BIGINT'},{nome:'organizacao_id',tipo:'BIGINT'},{nome:'ativo',tipo:'BOOLEAN'},{nome:'status',tipo:'TEXT'}]

test('atalho numérico gera condição sem precisar escrever SQL',()=>{
  const builder=makeCheckBuilder(columns[0])
  assert.equal(compileCheckBuilder(builder,columns),'"numero" >= 1')
  builder.grupos[0].condicoes[0].operador='>'
  builder.grupos[0].condicoes[0].valor='0'
  assert.equal(compileCheckBuilder(builder,columns),'"numero" > 0')
})

test('grupos E/OU preservam parênteses e regras exclusivas de NULL',()=>{
  const builder={operador:'OR',grupos:[{operador:'AND',condicoes:[{coluna:'ficha_id',operador:'IS NOT NULL'},{coluna:'organizacao_id',operador:'IS NULL'}]},{operador:'AND',condicoes:[{coluna:'ficha_id',operador:'IS NULL'},{coluna:'organizacao_id',operador:'IS NOT NULL'}]}]}
  assert.equal(compileCheckBuilder(builder,columns),'(("ficha_id" IS NOT NULL AND "organizacao_id" IS NULL) OR ("ficha_id" IS NULL AND "organizacao_id" IS NOT NULL))')
})

test('compara colunas, booleanos e texto com escape correto',()=>{
  const builder=makeCheckBuilder(columns[0])
  Object.assign(builder.grupos[0].condicoes[0],{origem:'coluna',valor:'limite',operador:'<='})
  assert.equal(compileCheckBuilder(builder,columns),'"numero" <= "limite"')
  const bool=makeCheckBuilder(columns[4])
  assert.equal(compileCheckBuilder(bool,columns),'"ativo" = TRUE')
  const text=makeCheckBuilder(columns[5])
  text.grupos[0].condicoes[0].valor="d'água"
  assert.equal(compileCheckBuilder(text,columns),'"status" = \'d\'\'água\'')
  assert.equal(makeCondition({nome:'estado',tipo:'ENUM',enumValores:['ativo','inativo']}).valor,'ativo')
})

test('rejeita condições incompletas, grupos vazios, operadores e números inválidos',()=>{
  const builder=makeCheckBuilder(columns[0])
  builder.grupos[0].condicoes[0].valor='1; DROP TABLE x'
  assert.throws(()=>compileCheckBuilder(builder,columns),/numérico/)
  builder.grupos[0].condicoes[0].coluna='inexistente'
  assert.throws(()=>compileCheckBuilder(builder,columns),/coluna existente/)
  builder.grupos[0].condicoes=[]
  assert.throws(()=>compileCheckBuilder(builder,columns),/condição/)
})
