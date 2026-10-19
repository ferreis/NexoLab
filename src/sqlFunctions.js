// Funções PostgreSQL são mantidas como SQL, sem execução no navegador.
import { splitSqlStatements } from './sqlImport.js'

const IDENT='(?:"(?:[^"]|"")*"|[A-Za-z_][\\w$]*)'
const FN_RE=new RegExp('^\\s*CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+('+IDENT+'(?:\\s*\\.\\s*'+IDENT+')?)\\s*\\(','i')
const normalizeName=s=>String(s||'').replace(/^"|"$/g,'').replaceAll('""','"')
export function parseFunction(sql){
  const match=FN_RE.exec(String(sql||''))
  if(!match)return null
  const tokens=match[1].match(/"(?:[^"]|"")*"|[A-Za-z_][\w$]*/g)||[]
  return {schema:tokens.length>1?normalizeName(tokens[0]):'',name:normalizeName(tokens.at(-1)),qualified:tokens.map(normalizeName).join('.')}
}
export function validateFunctionSql(sql){
  const input=String(sql||'').trim()
  const statements=splitSqlStatements(input)
  const parsed=parseFunction(input)
  if(!parsed||statements.length!==1)throw new Error('Informe somente uma instrução CREATE FUNCTION ou CREATE OR REPLACE FUNCTION válida.')
  return parsed
}
export function functionNames(list=[]){
  return [...new Set(list.map(sql=>parseFunction(sql)?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'))
}
export function referencesInText(text,list=[]){
  const available=new Set(functionNames(list).map(name=>name.toLowerCase()))
  return [...new Set([...String(text||'').matchAll(/#([A-Za-z_][\w$]*)/g)].map(m=>m[1]).filter(name=>available.has(name.toLowerCase())))]
}
export function replaceFunctionReference(text,oldName,newName){
  if(!oldName||oldName===newName)return String(text||'')
  return String(text||'').replace(/#([A-Za-z_][\w$]*)/g,(full,name)=>name.toLowerCase()===oldName.toLowerCase()?'#'+newName:full)
}
export function functionTemplate(schema,name){
  if(!/^[A-Za-z_][\w$]*$/.test(name))throw new Error('Nome da função deve começar com letra ou _ e usar letras, números ou _.')
  const quoted=s=>'"'+String(s).replaceAll('"','""')+'"'
  return `CREATE OR REPLACE FUNCTION ${quoted(schema||'public')}.${quoted(name)}()\nRETURNS void\nLANGUAGE plpgsql\nAS $$\nBEGIN\n  NULL;\nEND;\n$$;`
}
