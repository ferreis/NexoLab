// A visualização de uma tabela não carrega objetos globais do schema.
// Mantém apenas as definições pertencentes à própria tabela para TXT/JSON.
export function tablePreview(project, tableName){
  if(!project || !Array.isArray(project.tabelas))throw new Error('Modelo de projeto inválido.')
  const table=project.tabelas.find(t=>t.nome===tableName)
  const {enums,funcoesSql,comentariosSql,...tableScoped}=project
  return {...tableScoped,tabelas:table?[table]:[]}
}
