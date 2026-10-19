import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { availableName, duplicateNameError, nameConflict } from '../modelNames.js'
import { convertGroups, groupKey, validateGroup, isCompositeOwner } from '../compositeUnique.js'
import { checkExpression, convertChecks } from '../checkConstraints.js'
import { compileCheckBuilder, cloneBuilder, builderUsesColumn, visitCheckConditions } from '../checkBuilder.js'
import { formatTableComment, formatColumnComment } from '../tableComments.js'
import { parsePostgresDDL } from '../sqlImport.js'

export const TYPES = [
  ['BIGINT','Inteiro de 64 bits; ideal para IDs e FKs numéricas.'],
  ['INTEGER','Inteiro de 32 bits, para contagens comuns.'],
  ['SMALLINT','Inteiro de 16 bits, bom para níveis de habilidades.'],
  ['NUMERIC','Número exato com precisão e escala opcionais.'],
  ['BOOLEAN','Verdadeiro ou falso.'],
  ['VARCHAR','Texto limitado a um número máximo de caracteres.'],
  ['CHAR','Texto de tamanho fixo.'],
  ['TEXT','Texto sem limite de tamanho declarado.'],
  ['DATE','Data, sem horário.'],
  ['TIME','Hora, sem data.'],
  ['TIMESTAMP','Data e hora, sem fuso.'],
  ['TIMESTAMPTZ','Data e hora com referência de fuso.'],
  ['UUID','Identificador universal único; também pode ser PK ou FK.'],
  ['JSONB','Documento JSON estruturado e indexável.'],
  ['ENUM','Conjunto controlado de valores, definido no PostgreSQL.'],
  ['CUSTOM','Tipo PostgreSQL personalizado. Consulte o tipo SQL original.'],
  ['TEXT[]','Lista de textos.']
]
const makeId=()=>crypto.randomUUID()
export const makeColumn=(name='',type='VARCHAR')=>({uid:makeId(),nome:name,tipo:type,tamanho:'',escala:'',nullable:false,pk:false,unique:false,uniqueComposto:false,checkEnabled:false,checks:[],fk:false,fkTabela:'',fkColuna:'id',padrao:'',imutavel:false,enumValores:[],descricao:'',comentario:''})
export const makeTable=()=>({uid:makeId(),nome:'nova_tabela',comentario:'',finalidade:'',regras:'',colunas:[],uniqueCompostos:[]})
const base=()=>({version:2,projeto:'NexoDB Lab',schema:'rpg',tabelas:[],enums:[],funcoesSql:[]})
const columnName=c=>c.nome.trim().toLowerCase()
export const isDefaultColumn=c=>['id','criado_em','atualizado_em'].includes(columnName(c))
function orderColumns(columns){
  const rank=c=>({id:0,criado_em:2,atualizado_em:3}[columnName(c)]??1)
  return [...columns].sort((a,b)=>rank(a)-rank(b))
}
function convertColumn(c){
  const {atualizarAoAlterar,comentario_sql,default:legacyDefault,...fields}=c
  const fk=!!(c.fk||c.fkTabela)
  const description=String(c.descricao||'')
  const updateRule='Atualizar com a data e hora atuais a cada alteração do registro.'
  return {
    ...makeColumn(),...fields,...(c.pk?{imutavel:true,nullable:false}:{}),uid:c.uid||makeId(),padrao:fk?'':String(c.padrao??legacyDefault??''),fk,
    checks:convertChecks(c.checks),
    comentario:String(c.comentario??''),
    descricao:atualizarAoAlterar&&!/a cada alteração/i.test(description)?[description,updateRule].filter(Boolean).join('\n'):description,
    enumValores:Array.isArray(c.enumValores)?c.enumValores:c.enumValores?.split(/[,\n]/).map(v=>v.trim()).filter(Boolean)||[]
  }
}
function convert(input){
  if (!input || !Array.isArray(input.tabelas)) throw new Error('Arquivo sem a lista de tabelas')
  return {version:2,projeto:String(input.projeto||'NexoDB Lab'),schema:String(input.schema_alvo||input.schema||'rpg'),
    enums:Array.isArray(input.enums)?input.enums:[],funcoesSql:Array.isArray(input.funcoesSql)?input.funcoesSql:[],
    tabelas:input.tabelas.map(t=>{
    const colunas=orderColumns((t.colunas||[]).map(convertColumn))
    for(const column of colunas)for(const check of column.checks)if(check.construtor&&compileCheckBuilder(check.construtor,colunas)!==check.expressao)throw new Error('A expressão CHECK não corresponde às condições do construtor.')
    return {
    uid:t.uid||makeId(),nome:String(t.nome||''),comentario:String(t.comentario??''),finalidade:String(t.finalidade??t.descricao??''),
    regras:[String(t.regras??t.observacoes??''),t.automacoes?`Triggers e funções:\n${t.automacoes}`:''].filter(Boolean).join('\n\n'),
    colunas,uniqueCompostos:convertGroups(t.uniqueCompostos,colunas),
    sqlRestricoes:Array.isArray(t.sqlRestricoes)?t.sqlRestricoes:[],
    sqlTriggers:Array.isArray(t.sqlTriggers)?t.sqlTriggers:[],
    sqlIndices:Array.isArray(t.sqlIndices)?t.sqlIndices:[]
  }})}
}
export const useModelStore=defineStore('modelador',()=>{
  let saved
  try {saved=convert(JSON.parse(localStorage.getItem('modelador-rpg-vue-v2')))}catch{
    try {saved=convert(JSON.parse(localStorage.getItem('modelador-rpg-schema-v1')))}catch{saved=base()}
  }
  const doc=ref(saved)
  const selectedId=ref(doc.value.tabelas[0]?.uid||null)
  const selected=computed(()=>doc.value.tabelas.find(t=>t.uid===selectedId.value)||null)
  const sortedTables=computed(()=>[...doc.value.tabelas].sort((a,b)=>a.nome.trim().localeCompare(b.nome.trim(),'pt-BR',{sensitivity:'base'})))
  watch(doc,v=>{try{localStorage.setItem('modelador-rpg-vue-v2',JSON.stringify(v))}catch{}},{deep:true})
  const nameError=computed(()=>duplicateNameError(doc.value.tabelas))
  function addTable(){const t=makeTable();t.nome=availableName(doc.value.tabelas,t.nome);doc.value.tabelas.push(t);selectedId.value=t.uid}
  function renameTable(table,name){
    if(nameConflict(doc.value.tabelas,name,table))throw new Error(`Já existe uma tabela com o nome “${name.trim()}”. O nome anterior foi mantido.`)
    table.nome=name.trim()
  }
  function renameColumn(column,name){
    if(!selected.value?.colunas.includes(column))return
    if(!name.trim()&&selected.value.colunas.some(c=>c.checks.some(check=>check.construtor&&builderUsesColumn(check.construtor,column.nome))))throw new Error('Esta coluna é usada em um CHECK e precisa manter um nome.')
    if(!name.trim()&&selected.value.uniqueCompostos.some(group=>group.colunas.includes(column.uid)))throw new Error('Esta coluna participa de um UNIQUE composto e precisa manter um nome.')
    if(nameConflict(selected.value.colunas,name,column))throw new Error(`Já existe uma coluna com o nome “${name.trim()}” nesta tabela. O nome anterior foi mantido.`)
    const previous=column.nome
    column.nome=name.trim()
    for(const c of selected.value.colunas)for(const check of c.checks){
      if(!check.construtor)continue
      visitCheckConditions(check.construtor,condition=>{
        if(condition.coluna===previous)condition.coluna=column.nome
        if(condition.origem==='coluna'&&condition.valor===previous)condition.valor=column.nome
      })
      check.expressao=compileCheckBuilder(check.construtor,selected.value.colunas)
    }
  }
  function addCompositeUnique(ids){
    const table=selected.value
    if(!table)return
    validateGroup(ids,table.colunas)
    if(table.uniqueCompostos.some(group=>groupKey(group.colunas)===groupKey(ids)))throw new Error('Esta combinação de colunas já possui UNIQUE composto.')
    table.uniqueCompostos.push({uid:makeId(),colunas:[...ids]})
  }
  function removeCompositeUnique(id){
    if(selected.value)selected.value.uniqueCompostos=selected.value.uniqueCompostos.filter(group=>group.uid!==id)
  }
  function removeTable(){doc.value.tabelas=doc.value.tabelas.filter(t=>t.uid!==selectedId.value);selectedId.value=doc.value.tabelas[0]?.uid||null}
  const columns=computed(()=>selected.value?orderColumns(selected.value.colunas):[])
  const primaryKeyColumns=computed(()=>selected.value?.colunas.filter(c=>c.pk)||[])
  const isUnique=c=>c.unique||(c.pk&&primaryKeyColumns.value.length===1)
  const isCompositeUnique=c=>c.uniqueComposto||selected.value?.uniqueCompostos.some(group=>isCompositeOwner(group,c.uid))||false
  const isUniqueEnabled=c=>isUnique(c)||isCompositeUnique(c)
  const isCheckEnabled=c=>c.checkEnabled||c.checks.length>0
  function setCheck(column,enabled){
    column.checkEnabled=enabled
    if(!enabled)column.checks=[]
  }
  function saveCheck(column,id,expression,builder=null){
    if(!selected.value?.colunas.includes(column))return
    const expressao=builder?compileCheckBuilder(builder,selected.value.colunas):checkExpression(expression)
    const fields={expressao,...(builder?{construtor:cloneBuilder(builder)}:{})}
    if(id){
      const check=column.checks.find(check=>check.uid===id)
      if(!check)throw new Error('Esta restrição CHECK não existe mais.')
      delete check.construtor
      Object.assign(check,fields)
    }else column.checks.push({uid:makeId(),...fields})
    column.checkEnabled=true
  }
  function removeCheck(column,id){column.checks=column.checks.filter(check=>check.uid!==id)}
  function clearColumnGroups(column){selected.value.uniqueCompostos=selected.value.uniqueCompostos.filter(group=>!isCompositeOwner(group,column.uid))}
  function setUnique(column,enabled){
    if(column.pk&&primaryKeyColumns.value.length===1)return
    column.unique=enabled
    if(!enabled){column.uniqueComposto=false;clearColumnGroups(column)}
  }
  function setCompositeUnique(column,enabled){
    if(column.pk&&primaryKeyColumns.value.length===1)return
    column.uniqueComposto=enabled
    column.unique=!enabled
    if(!enabled)clearColumnGroups(column)
  }
  function useDefaultKeyType(column){
    column.tipo='BIGINT'
    column.tamanho=''
    column.escala=''
    column.enumValores=[]
  }
  function setPrimaryKey(column,enabled){
    if(enabled&&!column.pk&&primaryKeyColumns.value.length)throw new Error('A tabela já possui uma chave primária.')
    column.pk=enabled
    if(enabled){useDefaultKeyType(column);column.imutavel=true;column.nullable=false}
  }
  function setForeignKey(column,enabled){
    column.fk=enabled
    if(enabled){useDefaultKeyType(column);column.padrao=''}
  }
  function setForeignTable(column,tableName){
    const previous=column.fkTabela.trim()
    if(!column.nome.trim()||(previous&&column.nome===`${previous}_id`)){
      const name=tableName.trim()?availableName(selected.value.colunas,`${tableName.trim()}_id`,column):''
      const used=selected.value.uniqueCompostos.some(group=>group.colunas.includes(column.uid))||selected.value.colunas.some(c=>c.checks.some(check=>check.construtor&&builderUsesColumn(check.construtor,column.nome)))
      if(name||!used)renameColumn(column,name)
    }
    column.fkTabela=tableName
  }
  function addColumn(){if(selected.value)selected.value.colunas=orderColumns([...selected.value.colunas,makeColumn()])}
  function addDefaults(){
    const t=selected.value
    if(!t)return
    const presets=[
      {nome:'id',tipo:'BIGINT',pk:true,nullable:false,imutavel:true,padrao:'GENERATED BY DEFAULT AS IDENTITY',descricao:'Identificador único automático.'},
      {nome:'criado_em',tipo:'TIMESTAMPTZ',nullable:false,padrao:'now()',imutavel:true,descricao:'Preenchido na criação do registro. Imutável após o primeiro preenchimento.'},
      {nome:'atualizado_em',tipo:'TIMESTAMPTZ',nullable:false,padrao:'now()',descricao:'Preenchido na criação e atualizado automaticamente a cada alteração do registro.'}
    ]
    for(const p of presets){
      if(p.pk&&t.colunas.some(c=>c.pk))continue
      if(!t.colunas.some(c=>c.nome.trim().toLowerCase()===p.nome))t.colunas.push({...makeColumn(),...p})
    }
    t.colunas=orderColumns(t.colunas)
  }
  function moveColumn(id,targetId,after=false){
    const table=selected.value
    if(!table||id===targetId)return false
    const source=table.colunas.find(c=>c.uid===id), target=table.colunas.find(c=>c.uid===targetId)
    if(!source||!target||isDefaultColumn(source)||isDefaultColumn(target))return false
    const next=orderColumns(table.colunas).filter(c=>c.uid!==id)
    next.splice(next.findIndex(c=>c.uid===targetId)+(after?1:0),0,source)
    table.colunas=orderColumns(next)
    return true
  }
  function removeColumn(id){
    if(!selected.value)return 0
    const table=selected.value
    const name=table.colunas.find(c=>c.uid===id)?.nome
    let removed=table.uniqueCompostos.filter(group=>group.colunas.includes(id)).length
    for(const column of table.colunas){
      const next=column.checks.filter(check=>!check.construtor||!builderUsesColumn(check.construtor,name))
      removed+=column.checks.length-next.length
      column.checks=next
    }
    table.uniqueCompostos=table.uniqueCompostos.filter(group=>!group.colunas.includes(id))
    table.colunas=table.colunas.filter(c=>c.uid!==id)
    return removed
  }
  function importData(data){
    const imported=convert(data)
    const error=duplicateNameError(imported.tabelas)
    if(error)throw new Error(error)
    doc.value=imported
    selectedId.value=doc.value.tabelas[0]?.uid||null
  }
  function importSql(sql,mode='merge'){
    if(!['merge','replace'].includes(mode))throw new Error('Modo de importação inválido.')
    const parsed=parsePostgresDDL(sql,doc.value.schema||'rpg')
    const current=JSON.parse(JSON.stringify(doc.value))
    let addedTables=0,addedColumns=0,skippedColumns=0
    if(mode==='replace'){
      importData({...parsed,projeto:current.projeto})
      return {...parsed.resumo,addedTables:parsed.tabelas.length,addedColumns:parsed.resumo.colunas,skippedColumns:0,avisos:parsed.avisos}
    }
    if(current.tabelas.length && current.schema.trim().toLowerCase()!==parsed.schema_alvo.trim().toLowerCase()){
      throw new Error('O SQL usa o schema '+parsed.schema_alvo+', mas o projeto atual usa '+current.schema+'. Importe em um projeto vazio ou use Substituir.')
    }
    if(!current.tabelas.length)current.schema=parsed.schema_alvo
    current.enums??=[]
    current.funcoesSql??=[]
    const identifier=s=>String(s).trim().toLowerCase()
    const appendUnique=(target,source)=>{for(const item of source||[])if(!target.some(x=>JSON.stringify(x)===JSON.stringify(item)))target.push(item)}
    for(const incoming of parsed.tabelas){
      const target=current.tabelas.find(t=>identifier(t.nome)===identifier(incoming.nome))
      if(!target){current.tabelas.push(incoming);addedTables++;addedColumns+=incoming.colunas.length;continue}
      target.sqlRestricoes??=[]
      target.sqlTriggers??=[]
      target.sqlIndices??=[]
      for(const col of incoming.colunas){
        if(target.colunas.some(existing=>identifier(existing.nome)===identifier(col.nome))){skippedColumns++;continue}
        target.colunas.push(col);addedColumns++
      }
      appendUnique(target.sqlRestricoes,incoming.sqlRestricoes)
      appendUnique(target.sqlTriggers,incoming.sqlTriggers)
      appendUnique(target.sqlIndices,incoming.sqlIndices)
      target.uniqueCompostos??=[]
      for(const group of incoming.uniqueCompostos){
        const groupKey=names=>[...names].map(identifier).sort().join('|')
        const existingKeys=target.uniqueCompostos.map(g=>groupKey(g.colunas.map(id=>target.colunas.find(c=>c.uid===id)?.nome||id)))
        if(!existingKeys.includes(groupKey(group.colunas)))target.uniqueCompostos.push(group)
      }
      if(!target.comentario?.trim()&&incoming.comentario)target.comentario=incoming.comentario
    }
    for(const incoming of parsed.enums){
      const old=current.enums.find(e=>identifier(e.schema)===identifier(incoming.schema)&&identifier(e.nome)===identifier(incoming.nome))
      if(old)old.valores=[...new Set([...old.valores,...incoming.valores])]
      else current.enums.push(incoming)
    }
    appendUnique(current.funcoesSql,parsed.funcoesSql)
    const imported=convert(current)
    const error=duplicateNameError(imported.tabelas)
    if(error)throw new Error(error)
    const previousSelected=selected.value?.nome
    doc.value=imported
    selectedId.value=doc.value.tabelas.find(t=>identifier(t.nome)===identifier(previousSelected))?.uid||doc.value.tabelas[0]?.uid||null
    return {...parsed.resumo,addedTables,addedColumns,skippedColumns,avisos:parsed.avisos}
  }
  const exported=computed(()=>({
    formato:'proposta_de_modelagem_banco_rpg',versao:2,projeto:doc.value.projeto,schema_alvo:doc.value.schema,
    ...(doc.value.enums?.length?{enums:doc.value.enums}:{}),
    ...(doc.value.funcoesSql?.length?{funcoesSql:doc.value.funcoesSql}:{}),
    tabelas:sortedTables.value.map(t=>({nome:t.nome,comentario:t.comentario,
      ...(t.sqlRestricoes?.length?{sqlRestricoes:t.sqlRestricoes}:{}),
      ...(t.sqlTriggers?.length?{sqlTriggers:t.sqlTriggers}:{}),
      ...(t.sqlIndices?.length?{sqlIndices:t.sqlIndices}:{}),
      ...(formatTableComment(doc.value.schema,t)?{comentario_sql:formatTableComment(doc.value.schema,t)}:{}),
      uniqueCompostos:t.uniqueCompostos.map(group=>({colunas:group.colunas.map(id=>t.colunas.find(c=>c.uid===id).nome)})),
      colunas:orderColumns(t.colunas).map(({uid,uniqueComposto,checkEnabled,checks,...c})=>({...c,padrao:c.fk?'':c.padrao,
        ...(formatColumnComment(doc.value.schema,t,c)?{comentario_sql:formatColumnComment(doc.value.schema,t,c)}:{}),
        checks:checks.map(({uid,...check})=>check),...(c.pk?{imutavel:true,nullable:false,unique:c.unique||t.colunas.filter(column=>column.pk).length===1}:{})}))}))
  }))
  return {doc,selectedId,selected,sortedTables,columns,primaryKeyColumns,isUnique,isCompositeUnique,isUniqueEnabled,setUnique,setCompositeUnique,isCheckEnabled,setCheck,saveCheck,removeCheck,setPrimaryKey,setForeignKey,setForeignTable,addTable,renameTable,renameColumn,nameError,removeTable,addColumn,addDefaults,moveColumn,removeColumn,importData,importSql,exported,addCompositeUnique,removeCompositeUnique}
})
