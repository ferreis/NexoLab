const quoteName=name=>`"${String(name).replaceAll('"','""')}"`

function formatComment(kind,names,comment=''){
  if(!comment.trim())return ''
  const escaped=comment.replaceAll('\\','\\\\').replaceAll("'","''")
  return `COMMENT ON ${kind} ${names.map(quoteName).join('.')} IS\n${comment.includes('\\')?'E':''}'${escaped}';`
}

export const formatTableComment=(schema,table)=>formatComment('TABLE',[schema,table.nome],table.comentario)
export const formatColumnComment=(schema,table,column)=>formatComment('COLUMN',[schema,table.nome,column.nome],column.comentario)
