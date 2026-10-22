import test from 'node:test'
import assert from 'node:assert/strict'
import {transferColumnsInDocument} from '../src/columnTransfer.js'

const col=(uid,nome,extras={})=>({uid,nome,tipo:'TEXT',checks:[],...extras})
const fn=(field='forca')=>[
  'CREATE OR REPLACE FUNCTION rpg.validar_atributo() RETURNS trigger',
  'LANGUAGE plpgsql AS $func$',
  'BEGIN',
  '  IF NEW.'+field+' < 0 THEN RAISE EXCEPTION \'negativo\'; END IF;',
  '  RETURN NEW;',
  'END;',
  '$func$;'
].join('\n')
const trigger=name=>'CREATE TRIGGER '+name+' BEFORE UPDATE ON rpg.fichas FOR EACH ROW EXECUTE FUNCTION rpg.validar_atributo();'
function project(){
  return {schema:'rpg',funcoesSql:[fn()],tabelas:[
    {uid:'src',nome:'fichas',colunas:[col('a','forca',{checks:[{uid:'check1',expressao:'"forca" >= 0'}]}),col('b','destreza'),col('c','nome')],uniqueCompostos:[],sqlRestricoes:[],sqlTriggers:[],sqlIndices:[],sqlPoliticas:[]},
    {uid:'dst',nome:'atributos',colunas:[col('d','id',{pk:true})],uniqueCompostos:[],sqlRestricoes:[],sqlTriggers:[],sqlIndices:[],sqlPoliticas:[]}
  ]}
}
function transfer(doc,columns=['a']){return transferColumnsInDocument(doc,'src','dst',columns)}
function denied(doc,columns,pattern){
  const before=JSON.stringify(doc)
  assert.throws(()=>transfer(doc,columns),pattern)
  assert.equal(JSON.stringify(doc),before,'Falhas não devem alterar o documento')
}
test('move CHECK editável e conserva outras colunas na origem',()=>{
  const doc=project()
  const result=transfer(doc)
  assert.equal(result.moved,1)
  assert.equal(result.triggers,0)
  assert.deepEqual(doc.tabelas[0].colunas.map(c=>c.nome),['destreza','nome'])
  assert.equal(doc.tabelas[1].colunas[1].checks[0].expressao,'"forca" >= 0')
})
test('move CHECK SQL importado e mantém origemRestricao ligada ao mesmo SQL',()=>{
  const doc=project()
  const constraint='CONSTRAINT fichas_forca_check CHECK (forca >= 0)'
  doc.tabelas[0].sqlRestricoes=[constraint,'CONSTRAINT fichas_nome_check CHECK (nome <> \'\')']
  doc.tabelas[0].colunas[0].checks=[{uid:'importado',expressao:'forca >= 0',origemRestricao:constraint}]
  const result=transfer(doc)
  assert.equal(result.checksSql,1)
  assert.deepEqual(doc.tabelas[0].sqlRestricoes,['CONSTRAINT fichas_nome_check CHECK (nome <> \'\')'])
  assert.deepEqual(doc.tabelas[1].sqlRestricoes,[constraint])
  assert.equal(doc.tabelas[1].colunas[1].checks[0].origemRestricao,constraint)
})
test('CHECK composto precisa de todas as colunas mencionadas e não move parcialmente',()=>{
  const doc=project()
  const constraint='CONSTRAINT fichas_forca_check CHECK (forca < destreza)'
  doc.tabelas[0].sqlRestricoes=[constraint]
  doc.tabelas[0].colunas[0].checks=[{uid:'check1',expressao:'forca < destreza',origemRestricao:constraint}]
  denied(doc,['a'],/CHECK SQL depende também/)
  transfer(doc,['a','b'])
  assert.deepEqual(doc.tabelas[1].sqlRestricoes,[constraint])
})
test('transfere a trigger e mantém função SQL no projeto quando NEW usa apenas coluna movida',()=>{
  const doc=project()
  doc.tabelas[0].sqlTriggers=[trigger('validar_forca')]
  const result=transfer(doc)
  assert.equal(result.triggers,1)
  assert.deepEqual(doc.tabelas[0].sqlTriggers,[])
  assert.match(doc.tabelas[1].sqlTriggers[0],/ON rpg\."atributos" FOR EACH ROW/)
  assert.deepEqual(doc.funcoesSql,[fn()])
})
test('mantém trigger da origem quando sua função usa somente coluna não transferida',()=>{
  const doc=project()
  doc.funcoesSql=[fn('destreza')]
  doc.tabelas[0].sqlTriggers=[trigger('validar_destreza')]
  const result=transfer(doc)
  assert.equal(result.triggers,0)
  assert.deepEqual(doc.tabelas[0].sqlTriggers,[trigger('validar_destreza')])
  assert.deepEqual(doc.tabelas[1].sqlTriggers,[])
})
test('trigger e função que dependem das duas tabelas não podem ser divididas',()=>{
  const doc=project()
  doc.funcoesSql=[fn().replace('RETURN NEW;','IF NEW.destreza < 0 THEN RAISE EXCEPTION \'erro\'; END IF;\n  RETURN NEW;')]
  doc.tabelas[0].sqlTriggers=[trigger('validar_forca')]
  denied(doc,['a'],/trigger depende também/)
  const result=transfer(doc,['a','b'])
  assert.equal(result.triggers,1)
})
test('permite transferência mesmo com políticas e triggers não relacionadas',()=>{
  const doc=project()
  doc.tabelas[0].sqlPoliticas=['CREATE POLICY leitura ON rpg.fichas USING (true);']
  doc.tabelas[0].sqlTriggers=[trigger('validar_nome')]
  doc.funcoesSql=[fn('nome')]
  transfer(doc)
  assert.equal(doc.tabelas[0].sqlPoliticas.length,1)
  assert.equal(doc.tabelas[0].sqlTriggers.length,1)
})
test('não move trigger sem função definida ou com função SQL ambígua',()=>{
  const doc=project()
  doc.tabelas[0].sqlTriggers=[trigger('validar_forca')]
  doc.funcoesSql=[]
  // Sem corpo verificável, a trigger não pode ser movida às cegas.
  denied(doc,['a'],/função.*definição única/)
})
test('não cria colisões de nomes em triggers e CHECKs no destino',()=>{
  const doc=project()
  doc.tabelas[0].sqlTriggers=[trigger('validar_forca')]
  doc.tabelas[1].sqlTriggers=['CREATE TRIGGER validar_forca BEFORE UPDATE ON rpg.atributos FOR EACH ROW EXECUTE FUNCTION rpg.validar_atributo();']
  denied(doc,['a'],/Já existe uma trigger/)
  doc.tabelas[1].sqlTriggers=[]
  doc.tabelas[0].sqlRestricoes=['CONSTRAINT limite CHECK (forca >= 0)']
  doc.tabelas[1].sqlRestricoes=['CONSTRAINT limite CHECK (id >= 0)']
  denied(doc,['a'],/Já existe uma restrição CHECK/)
})
test('não transfere SQL dinâmico na função e não perde políticas dependentes',()=>{
  const doc=project()
  doc.tabelas[0].sqlTriggers=[trigger('validar_forca')]
  doc.funcoesSql=[fn().replace('RETURN NEW;',"EXECUTE 'SELECT 1'; RETURN NEW;")]
  denied(doc,['a'],/SQL dinâmico/)
  doc.tabelas[0].sqlTriggers=[]
  doc.tabelas[0].sqlPoliticas=['CREATE POLICY permissao ON rpg.fichas USING (forca > 0);']
  denied(doc,['a'],/sqlPoliticas/)
})
test('não move índices ou restrições não-CHECK potencialmente quebrados',()=>{
  const doc=project()
  doc.tabelas[0].sqlIndices=['CREATE INDEX idx_fichas_forca ON rpg.fichas (forca);']
  denied(doc,['a'],/sqlIndices/)
  doc.tabelas[0].sqlIndices=[]
  doc.tabelas[0].sqlRestricoes=['CONSTRAINT uk_forca UNIQUE (forca)']
  denied(doc,['a'],/sqlRestricoes/)
})
test('mantém outras triggers na origem e preserva o nome original na função global',()=>{
  const doc=project()
  doc.tabelas[0].sqlTriggers=[trigger('validar_forca'), 'CREATE TRIGGER log_nome BEFORE UPDATE OF nome ON rpg.fichas FOR EACH ROW EXECUTE FUNCTION rpg.log_nome();']
  doc.funcoesSql.push(fn('nome').replaceAll('validar_atributo','log_nome'))
  const result=transfer(doc)
  assert.equal(result.triggers,1)
  assert.equal(doc.tabelas[0].sqlTriggers.length,1)
  assert.match(doc.tabelas[0].sqlTriggers[0],/log_nome/)
  assert.match(doc.funcoesSql[0],/validar_atributo/)
})
