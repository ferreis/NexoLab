import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { availableName, duplicateNameError, nameConflict } from '../modelNames.js'
import { convertGroups, groupKey, validateGroup, isCompositeOwner } from '../compositeUnique.js'
import { checkExpression, convertChecks } from '../checkConstraints.js'
import { compileCheckBuilder, cloneBuilder, builderUsesColumn, visitCheckConditions } from '../checkBuilder.js'
import { formatTableComment, formatColumnComment } from '../tableComments.js'

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
  ['TEXT[]','Lista de textos.']
]
const makeId=()=>crypto.randomUUID()
export const makeColumn=(name='',type='VARCHAR')=>({uid:makeId(),nome:name,tipo:type,tamanho:'',escala:'',nullable:false,pk:false,unique:false,uniqueComposto:false,checkEnabled:false,checks:[],fk:false,fkTabela:'',fkColuna:'id',padrao:'',imutavel:false,enumValores:[],descricao:'',comentario:''})
export const makeTable=()=>({uid:makeId(),nome:'nova_tabela',comentario:'',finalidade:'',regras:'',colunas:[],uniqueCompostos:[]})
const base=()=>({version:2,projeto:'NexoDB Lab',schema:'rpg',tabelas:[]})
const columnName=c=>c.nome.trim().toLowerCase()
export const isDefaultColumn=c=>['id','criado_em','atualizado_em'].includes(columnName(c))
function orderColumns(columns){
  const rank=c=>({id:0,criado_em:2,atualizado_em:3}[columnName(c)]??1)
  return [...columns].sort((a,b)=>rank(a)-rank(b))
}
function convertColumn(c){
  const {atualizarAoAlterar,comentario_sql,...fields}=c
  const description=String(c.descricao||'')
  const updateRule='Atualizar com a data e hora atuais a cada alteração do registro.'
  return {
    ...makeColumn(),...fields,...(c.pk?{imutavel:true,nullable:false}:{}),uid:c.uid||makeId(),padrao:String(c.padrao??c.default??''),fk:!!(c.fk||c.fkTabela),
    checks:convertChecks(c.checks),
    comentario:String(c.comentario??''),
    descricao:atualizarAoAlterar&&!/a cada alteração/i.test(description)?[description,updateRule].filter(Boolean).join('\n'):description,
    enumValores:Array.isArray(c.enumValores)?c.enumValores:c.enumValores?.split(/[,\n]/).map(v=>v.trim()).filter(Boolean)||[]
  }
}
function convert(input){
  if (!input || !Array.isArray(input.tabelas)) throw new Error('Arquivo sem a lista de tabelas')
  return {version:2,projeto:String(input.projeto||'NexoDB Lab'),schema:String(input.schema_alvo||input.schema||'rpg'),tabelas:input.tabelas.map(t=>{
    const colunas=orderColumns((t.colunas||[]).map(convertColumn))
    for(const column of colunas)for(const check of column.checks)if(check.construtor&&compileCheckBuilder(check.construtor,colunas)!==check.expressao)throw new Error('A expressão CHECK não corresponde às condições do construtor.')
    return {
    uid:t.uid||makeId(),nome:String(t.nome||''),comentario:String(t.comentario??''),finalidade:String(t.finalidade??t.descricao??''),
    regras:[String(t.regras??t.observacoes??''),t.automacoes?`Triggers e funções:\n${t.automacoes}`:''].filter(Boolean).join('\n\n'),
    colunas,uniqueCompostos:convertGroups(t.uniqueCompostos,colunas)
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
    if(enabled)useDefaultKeyType(column)
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
  const exported=computed(()=>({
    formato:'proposta_de_modelagem_banco_rpg',versao:2,projeto:doc.value.projeto,schema_alvo:doc.value.schema,
    tabelas:sortedTables.value.map(t=>({nome:t.nome,comentario:t.comentario,
      ...(formatTableComment(doc.value.schema,t)?{comentario_sql:formatTableComment(doc.value.schema,t)}:{}),
      uniqueCompostos:t.uniqueCompostos.map(group=>({colunas:group.colunas.map(id=>t.colunas.find(c=>c.uid===id).nome)})),
      colunas:orderColumns(t.colunas).map(({uid,uniqueComposto,checkEnabled,checks,...c})=>({...c,
        ...(formatColumnComment(doc.value.schema,t,c)?{comentario_sql:formatColumnComment(doc.value.schema,t,c)}:{}),
        checks:checks.map(({uid,...check})=>check),...(c.pk?{imutavel:true,nullable:false,unique:c.unique||t.colunas.filter(column=>column.pk).length===1}:{})}))}))
  }))
  return {doc,selectedId,selected,sortedTables,columns,primaryKeyColumns,isUnique,isCompositeUnique,isUniqueEnabled,setUnique,setCompositeUnique,isCheckEnabled,setCheck,saveCheck,removeCheck,setPrimaryKey,setForeignKey,setForeignTable,addTable,renameTable,renameColumn,nameError,removeTable,addColumn,addDefaults,moveColumn,removeColumn,importData,exported,addCompositeUnique,removeCompositeUnique}
})
