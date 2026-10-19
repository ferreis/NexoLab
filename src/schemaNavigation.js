import { parseFunction } from './sqlFunctions.js'

const unquote=value=>String(value||'').replace(/^"|"$/g,'').replaceAll('""','"')
const triggerIdentifier=/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+("(?:[^"]|"")*"|[a-z_][\w$]*)/i

export function triggerName(sql){
  const match=triggerIdentifier.exec(String(sql||''))
  return match?unquote(match[1]):'Trigger sem nome'
}

const sortByName=entries=>entries.sort((a,b)=>a.label.localeCompare(b.label,'pt-BR',{sensitivity:'base'}))

export function schemaCategories(document){
  const tables=document?.tabelas||[]
  return [
    {value:'tables',label:'Tabelas',count:tables.length},
    {value:'enums',label:'Enum',count:(document?.enums||[]).length},
    {value:'triggers',label:'Triggers',count:tables.reduce((n,t)=>n+(t.sqlTriggers?.length||0),0)},
    {value:'functions',label:'Functions',count:(document?.funcoesSql||[]).length}
  ]
}

export function schemaEntries(document,category){
  if(category==='tables')return sortByName((document?.tabelas||[]).map(t=>({
    key:t.uid||t.nome,label:t.nome||'Sem nome',count:t.colunas?.length||0,tableId:t.uid
  })))
  if(category==='enums')return sortByName((document?.enums||[]).map((e,index)=>({
    key:`enum-${index}`,index,label:e.nome||'ENUM sem nome',count:e.valores?.length||0
  })))
  if(category==='triggers')return sortByName((document?.tabelas||[]).flatMap(t=>(t.sqlTriggers||[]).map((sql,index)=>({
    key:`trigger-${t.uid||t.nome}-${index}`,index,tableId:t.uid,tableName:t.nome,label:triggerName(sql),sql
  }))))
  if(category==='functions')return sortByName((document?.funcoesSql||[]).map((sql,index)=>({
    key:`function-${index}`,index,label:parseFunction(sql)?.name||`Função ${index+1}`,sql
  })))
  return []
}
