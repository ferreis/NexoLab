import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareExport } from '../src/exportModes.js'
import { formatText, formatTablePreviewText } from '../src/textExport.js'
import { tablePreview } from '../src/tablePreview.js'

const functionSql='CREATE FUNCTION rpg.validar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.forca < 0 THEN RAISE EXCEPTION \'invalido\'; END IF; RETURN NEW; END $$;'
const triggerSql='CREATE TRIGGER validar_forca BEFORE UPDATE ON rpg.fichas FOR EACH ROW EXECUTE FUNCTION rpg.validar();'
const checkSql='CONSTRAINT limite CHECK (forca >= 0)'
const source={
  projeto:'RPG',schema_alvo:'rpg',regrasSchema:'Modelo descritivo',funcoesSql:[functionSql],
  enums:[{nome:'estado',sql:"CREATE TYPE rpg.estado AS ENUM ('ativo');"}],
  comentariosSql:["COMMENT ON TYPE rpg.estado IS 'A';","COMMENT ON FUNCTION rpg.validar() IS 'gatilho';"],
  tabelas:[{nome:'fichas',colunas:[
    {nome:'forca',tipo:'SMALLINT',pk:false,nullable:false,descricao:'Característica física',checks:[{expressao:'forca >= 0',origemRestricao:checkSql}]},
    {nome:'nome',tipo:'TEXT',unique:true,nullable:true,checks:[]}
  ],uniqueCompostos:[],sqlTriggers:[triggerSql],sqlRestricoes:[checkSql,'CONSTRAINT unica UNIQUE (nome)'],sqlIndices:['CREATE INDEX fichas_nome ON rpg.fichas (nome)'],sqlPoliticas:['CREATE POLICY leitura ON rpg.fichas USING (true);']},
  {nome:'outras',colunas:[{nome:'codigo',tipo:'INTEGER',checks:[]}],uniqueCompostos:[]}]
}

test('modo completo mantém JSON e TXT originais sem cópia nem mutação',()=>{
  const before=JSON.stringify(source)
  const all=prepareExport(source,'complete')
  assert.equal(all,source)
  assert.match(formatText(all),/Funções SQL:/)
  assert.match(formatText(all),/Triggers SQL:/)
  assert.match(formatText(all),/CHECK \(forca >= 0\)/)
  assert.equal(JSON.stringify(source),before)
})
test('modo sem regras omite CHECKs, triggers e funções do JSON e TXT, conserva dados estruturais',()=>{
  const before=JSON.stringify(source)
  const trimmed=prepareExport(source,'structure')
  const json=JSON.stringify(trimmed)
  const txt=formatText(trimmed)
  for(const output of [json,txt]){
    assert.doesNotMatch(output,/CREATE FUNCTION|CREATE TRIGGER|CONSTRAINT limite CHECK|CHECK \(forca >= 0\)/)
    assert.match(output,/forca/)
  }
  assert.ok(!('funcoesSql' in trimmed))
  assert.ok(!('sqlTriggers' in trimmed.tabelas[0]))
  assert.deepEqual(trimmed.tabelas[0].colunas[0].checks,[])
  assert.equal(trimmed.tabelas[0].colunas[1].unique,true)
  assert.match(txt,/UNIQUE/)
  assert.match(txt,/CREATE INDEX fichas_nome/)
  assert.match(txt,/CREATE POLICY leitura/)
  assert.equal(trimmed.tabelas[0].sqlRestricoes[0],'CONSTRAINT unica UNIQUE (nome)')
  assert.equal(trimmed.enums[0].nome,'estado')
  assert.equal(trimmed.comentariosSql.length,1)
  assert.equal(JSON.stringify(source),before,'A filtragem não remove regras armazenadas no projeto.')
})
test('prévia da tabela inclui função relacionada e trigger no completo e omite ambas no reduzido',()=>{
  const all=tablePreview(source,0,{includeSql:true})
  assert.equal(all.tabelas[0].sqlTriggers[0],triggerSql)
  assert.deepEqual(all.funcoesSql,[functionSql])
  const fullTxt=formatTablePreviewText(all)
  assert.match(fullTxt,/Triggers SQL:/)
  assert.match(fullTxt,/Funções SQL associadas:/)
  assert.match(fullTxt,/CHECK \(forca >= 0\)/)
  const compact=tablePreview(prepareExport(source,'structure'),0,{includeSql:false})
  const compactTxt=formatTablePreviewText(compact)
  assert.doesNotMatch(JSON.stringify(compact),/CREATE TRIGGER|CREATE FUNCTION|CHECK \(|sqlTriggers|funcoesSql/)
  assert.doesNotMatch(compactTxt,/Triggers SQL:|Funções SQL:|CHECK \(/)
  assert.match(compactTxt,/TABELA: rpg.fichas/)
})
test('configuração inválida é rejeitada, sem tocar no projeto',()=>{
  const before=JSON.stringify(source)
  assert.throws(()=>prepareExport(source,'none'),/Modo/)
  assert.throws(()=>prepareExport({tabelas:null},'structure'),/Modelo/)
  assert.equal(JSON.stringify(source),before)
})
test('modo sem regras funciona também com listas opcionais ausentes',()=>{
  const doc={schema_alvo:'public',projeto:'Vazio',tabelas:[{nome:'tabela',colunas:[{nome:'id',tipo:'INTEGER',pk:true}],uniqueCompostos:[]}]}
  const filtered=prepareExport(doc,'structure')
  assert.deepEqual(filtered.tabelas[0].colunas[0].checks,[])
  assert.equal(filtered.tabelas[0].colunas[0].pk,true)
  assert.doesNotMatch(formatText(filtered),/Triggers SQL:/)
})
