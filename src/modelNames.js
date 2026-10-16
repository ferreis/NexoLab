export const normalizedName=value=>String(value??'').trim().toLowerCase()

export function nameConflict(items,name,except){
  const key=normalizedName(name)
  return !!key&&items.some(item=>item!==except&&normalizedName(item.nome)===key)
}

export function availableName(items,base,except){
  let name=base, suffix=2
  while(nameConflict(items,name,except))name=`${base}_${suffix++}`
  return name
}

export function duplicateNameError(tables){
  const names=new Set()
  for(const table of tables){
    const name=normalizedName(table.nome)
    if(name&&names.has(name))return `Já existe uma tabela com o nome “${table.nome.trim()}”. Renomeie uma das tabelas.`
    if(name)names.add(name)
    const columns=new Set()
    for(const column of table.colunas){
      const name=normalizedName(column.nome)
      if(name&&columns.has(name))return `A tabela “${table.nome}” tem colunas com o nome “${column.nome.trim()}”. Renomeie uma das colunas.`
      if(name)columns.add(name)
    }
  }
  return ''
}
