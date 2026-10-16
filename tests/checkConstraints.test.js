import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatCheckSQL } from '../src/checkConstraints.js'

test('formata cláusulas CHECK simples e compostas sem reescrever SQL',()=>{
  for(const expression of ['valor > 0','numero >= 1',"status = 'ativo' OR status IS NULL",'(ficha_id IS NOT NULL AND organizacao_id IS NULL)\nOR (ficha_id IS NULL AND organizacao_id IS NOT NULL)']){
    assert.equal(formatCheckSQL(expression),`CHECK (\n${expression}\n)`)
  }
})

test('fechamento do CHECK fica fora de comentários de fim de linha',()=>{
  assert.equal(formatCheckSQL('numero >= 1 -- mínimo'), 'CHECK (\nnumero >= 1 -- mínimo\n)')
})
