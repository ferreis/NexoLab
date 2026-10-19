// Exibição individual compacta: somente definição da tabela, chaves, FKs e CHECKs.
// A prévia completa do schema continua disponível sem perda dos objetos SQL importados.
const isRelevantConstraint=sql=>/\b(?:CHECK\s*\(|FOREIGN\s+KEY)\b/i.test(String(sql||''))||/\bCHECK\s*\(/i.test(String(sql||''))
export function tablePreview(project,tableIndex){
  if(!project||!Array.isArray(project.tabelas))throw new Error('Modelo de projeto inválido.')
  const source=project.tabelas[tableIndex]
  const table=source&&{
    nome:source.nome,
    ...(source.comentario?{comentario:source.comentario}:{}),
    ...(source.regras?{regras:source.regras}:{}),
    ...(source.finalidade?{finalidade:source.finalidade}:{}),
    uniqueCompostos:source.uniqueCompostos||[],
    colunas:(source.colunas||[]).map(c=>({
      nome:c.nome,tipo:c.tipo,...(c.tamanho?{tamanho:c.tamanho}:{}),...(c.escala?{escala:c.escala}:{}),
      pk:!!c.pk,nullable:!!c.nullable,unique:!!c.unique,
      ...(c.fk?{fk:true,fkTabela:c.fkTabela,fkColuna:c.fkColuna}:{}),
      ...(c.padrao?{padrao:c.padrao}:{}),...(c.imutavel?{imutavel:true}:{}),
      ...(c.tipo==='ENUM'?{enumValores:c.enumValores||[]}:{}),
      ...(c.descricao?{descricao:c.descricao}:{}),
      ...(c.comentario?{comentario:c.comentario}:{}),
      checks:c.checks||[]
    })),
    ...(source.sqlRestricoes?.some(isRelevantConstraint)?{sqlRestricoes:source.sqlRestricoes.filter(isRelevantConstraint).filter(sql=>!(source.colunas||[]).some(c=>(c.checks||[]).some(check=>check.origemRestricao===sql)))}:{})
  }
  return {schema_alvo:project.schema_alvo,tabelas:table?[table]:[]}
}
