import {test} from 'node:test'
import assert from 'node:assert/strict'
import {diagramModel,mermaidConnections,mermaidDatabase} from '../src/mermaidDiagrams.js'

const schema={
  tabelas:[
    {uid:'p',nome:'pessoas',colunas:[
      {nome:'id',tipo:'BIGINT',pk:true,nullable:false},
      {nome:'nome',tipo:'VARCHAR',tamanho:'120',nullable:false},
      {nome:'apelido',tipo:'TEXT',nullable:true,unique:true}
    ]},
    {uid:'o',nome:'ordens',colunas:[
      {nome:'id',tipo:'BIGINT',pk:true,nullable:false},
      {nome:'pessoa_id',tipo:'BIGINT',fk:true,fkTabela:'pessoas',fkColuna:'id',nullable:false},
      {nome:'responsavel_id',tipo:'BIGINT',fk:true,fkTabela:'public.pessoas',fkColuna:'id',nullable:true},
      {nome:'status',tipo:'ENUM',nullable:false}
    ]},
    {uid:'n',nome:'notas',colunas:[
      {nome:'ordem_id',tipo:'BIGINT',fk:true,fkTabela:'ordens',fkColuna:'id',nullable:false}
    ]},
    {uid:'i',nome:'isolada',colunas:[]}
  ]
}
test('mapa de ligações lista todas as tabelas e todas as FKs, incluindo isoladas',()=>{
  const code=mermaidConnections(schema)
  assert.match(code,/^flowchart LR\n/)
  assert.match(code,/t0\["pessoas · 3 colunas"\]/)
  assert.match(code,/t3\["isolada · 0 colunas"\]/)
  assert.match(code,/t1 -->\|"pessoa_id → id"\| t0/)
  assert.match(code,/t1 -->\|"responsavel_id → id"\| t0/)
  assert.match(code,/t2 -->\|"ordem_id → id"\| t1/)
  assert.equal(code.split('\n').filter(line=>line.includes('-->|')).length,3)
  assert.equal(diagramModel(schema).edges.length,3)
})
test('diagrama ER preserva colunas, tipos, PK, FK, UK, NULL e cardinalidade',()=>{
  const code=mermaidDatabase(schema)
  assert.match(code,/^erDiagram\n  direction LR/)
  assert.match(code,/t0\["pessoas"\] \{/)
  assert.match(code,/BIGINT id PK "NOT NULL"/)
  assert.match(code,/VARCHAR nome "NOT NULL · \(120\)"/)
  assert.match(code,/TEXT apelido UK "NULL"/)
  assert.match(code,/BIGINT pessoa_id FK "NOT NULL"/)
  assert.match(code,/t0 \|\|--o\{ t1 : "pessoa_id"/)
  assert.match(code,/t0 o\|--o\{ t1 : "responsavel_id"/)
  assert.match(code,/t3\["isolada"\]/)
})
test('escopo de uma tabela inclui vizinhas de entrada e saída e exclui isoladas',()=>{
  const model=diagramModel(schema,{scope:'selected',selectedId:'o'})
  assert.deepEqual(model.tables.map(t=>t.nome),['pessoas','ordens','notas'])
  assert.equal(model.edges.length,3)
  assert.doesNotMatch(mermaidConnections(schema,{scope:'selected',selectedId:'o'}),/isolada/)
  assert.deepEqual(diagramModel(schema,{scope:'selected',selectedId:'i'}).tables.map(t=>t.nome),['isolada'])
  assert.equal(diagramModel(schema,{scope:'selected',selectedId:'inexistente'}).tables.length,0)
})
test('FK para tabela externa é sinalizada e desenhada sem inventar tabela existente',()=>{
  const doc={tabelas:[{uid:'1',nome:'itens',colunas:[
    {nome:'catalogo_id',fk:true,fkTabela:'outro.catalogo',fkColuna:'id',nullable:true}
  ]}]}
  assert.deepEqual(diagramModel(doc).unresolved,['outro.catalogo'])
  assert.match(mermaidConnections(doc),/externa0\["outro.catalogo \(não encontrada\)"\]/)
  assert.match(mermaidConnections(doc),/t0 -.->\|"catalogo_id → id"\| externa0/)
  assert.match(mermaidDatabase(doc),/externa0 o\|--o\{ t0 : "catalogo_id"/)
})
test('gerador escapa conteúdo não confiável sem criar instruções Mermaid extras',()=>{
  const doc={tabelas:[{uid:'1',nome:'X"]\n  click t0 "javascript:alert(1)"\n%%',colunas:[
    {nome:'x\"\n  click t0',tipo:'CUSTOM',nullable:true}
  ]}]}
  for(const code of [mermaidConnections(doc),mermaidDatabase(doc)]){
    assert.doesNotMatch(code,/\n\s*click\b/)
    assert.doesNotMatch(code,/\n%%/)
    assert.ok((code.match(/\bclick\b/g)?.length||0)>=1)
  }
  assert.match(mermaidDatabase(doc),/CUSTOM x_/)
})
test('identificadores problemáticos e vazios produzem sintaxe estável, sem mutar o modelo',()=>{
  const doc={tabelas:[{uid:'a',nome:'',colunas:[
    {nome:'',tipo:'NUMERIC',pk:true},
    {nome:'1-campo',tipo:'TEXT',unique:true},
    {nome:'1 campo',tipo:'TEXT',fk:true,fkTabela:'faltando'},
    {nome:'café',tipo:'TEXT'},
    {nome:'cafe',tipo:'TEXT'}
  ]}]}
  const original=JSON.stringify(doc)
  const code=mermaidDatabase(doc,{direction:'TB'})
  assert.match(code,/direction TB/)
  assert.match(code,/NUMERIC campo_1 PK/)
  assert.match(code,/TEXT c_1-campo UK/)
  assert.match(code,/TEXT c_1_campo FK/)
  assert.match(code,/TEXT cafe_2/)
  assert.equal(JSON.stringify(doc),original)
  assert.match(mermaidConnections(doc,{direction:'TB'}),/^flowchart TB/)
})
test('modelo vazio, erro de escopo e ausência de documento são tratados explicitamente',()=>{
  assert.match(mermaidConnections({tabelas:[]}),/Nenhuma tabela/)
  assert.equal(mermaidDatabase({tabelas:[]}), 'erDiagram\n  direction LR')
  assert.throws(()=>diagramModel({tabelas:[]},{scope:'none'}),/Escopo/)
  assert.throws(()=>mermaidConnections({}),/Modelo inválido/)
})

test('FK de outro schema não aponta para tabela homônima local',()=>{
  const doc={schema:'rpg',tabelas:[
    {uid:'local',nome:'users',colunas:[{nome:'id',tipo:'UUID',pk:true}]},
    {uid:'origem',nome:'logins',colunas:[
      {nome:'user_id',tipo:'UUID',fk:true,fkTabela:'auth.users',fkColuna:'id'},
      {nome:'local_id',tipo:'UUID',fk:true,fkTabela:'rpg.users',fkColuna:'id'}
    ]}
  ]}
  const model=diagramModel(doc)
  assert.deepEqual(model.unresolved,['auth.users'])
  assert.equal(model.edges.filter(e=>e.to===doc.tabelas[0]).length,1)
  assert.match(mermaidDatabase(doc),/externa0/)
  assert.match(mermaidDatabase(doc),/t0 \|\|--o\{ t1 : "local_id"/)
  assert.match(mermaidConnections(doc),/auth.users \(não encontrada\)/)
  assert.match(mermaidConnections(doc),/t1 -->\|"local_id → id"\| t0/)
})
