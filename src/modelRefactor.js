// Operações atômicas de renomeação e refatoração do modelo PostgreSQL.
import { duplicateNameError, nameConflict, normalizedName } from './modelNames.js'

// Substitui identificadores SQL sem alterar strings, comentários ou palavras internas.
export function rewriteSqlIdentifiers(source, pairs) {
  if(!source || !pairs?.length)return source
  const mappings=new Map(pairs.filter(p=>p.old!==p.name).map(p=>[normalizedName(p.old),p.name]))
  if(!mappings.size)return source
  const sql=String(source)
  let out='',i=0
  while(i<sql.length){
    const ch=sql[i]
    if(sql.startsWith('--',i)){
      const end=sql.indexOf('\n',i);const stop=end<0?sql.length:end
      out+=sql.slice(i,stop);i=stop;continue
    }
    if(sql.startsWith('/*',i)){
      let j=i+2,depth=1
      while(j<sql.length&&depth){if(sql.startsWith('/*',j)){depth++;j+=2}else if(sql.startsWith('*/',j)){depth--;j+=2}else j++}
      out+=sql.slice(i,j);i=j;continue
    }
    if(ch==="'"){
      let j=i+1
      while(j<sql.length){if(sql[j]==="'"&&sql[j+1]==="'"){j+=2;continue}if(sql[j]==="'"){j++;break}j++}
      out+=sql.slice(i,j);i=j;continue
    }
    if(ch==='$'){
      const tag=/^\$[a-zA-Z_0-9]*\$/.exec(sql.slice(i))?.[0]
      if(tag){
        const end=sql.indexOf(tag,i+tag.length),stop=end<0?sql.length:end+tag.length
        out+=sql.slice(i,stop);i=stop;continue
      }
    }
    if(ch==='"'){
      let j=i+1,value=''
      while(j<sql.length){
        if(sql[j]==='"'&&sql[j+1]==='"'){value+='"';j+=2;continue}
        if(sql[j]==='"'){j++;break}
        value+=sql[j++]
      }
      const renamed=mappings.get(normalizedName(value))
      out+=renamed===undefined?sql.slice(i,j):'"'+renamed.replaceAll('"','""')+'"'
      i=j;continue
    }
    if(/[A-Za-z_]/.test(ch)){
      const m=/^[A-Za-z_][A-Za-z_0-9$]*/.exec(sql.slice(i))
      const renamed=mappings.get(normalizedName(m[0]))
      out+=renamed===undefined?m[0]:renamed
      i+=m[0].length;continue
    }
    out+=ch;i++
  }
  return out
}

const sqlFields=['sqlRestricoes','sqlTriggers','sqlIndices','sqlPoliticas']
function rewriteTableSql(table,pairs){
  for(const field of sqlFields)if(Array.isArray(table[field]))table[field]=table[field].map(sql=>rewriteSqlIdentifiers(sql,pairs))
}
function rewriteColumnChecks(table,pairs,compileCheckBuilder,visitCheckConditions){
  const mapping=new Map(pairs.map(p=>[normalizedName(p.old),p.name]))
  for(const column of table.colunas){
    for(const check of column.checks||[]){
      if(check.construtor&&visitCheckConditions&&compileCheckBuilder){
        visitCheckConditions(check.construtor,condition=>{
          const col=mapping.get(normalizedName(condition.coluna))
          if(col)condition.coluna=col
          if(condition.origem==='coluna'){
            const val=mapping.get(normalizedName(condition.valor))
            if(val)condition.valor=val
          }
        })
        check.expressao=compileCheckBuilder(check.construtor,table.colunas)
      }else check.expressao=rewriteSqlIdentifiers(check.expressao,pairs)
      if(check.origemRestricao)check.origemRestricao=rewriteSqlIdentifiers(check.origemRestricao,pairs)
    }
  }
}

export function renameColumnsInDocument(doc,edits,helpers={}){
  const changesByTable=new Map()
  for(const edit of edits){
    const table=doc.tabelas.find(t=>t.uid===edit.tableId)
    const column=table?.colunas.find(c=>c.uid===edit.columnId)
    if(!column)throw new Error('Coluna selecionada não existe mais.')
    const name=String(edit.name??'').trim()
    if(!name)throw new Error('Nomes de colunas não podem ficar vazios.')
    if(!changesByTable.has(table.uid))changesByTable.set(table.uid,[])
    changesByTable.get(table.uid).push({table,column,old:column.nome,name})
  }
  for(const entries of changesByTable.values()){
    const table=entries[0].table
    if(new Set(entries.map(x=>x.column.uid)).size!==entries.length)throw new Error('Coluna selecionada mais de uma vez.')
    const names=new Map(entries.map(x=>[x.column.uid,x.name]))
    const all=table.colunas.map(c=>normalizedName(names.get(c.uid)??c.nome))
    if(all.some((n,i)=>n&&all.indexOf(n)!==i))throw new Error('Já existe uma coluna com esse nome na tabela '+table.nome+'. A alteração foi cancelada.')
  }
  let changed=0
  for(const entries of changesByTable.values()){
    const table=entries[0].table
    const pairs=entries.filter(x=>x.old!==x.name)
    if(!pairs.length)continue
    changed+=pairs.length
    for(const pair of pairs)pair.column.nome=pair.name
    rewriteColumnChecks(table,pairs,helpers.compileCheckBuilder,helpers.visitCheckConditions)
    rewriteTableSql(table,pairs)
    // Uma coluna referenciada também precisa atualizar as FKs nas outras tabelas.
    for(const refTable of doc.tabelas){
      for(const fk of refTable.colunas){
        if(!fk.fk||normalizedName(fk.fkTabela.split('.').at(-1))!==normalizedName(table.nome))continue
        const replacement=pairs.find(p=>normalizedName(p.old)===normalizedName(fk.fkColuna))
        if(replacement)fk.fkColuna=replacement.name
      }
      if(refTable!==table){
        // Reescreve apenas referências SQL identificadas com o nome exato da coluna.
        // SQL de outras tabelas pode ter colunas homônimas; preservar seu texto.
      }
    }
  }
  // Duplicidades pré-existentes em outras tabelas não bloqueiam sua correção.
  // Cada tabela afetada já foi validada antes da aplicação.
  return changed
}

export function singularTableName(name){
  return name.split('_').map(piece=>{
    if(piece.endsWith('coes'))return piece.slice(0,-4)+'cao'
    if(piece.endsWith('oes'))return piece.slice(0,-3)+'ao'
    if(piece.endsWith('s')&&piece.length>2)return piece.slice(0,-1)
    return piece
  }).join('_')
}

export function renameTableInDocument(doc,tableId,newName,helpers={}){
  const table=doc.tabelas.find(t=>t.uid===tableId)
  if(!table)throw new Error('Tabela inexistente.')
  const next=String(newName??'').trim(),old=table.nome
  if(!next)throw new Error('Informe o novo nome da tabela.')
  if(nameConflict(doc.tabelas,next,table))throw new Error('Já existe uma tabela com o nome “'+next+'”.')
  if(next===old)return {columns:0,foreignKeys:0}
  const pairs=[{old,name:next}]
  const renames=[],beforeSingular=singularTableName(old),afterSingular=singularTableName(next)
  let foreignKeys=0
  for(const origin of doc.tabelas){
    for(const col of origin.colunas){
      if(!col.fk||normalizedName(col.fkTabela.split('.').at(-1))!==normalizedName(old))continue
      col.fkTabela=col.fkTabela.includes('.')?col.fkTabela.replace(/[^.]+$/,next):next
      foreignKeys++
      const prefix=col.nome.replace(/_id$/,'')
      const to=normalizedName(prefix)===normalizedName(old)?next:
        normalizedName(prefix)===normalizedName(beforeSingular)?afterSingular:null
      if(to && col.nome!==to+'_id')renames.push({tableId:origin.uid,columnId:col.uid,name:to+'_id'})
    }
    rewriteTableSql(origin,pairs)
  }
  table.nome=next
  const columns=renameColumnsInDocument(doc,renames,helpers)
  return {columns,foreignKeys}
}
export function bulkReplaceName(name,find,replacement,matchCase=false){
  if(!find)throw new Error('Informe o trecho que será substituído.')
  const escaped=find.replace(/[|\\{}()[\]^$+*?.]/g,'\\$&')
  return name.replace(new RegExp(escaped,matchCase?'g':'gi'),replacement)
}


export function updateImportedCheck(table,check,newExpression=null){
  const origin=check.origemRestricao
  if(!origin)return
  const index=table.sqlRestricoes?.indexOf(origin)??-1
  if(index<0)throw new Error('Não foi encontrada a definição SQL original deste CHECK.')
  if(newExpression===null){
    table.sqlRestricoes.splice(index,1)
    return
  }
  const match=/\bCHECK\s*\(/i.exec(origin)
  if(!match)throw new Error('Não foi possível localizar a expressão do CHECK importado.')
  const start=match.index+match[0].length,oldExpression=check.expressao
  if(origin.slice(start,start+oldExpression.length)!==oldExpression){
    throw new Error('A restrição original divergiu do CHECK editável.')
  }
  const updated=origin.slice(0,start)+newExpression+origin.slice(start+oldExpression.length)
  table.sqlRestricoes[index]=updated
  check.origemRestricao=updated
}
