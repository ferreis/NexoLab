// Filtra a representação exportada, preservando o documento original e suas regras.
// O modo 'complete' mantém compatibilidade com todos os JSONs existentes.
export function prepareExport(project,mode='complete'){
  if(!['complete','structure'].includes(mode))throw new Error('Modo de exportação inválido.')
  if(mode==='complete')return project
  if(!project||!Array.isArray(project.tabelas))throw new Error('Modelo do projeto inválido.')
  const {funcoesSql,comentariosSql,...rest}=project
  return {
    ...rest,
    ...(comentariosSql?.length?{comentariosSql:comentariosSql.filter(sql=>!/^\s*COMMENT\s+ON\s+(?:FUNCTION|TRIGGER)\b/i.test(sql))}:{}),
    tabelas:project.tabelas.map(table=>{
      const {sqlTriggers,sqlRestricoes,...fields}=table
      const otherConstraints=(sqlRestricoes||[]).filter(sql=>!/\bCHECK\s*\(/i.test(sql))
      return {
        ...fields,
        ...(otherConstraints.length?{sqlRestricoes:otherConstraints}:{}),
        colunas:(table.colunas||[]).map(column=>{
          const {checks,checkEnabled,...base}=column
          return {...base,checks:[]}
        })
      }
    })
  }
}
