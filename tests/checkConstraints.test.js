import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatCheckSQL, formatCheckText } from '../src/checkConstraints.js'

test('formata cláusulas CHECK simples e compostas sem reescrever SQL',()=>{
  for(const expression of ['valor > 0','numero >= 1',"status = 'ativo' OR status IS NULL",'(ficha_id IS NOT NULL AND organizacao_id IS NULL)\nOR (ficha_id IS NULL AND organizacao_id IS NOT NULL)']){
    assert.equal(formatCheckSQL(expression),`CHECK (\n${expression}\n)`)
  }
})

test('fechamento do CHECK fica fora de comentários de fim de linha',()=>{
  assert.equal(formatCheckSQL('numero >= 1 -- mínimo'), 'CHECK (\nnumero >= 1 -- mínimo\n)')
})

test('CHECK no TXT ocupa uma linha e remove só os parênteses externos redundantes',()=>{
  assert.equal(formatCheckText('\n ((numero >= 1)) \n'),'CHECK (numero >= 1)')
  assert.equal(formatCheckText('((a = TRUE AND b IS NULL)\n OR (a = FALSE AND (b IS NOT NULL OR c IS NULL)))'),
    'CHECK ((a = TRUE AND b IS NULL) OR (a = FALSE AND (b IS NOT NULL OR c IS NULL)))')
  assert.equal(formatCheckText('(a = 1 OR b = 2) AND c > 0'),'CHECK ((a = 1 OR b = 2) AND c > 0)')
})

test('CHECK compacto distingue comentários de valores e identificadores entre aspas',()=>{
  assert.equal(formatCheckText("((nome = 'texto  com -- comentário e )' AND \"coluna)\" > 0)) -- anotação"),
    "CHECK (nome = 'texto  com -- comentário e )' AND \"coluna)\" > 0)")
  assert.equal(formatCheckText('numero /* nota /* interna */ ainda nota */ >= 1 -- mínimo\nAND valor > 0'),
    'CHECK (numero >= 1 AND valor > 0)')
  assert.equal(formatCheckText("nome = $tag$) -- texto  literal$tag$"),"CHECK (nome = $tag$) -- texto  literal$tag$)")
})

test('CHECK compacto não altera funções nem literais multilinha e com escapes',()=>{
  assert.equal(formatCheckText("((length(nome) > 0))"),'CHECK (length(nome) > 0)')
  assert.equal(formatCheckText("nome = 'linha\noutra'"),"CHECK (nome = 'linha\\noutra')")
  assert.equal(formatCheckText(String.raw`nome = E'aspas\' e )'`),String.raw`CHECK (nome = E'aspas\' e )')`)
})
