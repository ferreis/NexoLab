import { isCompositeOwner } from './compositeUnique.js'
import { formatCheckText } from './checkConstraints.js'
import { formatTableComment, formatColumnComment } from './tableComments.js'

const showSize=type=>['VARCHAR','CHAR','NUMERIC'].includes(type)

export function formatText(d){
  return [`Projeto: ${d.projeto}\nSchema: ${d.schema_alvo}\n`,...d.tabelas.map(t=>[
    `\nTABELA: ${t.nome}`,
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
    ].filter(Boolean).join(' | '),formatColumnComment(d.schema_alvo,t,c)])
  ].filter(Boolean).join('\n'))].join('\n')
}
