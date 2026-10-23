// Cópia estrutural segura: não move a coluna nem transporta restrições SQL.
// A execução ocorre no documento local, nunca no banco PostgreSQL.
import { availableName, normalizedName } from './modelNames.js'

export function copyColumnsInDocument(doc,sourceId,targetId,ids){
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)
    throw new Error('Selecione pelo menos uma coluna, sem repetições.')
  if(sourceId===targetId)throw new Error('Escolha outra tabela como destino.')
  const source=doc.tabelas?.find(t=>t.uid===sourceId)
  const target=doc.tabelas?.find(t=>t.uid===targetId)
  if(!source||!target)throw new Error('A tabela de origem ou de destino não existe mais.')
  const requested=new Set(ids)
  const originals=source.colunas.filter(c=>requested.has(c.uid))
  if(originals.length!==requested.size)throw new Error('Uma das colunas não pertence à tabela de origem.')
  if(originals.some(c=>!normalizedName(c.nome)))throw new Error('Nomeie as colunas antes de copiá-las.')

  const targetColumns=[...target.colunas]
  const copies=originals.map(original=>{
    const column=JSON.parse(JSON.stringify(original))
    column.uid=crypto.randomUUID()
    column.nome=targetColumns.some(existing=>normalizedName(existing.nome)===normalizedName(original.nome))
      ?availableName(targetColumns,original.nome+'_copia'):original.nome
    // PK/UNIQUE/FK/CHECK são relações e regras, não a definição estrutural simples.
    column.pk=false
    column.unique=false
    column.uniqueComposto=false
    column.fk=false
    column.fkTabela=''
    column.fkColuna='id'
    column.checkEnabled=false
    column.checks=[]
    if(original.pk)column.imutavel=false
    if(/^GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(String(column.padrao||'').trim()))column.padrao=''
    targetColumns.push(column)
    return column
  })
  // Somente aplica após validar e preparar a lista inteira.
  target.colunas=targetColumns
  return {copied:copies.length,sourceId,targetId,columns:copies.map(c=>c.nome)}
}
