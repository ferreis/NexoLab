// Regras SQL que acompanham colunas movidas. Nenhum SQL é executado.
import { normalizedName } from './modelNames.js'
import { rewriteSqlIdentifiers } from './modelRefactor.js'
import { parseFunction } from './sqlFunctions.js'

const ID='(?:"(?:[^"]|"")*"|[A-Za-z_][\\w$]*)'
const NAME=ID+'(?:\\s*\\.\\s*'+ID+')?'
const ON=new RegExp('\\bON\\s+('+NAME+')(?=\\s|;|$)','i')
const CALL=new RegExp('\\bEXECUTE\\s+(?:FUNCTION|PROCEDURE)\\s+('+NAME+')\\s*\\(','i')
const ROW=new RegExp('\\b(?:NEW|OLD)\\s*\\.\\s*('+ID+')','gi')
const plain=s=>String(s||'').replace(/^"|"$/g,'').replaceAll('""','"')
const pieces=s=>String(s||'').match(/"(?:[^"]|"")*"|[A-Za-z_][\w$]*/g)?.map(plain)||[]
const equal=(a,b)=>normalizedName(a)===normalizedName(b)
const mentions=(sql,name)=>!!name&&rewriteSqlIdentifiers(sql,[{old:name,name:'__nexodb_moved_col__'}])!==sql
const mask=sql=>String(sql||'').replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'/g,m=>' '.repeat(m.length))
function rowFields(sql){
  const found=new Set()
  for(const m of mask(sql).matchAll(ROW))found.add(normalizedName(plain(m[1])))
  return found
}
function triggerFields(sql){
  const found=rowFields(sql)
  const update=/\bUPDATE\s+OF\s+([\s\S]*?)\s+ON\s+/i.exec(mask(sql))
  if(update)for(const name of pieces(update[1]))found.add(normalizedName(name))
  return found
}
function linkedFunction(sql,doc){
  const match=CALL.exec(mask(sql))
  if(!match)return null
  const wanted=pieces(match[1])
  const matches=(doc.funcoesSql||[]).filter(s=>{
    const fn=parseFunction(s)
    return fn&&equal(fn.name,wanted.at(-1))&&(wanted.length<2||equal(fn.schema||doc.schema||'rpg',wanted[0]))
  })
  if(matches.length!==1)throw new Error('A função “'+match[1]+'” da trigger não possui definição única no projeto.')
  return matches[0]
}
function changeTriggerTable(sql,on,target){
  const name=on[1]
  const tokens=name.match(/"(?:[^"]|"")*"|[A-Za-z_][\w$]*/g)||[]
  const last=tokens.at(-1)
  const before=name.slice(0,name.lastIndexOf(last))
  const quoted='"'+String(target.nome).replaceAll('"','""')+'"'
  const start=on.index+on[0].indexOf(name)
  return sql.slice(0,start)+before+quoted+sql.slice(start+name.length)
}
function constraintName(sql){
  return plain(/^\s*CONSTRAINT\s+("(?:[^"]|"")*"|[\w$]+)/i.exec(sql)?.[1])
}
function triggerName(sql){
  return plain(/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+("(?:[^"]|"")*"|[\w$]+)/i.exec(sql)?.[1])
}

export function planTransferSql(doc,source,target,moved,retained){
  const selectedNames=new Set(moved.map(c=>normalizedName(c.nome)))
  const retainedNames=new Set(retained.map(c=>normalizedName(c.nome)))
  const restrictions=[]
  const originalRestrictions=new Set()
  for(const sql of source.sqlRestricoes||[]){
    if(!moved.some(c=>mentions(sql,c.nome)))continue
    if(!/^\s*(?:CONSTRAINT\s+(?:"(?:[^"]|"")*"|[\w$]+)\s+)?CHECK\s*\(/i.test(sql)){
      throw new Error('Uma definição SQL importada (sqlRestricoes) referencia colunas transferidas. Revise a restrição.')
    }
    const other=retained.find(c=>mentions(sql,c.nome))
    if(other)throw new Error('O CHECK SQL depende também de “'+other.nome+'”. Transfira as colunas juntas.')
    const name=constraintName(sql)
    if(name&&(target.sqlRestricoes||[]).some(other=>equal(constraintName(other),name)))
      throw new Error('Já existe uma restrição CHECK chamada “'+name+'” no destino.')
    restrictions.push(sql)
    originalRestrictions.add(sql)
  }
  for(const column of moved)for(const check of column.checks||[]){
    if(check.origemRestricao&&!originalRestrictions.has(check.origemRestricao))
      throw new Error('O CHECK SQL importado de “'+column.nome+'” não pode acompanhar esta transferência.')
  }

  const triggers=[]
  const originals=new Set()
  for(const sql of source.sqlTriggers||[]){
    const on=ON.exec(mask(sql))
    if(!on||!equal(pieces(on[1]).at(-1),source.nome))
      throw new Error('Não foi possível identificar a tabela original de uma trigger importada.')
    const fn=linkedFunction(sql,doc)
    const fields=triggerFields(sql)
    if(fn)for(const name of rowFields(fn))fields.add(name)
    const selected=[...fields].filter(name=>selectedNames.has(name))
    if(!selected.length)continue // Trigger não relacionada: permanece na origem.
    const retainedName=[...fields].find(name=>retainedNames.has(name))
    if(retainedName)throw new Error('A trigger depende também de “'+retainedName+'”, que permanecerá na origem.')
    if(!fn)throw new Error('A trigger das colunas selecionadas não possui função SQL verificável no projeto.')
    const unknown=[...fields].find(name=>!selectedNames.has(name)&&!retainedNames.has(name))
    if(unknown)throw new Error('A função da trigger referencia a coluna desconhecida “'+unknown+'”.')
    const functionBody=mask(fn)
    if(/\bEXECUTE\b/i.test(functionBody))throw new Error('A função usa SQL dinâmico; revise a trigger antes de transferir.')
    const TABLE_CALL=new RegExp('\\b(?:FROM|UPDATE|INTO|JOIN)\\s+('+NAME+')','gi')
    for(const match of functionBody.matchAll(TABLE_CALL))
      if(equal(pieces(match[1]).at(-1),source.nome))
        throw new Error('A função consulta a tabela original diretamente. Revise a definição SQL antes de mover.')
    const name=triggerName(sql)
    if(name&&(target.sqlTriggers||[]).some(other=>equal(triggerName(other),name)))
      throw new Error('Já existe uma trigger chamada “'+name+'” na tabela de destino.')
    triggers.push(changeTriggerTable(sql,on,target))
    originals.add(sql)
  }
  for(const field of ['sqlIndices','sqlPoliticas'])for(const sql of source[field]||[]){
    if(moved.some(c=>mentions(sql,c.nome)))
      throw new Error('Uma definição SQL ('+field+') depende das colunas selecionadas. Revise-a antes de mover.')
  }
  return {
    triggers:triggers.length,
    checks:restrictions.length,
    apply(){
      source.sqlRestricoes=(source.sqlRestricoes||[]).filter(sql=>!originalRestrictions.has(sql))
      target.sqlRestricoes=[...(target.sqlRestricoes||[]),...restrictions]
      source.sqlTriggers=(source.sqlTriggers||[]).filter(sql=>!originals.has(sql))
      target.sqlTriggers=[...(target.sqlTriggers||[]),...triggers]
    }
  }
}
