// Diagramas Mermaid derivados do modelo local. Nenhum dado é enviado a serviços externos.
const text=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim()
const normalized=value=>text(value).replace(/^["']|["']$/g,'').toLocaleLowerCase('pt-BR')
const leaf=value=>text(value).split('.').at(-1).replace(/^["']|["']$/g,'')
const label=value=>text(value).replace(/[\\\[\]"]/g,"'").replace(/[%<>]/g,char=>'#'+char.charCodeAt(0)+';')
const erLabel=value=>text(value).replace(/["\\\[\]]/g,"'").replace(/[%<>]/g,'')
const attribute=value=>{
  const cleaned=text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_-]/g,'_')
  return /^[A-Za-z_]/.test(cleaned)?cleaned:'c_'+(cleaned||'sem_nome')
}
const sqlType=column=>{
  const raw=text(column.tipo||'TEXT').replace(/[^A-Za-z0-9_\[\]()-]/g,'_')
  return /^[A-Za-z]/.test(raw)?raw:'TEXT'
}
const description=column=>{
  const type=text(column.tipo||'TEXT')
  const precision=column.tamanho?type==='NUMERIC'?` (${column.tamanho}${column.escala?','+column.escala:''})`:` (${column.tamanho})`:''
  return [column.nullable?'NULL':'NOT NULL',precision.trim()].filter(Boolean).join(' · ')
}
const validDoc=doc=>{
  if(!doc||!Array.isArray(doc.tabelas))throw new Error('Modelo inválido para gerar diagramas.')
  return doc.tabelas
}
function allRelations(tables){
  const byName=new Map(tables.filter(t=>text(t.nome)).map(t=>[normalized(t.nome),t]))
  const edges=[]
  for(const from of tables)for(const column of from.colunas||[]){
    if(!column.fk||!text(column.fkTabela))continue
    const to=byName.get(normalized(leaf(column.fkTabela)))||null
    edges.push({from,to,targetName:text(column.fkTabela),column,reference:text(column.fkColuna||'id')})
  }
  return edges
}
export function diagramModel(doc,{scope='all',selectedId=null}={}){
  const tables=validDoc(doc)
  if(scope!=='all'&&scope!=='selected')throw new Error('Escopo de diagrama inválido.')
  const relations=allRelations(tables)
  const selected=tables.find(t=>t.uid===selectedId)
  const visible=scope==='all'?tables:selected?tables.filter(t=>t===selected||relations.some(r=>(r.from===selected&&r.to===t)||(r.to===selected&&r.from===t))):[]
  const visibleSet=new Set(visible)
  const edges=relations.filter(r=>visibleSet.has(r.from)&&(!r.to||visibleSet.has(r.to)))
  const unresolved=[...new Set(edges.filter(r=>!r.to).map(r=>normalized(r.targetName)))].map(key=>edges.find(r=>!r.to&&normalized(r.targetName)===key).targetName)
  return {tables:visible,edges,unresolved}
}
function ids(model){
  const names=new Map(model.tables.map((table,index)=>[table,`t${index}`]))
  model.unresolved.forEach((name,index)=>names.set(normalized(name),`externa${index}`))
  return names
}
export function mermaidConnections(doc,options={}){
  const model=diagramModel(doc,options),names=ids(model)
  const direction=options.direction==='TB'?'TB':'LR'
  const lines=[`flowchart ${direction}`]
  if(!model.tables.length)return lines.concat('  vazio["Nenhuma tabela no escopo selecionado"]').join('\n')
  for(const table of model.tables){
    const title=label(table.nome||'(sem nome)')
    const count=(table.colunas||[]).length
    lines.push(`  ${names.get(table)}["${title} · ${count} coluna${count===1?'':'s'}"]`)
  }
  for(const name of model.unresolved)lines.push(`  ${names.get(normalized(name))}["${label(name)} (não encontrada)"]`)
  for(const edge of model.edges){
    const from=names.get(edge.from),to=edge.to?names.get(edge.to):names.get(normalized(edge.targetName))
    const description=label(`${edge.column.nome||'(sem nome)'} → ${edge.reference}`)
    lines.push(`  ${from} ${edge.to?'-->|':'-.->|'}"${description}"| ${to}`)
  }
  return lines.join('\n')
}
export function mermaidDatabase(doc,options={}){
  const model=diagramModel(doc,options),names=ids(model)
  const direction=options.direction==='TB'?'TB':'LR'
  const lines=['erDiagram',`  direction ${direction}`]
  if(!model.tables.length)return lines.concat('  SEM_TABELAS["Nenhuma tabela no escopo selecionado"]').join('\n')
  for(const table of model.tables){
    const id=names.get(table),name=erLabel(table.nome||'(sem nome)')
    const columns=table.colunas||[]
    if(!columns.length){lines.push(`  ${id}["${name}"]`);continue}
    lines.push(`  ${id}["${name}"] {`)
    const used=new Set()
    for(let i=0;i<columns.length;i++){
      const column=columns[i]
      let key=attribute(column.nome||`campo_${i+1}`)
      const base=key
      let suffix=2
      while(used.has(key.toLowerCase()))key=`${base}_${suffix++}`
      used.add(key.toLowerCase())
      const flags=[column.pk?'PK':'',column.fk?'FK':'',column.unique?'UK':''].filter(Boolean).join(', ')
      const original=key!==column.nome?`Nome: ${text(column.nome||'(sem nome)')}. `:''
      const comment=erLabel(original+description(column))
      lines.push(`    ${sqlType(column)} ${key}${flags?' '+flags:''}${comment?' "'+comment+'"':''}`)
    }
    lines.push('  }')
  }
  for(const name of model.unresolved)lines.push(`  ${names.get(normalized(name))}["${erLabel(name)} (não encontrada)"]`)
  for(const edge of model.edges){
    const parent=edge.to?names.get(edge.to):names.get(normalized(edge.targetName))
    const child=names.get(edge.from)
    const parentCardinality=edge.column.nullable?'o|':'||'
    const childCardinality=edge.column.unique?'o|':'o{'
    lines.push(`  ${parent} ${parentCardinality}--${childCardinality} ${child} : "${erLabel(edge.column.nome||'FK')}"`)
  }
  return lines.join('\n')
}
