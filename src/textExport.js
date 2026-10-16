import { formatCheckSQL } from './checkConstraints.js'

const showSize=type=>['VARCHAR','CHAR','NUMERIC'].includes(type)

export function formatText(d){
  return [`Projeto: ${d.projeto}\nSchema: ${d.schema_alvo}\n`,...d.tabelas.map(t=>[
    `\nTABELA: ${t.nome}`,
    t.colunas.filter(c=>c.pk).length>1?`Chave primária composta (combinação única): ${t.colunas.filter(c=>c.pk).map(c=>c.nome||'sem_nome').join(', ')}`:'',
    ...t.colunas.map(c=>[
      `- ${c.nome||'sem_nome'}: ${c.tipo}${showSize(c.tipo)&&c.tamanho?'('+c.tamanho+(c.tipo==='NUMERIC'&&c.escala?','+c.escala:'')+')':''}`,
      c.pk?'PK':'',c.fk?`FK -> ${c.fkTabela}.${c.fkColuna||'id'}`:'',c.nullable?'NULL':'NOT NULL',
      c.unique?'UNIQUE':'',
      ...t.uniqueCompostos.filter(group=>group.colunas.includes(c.nome)).map(group=>`UNIQUE composto (${group.colunas.join(', ')})`),
      c.padrao?`DEFAULT ${c.padrao} (na criação)`:'',
      c.imutavel?'IMUTÁVEL após o primeiro preenchimento':'',
      c.tipo==='ENUM'?`ENUM [${c.enumValores.join(', ')}]`:'',
      c.descricao?`Regra: ${c.descricao}`:''
    ].filter(Boolean).join(' | ')+c.checks.map(check=>'\n'+formatCheckSQL(check.expressao).split('\n').map(line=>'  '+line).join('\n')).join(''))
  ].join('\n'))].join('\n')
}
