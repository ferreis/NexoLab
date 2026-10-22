// Transferência atômica de colunas entre tabelas do modelo (não executa SQL).
import { normalizedName } from './modelNames.js'
import { builderUsesColumn } from './checkBuilder.js'
import { planTransferSql } from './transferSqlDependencies.js'

import { rewriteSqlIdentifiers } from './modelRefactor.js'
const referenceMarker='__nexodb_transfer_column_reference__'
function mentionsIdentifier(sql,name){
  return !!name&&rewriteSqlIdentifiers(String(sql??''),[{old:name,name:referenceMarker}])!==String(sql??'')
}
function checkMentions(check,name){
  return check.construtor
    ? builderUsesColumn(check.construtor,name)
    : mentionsIdentifier(check.expressao,name)
}
function columnLabel(column){return column.nome||'(sem nome)'}

export function transferColumnsInDocument(doc,sourceId,targetId,ids){
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw new Error('Selecione pelo menos uma coluna, sem repetições.')
  if(sourceId===targetId)throw new Error('Escolha outra tabela como destino.')
  const source=doc.tabelas.find(t=>t.uid===sourceId)
  const target=doc.tabelas.find(t=>t.uid===targetId)
  if(!source||!target)throw new Error('A tabela de origem ou de destino não existe mais.')
  const selected=new Set(ids)
  const moved=source.colunas.filter(c=>selected.has(c.uid))
  if(moved.length!==selected.size)throw new Error('Uma das colunas selecionadas não pertence mais à tabela de origem.')
  if(moved.some(c=>!normalizedName(c.nome)))throw new Error('Nomeie as colunas selecionadas antes de transferir.')
  const targetNames=new Set(target.colunas.map(c=>normalizedName(c.nome)))
  const collision=moved.find(c=>targetNames.has(normalizedName(c.nome)))
  if(collision)throw new Error('A tabela “'+target.nome+'” já possui a coluna “'+collision.nome+'”. Renomeie uma delas antes de transferir.')
  const movedKeys=moved.filter(c=>c.pk)
  const sourceKeys=source.colunas.filter(c=>c.pk)
  if(movedKeys.length&&target.colunas.some(c=>c.pk))throw new Error('A tabela de destino já possui chave primária. Desmarque a PK ou escolha outro destino.')
  if(movedKeys.length&&movedKeys.length!==sourceKeys.length)throw new Error('Selecione todas as colunas da chave primária composta para transferi-la.')

  // Um UNIQUE composto só pode acompanhar a transferência se todas as colunas
  // participantes forem transferidas. Nunca descartar restrições silenciosamente.
  const movedGroups=[]
  for(const group of source.uniqueCompostos||[]){
    const count=group.colunas.filter(id=>selected.has(id)).length
    if(count&&count!==group.colunas.length){
      const names=group.colunas.map(id=>columnLabel(source.colunas.find(c=>c.uid===id)||{})).join(', ')
      throw new Error('UNIQUE composto depende das colunas '+names+'. Selecione o grupo inteiro ou desmarque essas colunas.')
    }
    if(count)movedGroups.push(group)
  }

  // FKs de outras tabelas (inclusive autorreferências) não podem ficar apontando
  // para uma coluna removida da tabela de origem.
  const movedNames=new Set(moved.map(c=>normalizedName(c.nome)))
  for(const table of doc.tabelas)for(const column of table.colunas){
    if(!column.fk)continue
    const referenced=normalizedName(String(column.fkTabela||'').split('.').at(-1).replace(/^"|"$/g,''))
    if(referenced===normalizedName(source.nome)&&movedNames.has(normalizedName(column.fkColuna))){
      throw new Error('A coluna “'+column.nome+'” da tabela “'+table.nome+'” possui FK para '+source.nome+'.'+column.fkColuna+'. Ajuste essa referência antes de transferir.')
    }
  }

  // CHECKs do construtor e SQL livre devem continuar íntegros nos dois lados.
  const retained=source.colunas.filter(c=>!selected.has(c.uid))
  for(const column of moved){
    for(const check of column.checks||[])for(const other of retained){
      if(checkMentions(check,other.nome))throw new Error('O CHECK da coluna “'+column.nome+'” depende de “'+other.nome+'”, que permanecerá na origem. Transfira ambas.')
    }
  }
  for(const column of retained)for(const check of column.checks||[])for(const other of moved){
    if(checkMentions(check,other.nome))throw new Error('O CHECK da coluna “'+column.nome+'” depende de “'+other.nome+'”. Transfira ambas ou revise o CHECK antes.')
  }

  // Verifica e prepara CHECKs SQL e triggers com as funções que usam NEW/OLD.
  // Políticas e índices só impedem a transferência quando referenciam a seleção.
  const sqlPlan=planTransferSql(doc,source,target,moved,retained)

  source.colunas=retained
  target.colunas=[...target.colunas,...moved]
  const movedGroupIds=new Set(movedGroups.map(group=>group.uid))
  source.uniqueCompostos=(source.uniqueCompostos||[]).filter(group=>!movedGroupIds.has(group.uid))
  target.uniqueCompostos=[...(target.uniqueCompostos||[]),...movedGroups]
  sqlPlan.apply()
  return {moved:moved.length,sourceId,targetId,columns:moved.map(c=>c.nome),triggers:sqlPlan.triggers,checksSql:sqlPlan.checks}
}
