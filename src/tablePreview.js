// Prévia de tabela compacta por padrão; modo completo inclui SQL vinculado.
// A prévia completa do schema continua disponível sem perda dos objetos SQL importados.
import { parseFunction, referencesInText } from './sqlFunctions.js'

const isRelevantConstraint=sql=>/\b(?:CHECK\s*\(|FOREIGN\s+KEY)\b/i.test(String(sql||''))||/\bCHECK\s*\(/i.test(String(sql||''))
export function tablePreview(project,tableIndex,{includeSql=false}={}){
  if(!project||!Array.isArray(project.tabelas))throw new Error('Modelo de projeto inválido.')
  const source=project.tabelas[tableIndex]
  const table=source&&{
    nome:source.nome,
    ...(source.comentario?{comentario:source.comentario}:{}),
    ...(source.regras?{regras:source.regras}:{}),
    ...(source.finalidade?{finalidade:source.finalidade}:{}),
    uniqueCompostos:source.uniqueCompostos||[],
    colunas:(source.colunas||[]).map(c=>({
      nome:c.nome,tipo:c.tipo,...(c.tamanho?{tamanho:c.tamanho}:{}),...(c.escala?{escala:c.escala}:{}),
      pk:!!c.pk,nullable:!!c.nullable,unique:!!c.unique,
      ...(c.fk?{fk:true,fkTabela:c.fkTabela,fkColuna:c.fkColuna}:{}),
      ...(c.padrao?{padrao:c.padrao}:{}),...(c.imutavel?{imutavel:true}:{}),
      ...(c.tipo==='ENUM'?{enumValores:c.enumValores||[]}:{}),
      ...(c.descricao?{descricao:c.descricao}:{}),
      ...(c.comentario?{comentario:c.comentario}:{}),
      checks:(c.checks||[]).map(check=>({expressao:check.expressao}))
    })),
    ...(source.sqlRestricoes?.some(isRelevantConstraint)?{sqlRestricoes:source.sqlRestricoes.filter(isRelevantConstraint).filter(sql=>!(source.colunas||[]).some(c=>(c.checks||[]).some(check=>check.origemRestricao===sql)))}:{}),
    ...(includeSql&&source.sqlTriggers?.length?{sqlTriggers:[...source.sqlTriggers]}:{}),
    ...(includeSql&&source.sqlIndices?.length?{sqlIndices:[...source.sqlIndices]}:{}),
    ...(includeSql&&source.sqlPoliticas?.length?{sqlPoliticas:[...source.sqlPoliticas]}:{})
  }
  if(!table||!includeSql)return {schema_alvo:project.schema_alvo,tabelas:table?[table]:[]}
  const calls=(source.sqlTriggers||[]).flatMap(sql=>[...String(sql).matchAll(/\bEXECUTE\s+(?:FUNCTION|PROCEDURE)\s+((?:\"(?:[^\"]|\"\")*\"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:\"(?:[^\"]|\"\")*\"|[A-Za-z_][\w$]*))?)\s*\(/gi)].map(m=>m[1].split('.').at(-1).trim().replace(/^\"|\"$/g,'')))
  const mentioned=referencesInText([source.regras,...(source.colunas||[]).map(c=>c.descricao)].join('\n'),project.funcoesSql||[])
  const wanted=new Set([...calls,...mentioned].map(s=>s.toLowerCase()))
  const related=(project.funcoesSql||[]).filter(sql=>wanted.has(parseFunction(sql)?.name?.toLowerCase()))
  return {schema_alvo:project.schema_alvo,tabelas:[table],...(related.length?{funcoesSql:related}:{})}
}
