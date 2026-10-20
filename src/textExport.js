import { isCompositeOwner } from './compositeUnique.js'
import { formatCheckText } from './checkConstraints.js'
import { formatTableComment, formatColumnComment } from './tableComments.js'

const showSize=type=>['VARCHAR','CHAR','NUMERIC'].includes(type)

export function formatText(d){
  return [`Projeto: ${d.projeto}\nSchema: ${d.schema_alvo}\n`,...(d.regrasSchema?['Regras do schema:',d.regrasSchema]:[]),...d.tabelas.map(t=>[
    `\nTABELA: ${t.nome}`,
    t.finalidade?`Finalidade: ${t.finalidade}`:'',
    t.regras?`Regras da tabela: ${t.regras}`:'',
    formatTableComment(d.schema_alvo,t),
    t.colunas.filter(c=>c.pk).length>1?`Chave primária composta (combinação única): ${t.colunas.filter(c=>c.pk).map(c=>c.nome||'sem_nome').join(', ')}`:'',
    ...t.colunas.flatMap(c=>[[
      `- ${c.nome||'sem_nome'}: ${c.tipo}${showSize(c.tipo)&&c.tamanho?'('+c.tamanho+(c.tipo==='NUMERIC'&&c.escala?','+c.escala:'')+')':''}`,
      c.pk?'PK':'',c.fk?`FK -> ${c.fkTabela}.${c.fkColuna||'id'}`:'',c.nullable?'NULL':'NOT NULL',
      c.unique?'UNIQUE':'',
      ...t.uniqueCompostos.filter(group=>isCompositeOwner(group,c.nome)).map(group=>`UNIQUE Compose (${group.colunas.join(', ')})`),
      c.padrao?`DEFAULT ${c.padrao} (na criação)`:'',
      c.imutavel?'IMUTÁVEL após o primeiro preenchimento':'',
      c.tipo==='ENUM'?`ENUM [${c.enumValores.join(', ')}]`:'',
      c.descricao?`Regra: ${c.descricao}`:'',
      ...c.checks.map(check=>formatCheckText(check.expressao))
    ].filter(Boolean).join(' | '),formatColumnComment(d.schema_alvo,t,c)]),
  ...(t.sqlRestricoes?.length?['Restrições SQL:',...t.sqlRestricoes]:[]),
    ...(t.sqlTriggers?.length?['Triggers SQL:',...t.sqlTriggers]:[]),
    ...(t.sqlIndices?.length?['Índices SQL:',...t.sqlIndices]:[]),
    ...(t.sqlPoliticas?.length?['Políticas/RLS:',...t.sqlPoliticas]:[])
  ].filter(Boolean).join('\n')),
    ...(d.enums?.length?['\nENUMs do schema:',...d.enums.map(e=>e.sql+(e.comentario?'\nComentário: '+e.comentario:''))]:[]),
    ...(d.funcoesSql?.length?['\nFunções SQL:',...d.funcoesSql]:[]),
    ...(d.comentariosSql?.length?['\nComentários SQL globais:',...d.comentariosSql]:[])
  ].join('\n')
}

 
// Prévia de uma tabela é documentação legível, não um dump SQL do projeto.
export function formatTablePreviewText(preview){
  const t=preview.tabelas?.[0]
  if(!t)return 'Selecione uma tabela para visualizar.'
  const lines=[`TABELA: ${preview.schema_alvo}.${t.nome}`]
  if(t.finalidade)lines.push(`Finalidade: ${t.finalidade}`)
  if(t.comentario)lines.push(`Descrição: ${t.comentario}`)
  if(t.regras)lines.push(`Regras da tabela: ${t.regras}`)
  lines.push('', 'Colunas:')
  for(const c of t.colunas||[]){
    const parts=[`- ${c.nome}: ${c.tipo}${showSize(c.tipo)&&c.tamanho?'('+c.tamanho+(c.escala?','+c.escala:'')+')':''}`,
      c.pk?'PK':'',c.nullable?'NULL':'NOT NULL',c.unique?'UNIQUE':'',
      c.fk?`FK -> ${c.fkTabela}.${c.fkColuna||'id'}`:'',
      c.padrao?`DEFAULT ${c.padrao}`:'',c.imutavel?'IMUTÁVEL':'',
      c.tipo==='ENUM'?`ENUM (${(c.enumValores||[]).join(', ')})`:''
    ].filter(Boolean)
    lines.push(parts.join(' | '))
    if(c.descricao)lines.push(`  Regra: ${c.descricao}`)
    if(c.comentario)lines.push(`  Comentário: ${c.comentario}`)
    for(const check of c.checks||[])lines.push(`  ${formatCheckText(check.expressao)}`)
  }
  if(t.uniqueCompostos?.length){
    lines.push('','UNIQUEs compostos:')
    for(const g of t.uniqueCompostos)lines.push(`- (${g.colunas.join(', ')})`)
  }
  if(t.sqlRestricoes?.length){
    lines.push('','Restrições relacionais e CHECKs adicionais:')
    for(const sql of t.sqlRestricoes)lines.push(`- ${sql}`)
  }
  return lines.join('\n')
}
