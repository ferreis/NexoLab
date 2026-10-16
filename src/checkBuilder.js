export const CHECK_OPERATORS=[['=','Igual a'],['<>','Diferente de'],['>','Maior que'],['>=','Maior ou igual a'],['<','Menor que'],['<=','Menor ou igual a'],['IS NULL','Está vazio (NULL)'],['IS NOT NULL','Está preenchido']]
const numericTypes=['BIGINT','INTEGER','SMALLINT','NUMERIC']
export const isNumericColumn=column=>numericTypes.includes(column?.tipo)
export const cloneBuilder=builder=>JSON.parse(JSON.stringify(builder))
export const makeCondition=column=>({coluna:column?.nome||'',operador:isNumericColumn(column)?'>=':'=',origem:'valor',tipoValor:column?.tipo==='BOOLEAN'?'boolean':isNumericColumn(column)?'numero':'texto',valor:column?.tipo==='BOOLEAN'?'true':isNumericColumn(column)?'1':column?.tipo==='ENUM'?(column.enumValores?.[0]||''):''})
export const makeCheckBuilder=column=>({operador:'AND',grupos:[{operador:'AND',condicoes:[makeCondition(column)]}]})
export const builderUsesColumn=(builder,name)=>builder.grupos.some(group=>group.condicoes.some(condition=>condition.coluna===name||(condition.origem==='coluna'&&condition.valor===name)))
const quoteName=name=>`"${name.replaceAll('"','""')}"`
function join(items,operator){
  if(!['AND','OR'].includes(operator)||!Array.isArray(items)||!items.length)throw new Error('Adicione ao menos uma condição em cada grupo.')
  return items.length===1?items[0]:`(${items.join(` ${operator} `)})`
}
export function compileCheckBuilder(builder,columns){
  if(!builder||!Array.isArray(builder.grupos))throw new Error('Construtor CHECK inválido.')
  return join(builder.grupos.map(group=>{
    if(!Array.isArray(group.condicoes))throw new Error('Grupo CHECK inválido.')
    return join(group.condicoes.map(condition=>{
      const column=columns.find(c=>c.nome===condition.coluna&&c.nome.trim())
      if(!column)throw new Error('Selecione uma coluna existente para cada condição.')
      if(!CHECK_OPERATORS.some(([operator])=>operator===condition.operador))throw new Error('Selecione um operador válido.')
      const left=`${quoteName(column.nome)} ${condition.operador}`
      if(['IS NULL','IS NOT NULL'].includes(condition.operador))return left
      if(condition.origem==='coluna'){
        const other=columns.find(c=>c.nome===condition.valor&&c.nome.trim())
        if(!other)throw new Error('Selecione a coluna que será comparada.')
        return `${left} ${quoteName(other.nome)}`
      }
      if(condition.origem!=='valor'||typeof condition.valor!=='string')throw new Error('Informe o valor da condição.')
      const kind=condition.tipoValor||(isNumericColumn(column)?'numero':column.tipo==='BOOLEAN'?'boolean':'texto')
      if(!['numero','boolean','texto'].includes(kind))throw new Error('Tipo de valor inválido.')
      if(kind==='numero'){
        if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(condition.valor.trim()))throw new Error('Escolha um valor numérico válido.')
        return `${left} ${condition.valor.trim()}`
      }
      if(kind==='boolean'){
        if(!['true','false'].includes(condition.valor))throw new Error('Selecione verdadeiro ou falso.')
        return `${left} ${condition.valor.toUpperCase()}`
      }
      return `${left} '${condition.valor.replaceAll("'","''")}'`
    }),group.operador)
  }),builder.operador)
}
