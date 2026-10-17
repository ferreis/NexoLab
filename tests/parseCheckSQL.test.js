import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCheckSQL } from '../src/parseCheckSQL.js'
import { compileCheckBuilder, checkChildren, isCheckGroup, normalizeCheckBuilder, makeCheckBuilder } from '../src/checkBuilder.js'
const columns=[{nome:'mundo',tipo:'BOOLEAN'},{nome:'ficha_id',tipo:'BIGINT'},{nome:'organizacao_id',tipo:'BIGINT'},{nome:'nome',tipo:'TEXT'}]
export const example='(mundo = TRUE AND ficha_id IS NULL AND organizacao_id IS NULL) OR (mundo = FALSE AND ((ficha_id IS NOT NULL AND organizacao_id IS NULL) OR (ficha_id IS NULL AND organizacao_id IS NOT NULL)))'
const and=values=>values.includes(false)?false:values.includes(null)?null:true
const or=values=>values.includes(true)?true:values.includes(null)?null:false
function evaluate(node,row){
  if(isCheckGroup(node))return (node.operador==='AND'?and:or)(checkChildren(node).map(child=>evaluate(child,row)))
  const value=row[node.coluna]
  if(node.operador==='IS NULL')return value===null
  if(node.operador==='IS NOT NULL')return value!==null
  const right=node.origem==='coluna'?row[node.valor]:node.tipoValor==='boolean'?node.valor==='true':node.tipoValor==='numero'?Number(node.valor):node.valor
  if(node.operador==='IS DISTINCT FROM')return value!==right
  if(node.operador==='IS NOT DISTINCT FROM')return value===right
  if(value===null||right===null)return null
  if(node.operador==='=')return value===right
  throw new Error('Operador de teste não implementado')
}

test('converte o exemplo do usuário com todos os níveis e preserva sua lógica de três valores',()=>{
  const tree=parseCheckSQL(example,columns)
  assert.equal(tree.operador,'OR')
  assert.equal(tree.itens[1].itens[1].operador,'OR')
  assert.equal(tree.itens[1].itens[1].itens[0].operador,'AND')
  const reparsed=parseCheckSQL(compileCheckBuilder(tree,columns),columns)
  for(const mundo of [true,false,null])for(const ficha_id of [null,1])for(const organizacao_id of [null,2]){
    const bothNull=ficha_id===null&&organizacao_id===null
    const oneNull=(ficha_id===null)!==(organizacao_id===null)
    const expected=mundo===true?bothNull:mundo===false?oneNull:bothNull||oneNull?null:false
    const row={mundo,ficha_id,organizacao_id}
    assert.equal(evaluate(tree,row),expected)
    assert.equal(evaluate(reparsed,row),expected)
  }
})

test('AND tem precedência sobre OR e parênteses alteram a árvore',()=>{
  const tree=parseCheckSQL('mundo = TRUE OR ficha_id = 1 AND organizacao_id = 2',columns)
  assert.equal(tree.operador,'OR')
  assert.equal(tree.itens[1].operador,'AND')
  const grouped=parseCheckSQL('(mundo = TRUE OR ficha_id = 1) AND organizacao_id = 2',columns)
  assert.equal(grouped.operador,'AND')
  assert.equal(grouped.itens[0].operador,'OR')
})

test('aceita CHECK completo, espaços, comentários, aspas e comparação entre colunas',()=>{
  const tree=parseCheckSQL('/* inicio */ CHECK (MUNDO = false OR "ficha_id" >= organizacao_id); -- fim',columns)
  assert.equal(compileCheckBuilder(tree,columns),'("mundo" = FALSE OR "ficha_id" >= "organizacao_id")')
  const quoted=parseCheckSQL('nome = \'a\'\' AND (OR)\'',columns)
  assert.equal(compileCheckBuilder(quoted,columns),'"nome" = \'a\'\' AND (OR)\'')
  assert.equal(compileCheckBuilder(parseCheckSQL('ficha_id != -1.5e2',columns),columns),'"ficha_id" <> -1.5e2')
  const special=[{nome:'nome"especial',tipo:'TEXT'}]
  assert.equal(compileCheckBuilder(parseCheckSQL('"nome""especial" = \'ok\'',special),special),'"nome""especial" = \'ok\'')
})

test('não converte parcialmente funções, casts, operações ou outras construções desconhecidas',()=>{
  for(const sql of ['length(nome) > 0','NOT (mundo = TRUE)','ficha_id IN (1,2)','ficha_id BETWEEN 1 AND 2','ficha_id + 1 > 2','mundo::text = \'true\'','ficha_id = NULL','mundo = TRUE; DELETE FROM x','inexistente = 1','(mundo = TRUE','nome = \'sem fim','mundo = TRUE /*']){
    assert.throws(()=>parseCheckSQL(sql,columns),undefined,sql)
  }
})

test('árvores antigas continuam compilando da mesma forma após normalização',()=>{
  const old=makeCheckBuilder(columns[1])
  assert.equal(compileCheckBuilder(normalizeCheckBuilder(old),columns),compileCheckBuilder(old,columns))
  let nested=normalizeCheckBuilder(old)
  for(let i=0;i<12;i++)nested={operador:i%2?'AND':'OR',itens:[{coluna:'mundo',operador:'=',origem:'valor',tipoValor:'boolean',valor:'true'},nested]}
  assert.doesNotThrow(()=>compileCheckBuilder(nested,columns))
})

test('não interpreta constantes SQL como colunas homônimas sem aspas',()=>{
  const names=[...columns,{nome:'current_date',tipo:'DATE'}]
  assert.throws(()=>parseCheckSQL('current_date = nome',names),/avançado/)
  assert.equal(compileCheckBuilder(parseCheckSQL('"current_date" = nome',names),names),'"current_date" = "nome"')
})

test('converte num_nonnulls e DISTINCT FROM do usuário preservando NULL e comparações entre IDs',()=>{
  const names=['origem_ficha_id','origem_organizacao_id','destino_ficha_id','destino_organizacao_id']
  const ids=names.map(nome=>({nome,tipo:'BIGINT'}))
  const sql=`(num_nonnulls(origem_ficha_id, origem_organizacao_id) = 1
    AND num_nonnulls(destino_ficha_id, destino_organizacao_id) = 1
    AND origem_ficha_id IS DISTINCT FROM destino_ficha_id
    AND origem_organizacao_id IS DISTINCT FROM destino_organizacao_id)`
  const tree=parseCheckSQL(sql,ids)
  const compiled=compileCheckBuilder(tree,ids)
  const reparsed=parseCheckSQL(compiled,ids)
  assert.equal(tree.itens[0].operador,'OR')
  assert.match(compiled,/"origem_ficha_id" IS DISTINCT FROM "destino_ficha_id"/)
  for(const a of [null,1,2])for(const b of [null,1,2])for(const c of [null,1,2])for(const d of [null,1,2]){
    const row=Object.fromEntries(names.map((name,index)=>[name,[a,b,c,d][index]]))
    const expected=[a,b].filter(v=>v!==null).length===1&&[c,d].filter(v=>v!==null).length===1&&a!==c&&b!==d
    assert.equal(evaluate(tree,row),expected,JSON.stringify(row))
    assert.equal(evaluate(reparsed,row),expected,JSON.stringify(row))
  }
})

test('DISTINCT FROM e NOT DISTINCT FROM preservam igualdade e diferença incluindo NULL',()=>{
  for(const operator of ['IS DISTINCT FROM','IS NOT DISTINCT FROM']){
    const tree=parseCheckSQL(`ficha_id ${operator} organizacao_id`,columns)
    assert.equal(compileCheckBuilder(tree,columns),`"ficha_id" ${operator} "organizacao_id"`)
    for(const ficha_id of [null,1,2])for(const organizacao_id of [null,1,2]){
      assert.equal(evaluate(tree,{ficha_id,organizacao_id}),operator==='IS DISTINCT FROM'?ficha_id!==organizacao_id:ficha_id===organizacao_id)
    }
    const literal=parseCheckSQL(`ficha_id ${operator} 1`,columns)
    assert.equal(compileCheckBuilder(literal,columns),`"ficha_id" ${operator} 1`)
  }
})

test('num_nonnulls aceita colunas com aspas e valida todos os argumentos sem converter parcialmente',()=>{
  assert.doesNotThrow(()=>parseCheckSQL('NUM_NONNULLS("ficha_id", "organizacao_id") = 1',columns))
  assert.doesNotThrow(()=>parseCheckSQL('"num_nonnulls" = 1',[{nome:'num_nonnulls',tipo:'BIGINT'}]))
  for(const sql of [
    'num_nonnulls(ficha_id) = 1',
    'num_nonnulls(ficha_id, organizacao_id, nome) = 1',
    'num_nonnulls(ficha_id, inexistente) = 1',
    'num_nonnulls(ficha_id, 1) = 1',
    'num_nonnulls(ficha_id, organizacao_id) = 2',
    'num_nonnulls(ficha_id, organizacao_id) > 1',
    'num_nonnulls(ficha_id, organizacao_id) = 1 + 1',
    'ficha_id IS DISTINCT organizacao_id',
    'ficha_id IS NOT DISTINCT FROM'
  ])assert.throws(()=>parseCheckSQL(sql,columns),undefined,sql)
})
