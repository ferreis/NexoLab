import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { availableName, duplicateNameError, nameConflict } from '../modelNames.js'
import { convertGroups, groupKey, validateGroup, isCompositeOwner } from '../compositeUnique.js'
import { checkExpression, convertChecks } from '../checkConstraints.js'
import { compileCheckBuilder, cloneBuilder, builderUsesColumn, visitCheckConditions } from '../checkBuilder.js'
import { formatTableComment, formatColumnComment } from '../tableComments.js'
import { parsePostgresDDL } from '../sqlImport.js'
import { validateFunctionSql, parseFunction, replaceFunctionReference, referencesInText } from '../sqlFunctions.js'
import { renameColumnsInDocument, renameTableInDocument, bulkReplaceName, updateImportedCheck, rewriteSqlIdentifiers } from '../modelRefactor.js'
import { transferColumnsInDocument } from '../columnTransfer.js'

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
const base=()=>({version:2,projeto:'NexoDB Lab',schema:'rpg',regrasSchema:'',tabelas:[],enums:[],funcoesSql:[],comentariosSql:[]})
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
  return {version:2,projeto:String(input.projeto||'NexoDB Lab'),schema:String(input.schema_alvo||input.schema||'rpg'),regrasSchema:String(input.regrasSchema??''),
    enums:Array.isArray(input.enums)?input.enums:[],funcoesSql:Array.isArray(input.funcoesSql)?input.funcoesSql:[],comentariosSql:Array.isArray(input.comentariosSql)?input.comentariosSql:[],
    tabelas:input.tabelas.map(t=>{
    const colunas=orderColumns((t.colunas||[]).map(convertColumn))
    for(const column of colunas)for(const check of column.checks)if(check.construtor&&compileCheckBuilder(check.construtor,colunas)!==check.expressao)throw new Error('A expressão CHECK não corresponde às condições do construtor.')
    return {
    uid:t.uid||makeId(),nome:String(t.nome||''),comentario:String(t.comentario??''),finalidade:String(t.finalidade??t.descricao??''),
    regras:[String(t.regras??t.observacoes??''),t.automacoes?`Triggers e funções:\n${t.automacoes}`:''].filter(Boolean).join('\n\n'),
    colunas,uniqueCompostos:convertGroups(t.uniqueCompostos,colunas),
    sqlRestricoes:Array.isArray(t.sqlRestricoes)?t.sqlRestricoes:[],
    sqlTriggers:Array.isArray(t.sqlTriggers)?t.sqlTriggers:[],
    sqlIndices:Array.isArray(t.sqlIndices)?t.sqlIndices:[],
    sqlPoliticas:Array.isArray(t.sqlPoliticas)?t.sqlPoliticas:[]
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
  const renameHelpers={compileCheckBuilder,visitCheckConditions}
  function renameTable(table,name){
    if(!doc.value.tabelas.some(t=>t.uid===table.uid))return
    // Valida a refatoração inteira antes de alterar qualquer objeto reativo.
    renameTableInDocument(JSON.parse(JSON.stringify(doc.value)),table.uid,name,renameHelpers)
    return renameTableInDocument(doc.value,table.uid,name,renameHelpers)
  }
  function renameColumn(column,name){
    if(!selected.value?.colunas.includes(column))return
    const next=String(name??'').trim()
    if(!next){
      if(selected.value.colunas.some(c=>c.checks.some(check=>check.construtor&&builderUsesColumn(check.construtor,column.nome))))throw new Error('Esta coluna é usada em um CHECK e precisa manter um nome.')
      if(selected.value.uniqueCompostos.some(group=>group.colunas.includes(column.uid)))throw new Error('Esta coluna participa de um UNIQUE composto e precisa manter um nome.')
      column.nome=''
      return
    }
    const edits=[{tableId:selected.value.uid,columnId:column.uid,name:next}]
    renameColumnsInDocument(JSON.parse(JSON.stringify(doc.value)),edits,renameHelpers)
    renameColumnsInDocument(doc.value,edits,renameHelpers)
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
    if(!enabled)for(const check of column.checks){
      if(check.origemRestricao)updateImportedCheck(selected.value,check)
    }
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
      if(check.origemRestricao)updateImportedCheck(selected.value,check,expressao)
      delete check.construtor
      Object.assign(check,fields)
    }else column.checks.push({uid:makeId(),...fields})
    column.checkEnabled=true
  }
  function removeCheck(column,id){
    const check=column.checks.find(item=>item.uid===id)
    if(check?.origemRestricao)updateImportedCheck(selected.value,check)
    column.checks=column.checks.filter(item=>item.uid!==id)
  }
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
  function duplicateColumn(id){
    const table=selected.value
    const index=table?.colunas.findIndex(column=>column.uid===id)??-1
    if(index<0)return null
    const original=table.colunas[index]
    const name=availableName(table.colunas,`${original.nome.trim()||'nova_coluna'}_copia`)
    // Copiar a configuração, mas nunca repetir identidade, PK ou vínculos de UNIQUE composto.
    const copy=JSON.parse(JSON.stringify(original))
    copy.uid=makeId()
    copy.nome=name
    copy.pk=false
    copy.unique=original.pk?false:!!original.unique
    copy.uniqueComposto=false
    if(/^GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(String(copy.padrao||'').trim()))copy.padrao=''
    copy.checks=(original.checks||[]).map(check=>{
      const duplicate={...check,uid:makeId()}
      // Uma constraint SQL importada pertence à coluna original; não reutilizar seu nome.
      delete duplicate.origemRestricao
      const rename=[{old:original.nome,name}]
      if(duplicate.construtor){
        duplicate.construtor=cloneBuilder(duplicate.construtor)
        visitCheckConditions(duplicate.construtor,condition=>{
          if(condition.coluna===original.nome)condition.coluna=name
          if(condition.origem==='coluna'&&condition.valor===original.nome)condition.valor=name
        })
        duplicate.expressao=compileCheckBuilder(duplicate.construtor,[...table.colunas,copy])
      }else duplicate.expressao=rewriteSqlIdentifiers(duplicate.expressao,rename)
      return duplicate
    })
    table.colunas=orderColumns([...table.colunas.slice(0,index+1),copy,...table.colunas.slice(index+1)])
    return copy
  }
  const defaultColumns=[
    {nome:'id',tipo:'BIGINT',pk:true,unique:true,nullable:false,imutavel:true,padrao:'GENERATED BY DEFAULT AS IDENTITY',descricao:'Identificador único automático.'},
    {nome:'criado_em',tipo:'TIMESTAMPTZ',pk:false,unique:false,nullable:false,imutavel:true,padrao:'now()',descricao:'Preenchido na criação do registro. Imutável após o primeiro preenchimento.'},
    {nome:'atualizado_em',tipo:'TIMESTAMPTZ',pk:false,unique:false,nullable:false,imutavel:false,padrao:'now()',descricao:'Preenchido na criação e atualizado automaticamente a cada alteração do registro.'}
  ]
  function addDefaults(scope='selected'){
    if(scope!=='selected'&&scope!=='all')throw new Error('Escopo inválido para as colunas padrão.')
    const tables=scope==='all'?doc.value.tabelas:selected.value?[selected.value]:[]
    let created=0,updated=0,skipped=0
    for(const t of tables){
      for(const preset of defaultColumns){
        let col=t.colunas.find(c=>columnName(c)===preset.nome)
        if(preset.pk&&t.colunas.some(c=>c.pk&&c!==col)){skipped++;continue}
        if(!col){col=makeColumn(preset.nome,preset.tipo);t.colunas.push(col);created++}
        else updated++
        Object.assign(col,preset,{tamanho:'',escala:'',fk:false,fkTabela:'',fkColuna:'id',enumValores:[],enumNome:''})
      }
      t.colunas=orderColumns(t.colunas)
    }
    return {tables:tables.length,created,updated,skipped}
  }
  function bulkRenameColumns(ids,find,replacement,matchCase=false){
    const idsSet=new Set(ids)
    if(!idsSet.size)throw new Error('Selecione pelo menos uma coluna.')
    const edits=[]
    for(const t of doc.value.tabelas)for(const col of t.colunas){
      if(!idsSet.has(col.uid))continue
      const name=bulkReplaceName(col.nome,find,replacement,matchCase)
      if(name!==col.nome)edits.push({tableId:t.uid,columnId:col.uid,name})
    }
    if(!edits.length)throw new Error('Nenhuma das colunas selecionadas contém esse trecho.')
    const draft=JSON.parse(JSON.stringify(doc.value))
    renameColumnsInDocument(draft,edits,renameHelpers)
    doc.value=convert(draft)
    return {changed:edits.length}
  }
  function bulkSetColumns(ids,property,value){
    const allowed=['tipo','nullable','imutavel','padrao']
    if(!allowed.includes(property))throw new Error('Propriedade não suportada para edição em massa.')
    if(!ids.length)throw new Error('Selecione pelo menos uma coluna.')
    const draft=JSON.parse(JSON.stringify(doc.value)),selectedIds=new Set(ids)
    let changed=0
    for(const t of draft.tabelas)for(const c of t.colunas){
      if(!selectedIds.has(c.uid))continue
      if(property==='tipo'){
        if(!TYPES.some(([type])=>type===value))throw new Error('Tipo de coluna não suportado.')
        if(c.fk&&c.tipo!==value)throw new Error('Não é possível trocar o tipo de uma FK em massa. Revise individualmente.')
        if(c.tipo===value)continue
        c.tipo=value;c.tamanho='';c.escala='';if(value!=='ENUM'){c.enumValores=[];c.enumNome=''}
      }else if(property==='nullable'){
        if(c.pk&&value)throw new Error('Uma coluna PK não pode permitir NULL.')
        if(c.nullable===value)continue
        c.nullable=!!value
      }else if(property==='imutavel'){
        if(c.pk&&!value)throw new Error('A coluna PK deve continuar imutável no modelador.')
        if(c.imutavel===value)continue
        c.imutavel=!!value
      }else if(property==='padrao'){
        if(c.fk)throw new Error('Uma FK não aceita valor padrão pelo editor atual.')
        if(c.padrao===value)continue
        c.padrao=String(value)
      }
      changed++
    }
    if(!changed)throw new Error('Nenhuma mudança necessária nas colunas selecionadas.')
    doc.value=convert(draft)
    return {changed}
  }
  function transferColumns(sourceId,targetId,ids){
    // Preparar e validar tudo em uma cópia para evitar mudanças parciais.
    const draft=JSON.parse(JSON.stringify(doc.value))
    const result=transferColumnsInDocument(draft,sourceId,targetId,ids)
    const validated=convert(draft)
    const error=duplicateNameError(validated.tabelas)
    if(error)throw new Error(error)
    doc.value=validated
    return result
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
      for(const discarded of column.checks.filter(check=>!next.includes(check))){
        if(discarded.origemRestricao)updateImportedCheck(table,discarded)
      }
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
    current.comentariosSql??=[]
    const identifier=s=>String(s).trim().toLowerCase()
    const appendUnique=(target,source)=>{for(const item of source||[])if(!target.some(x=>JSON.stringify(x)===JSON.stringify(item)))target.push(item)}
    for(const incoming of parsed.tabelas){
      const target=current.tabelas.find(t=>identifier(t.nome)===identifier(incoming.nome))
      if(!target){current.tabelas.push(incoming);addedTables++;addedColumns+=incoming.colunas.length;continue}
      target.sqlRestricoes??=[]
      target.sqlTriggers??=[]
      target.sqlIndices??=[]
      target.sqlPoliticas??=[]
      for(const col of incoming.colunas){
        const existing=target.colunas.find(c=>identifier(c.nome)===identifier(col.nome))
        if(existing){
          skippedColumns++
          existing.checks??=[]
          // Preserve as regras já editadas, mas importe CHECKs inéditos.
          for(const check of col.checks||[]){
            if(!existing.checks.some(c=>c.expressao===check.expressao||c.origemRestricao&&c.origemRestricao===check.origemRestricao)){
              existing.checks.push(check)
              existing.checkEnabled=true
            }
          }
          continue
        }
        target.colunas.push(col);addedColumns++
      }
      appendUnique(target.sqlRestricoes,incoming.sqlRestricoes)
      appendUnique(target.sqlTriggers,incoming.sqlTriggers)
      appendUnique(target.sqlIndices,incoming.sqlIndices)
      appendUnique(target.sqlPoliticas,incoming.sqlPoliticas)
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
    appendUnique(current.comentariosSql,parsed.comentariosSql)
    const imported=convert(current)
    const error=duplicateNameError(imported.tabelas)
    if(error)throw new Error(error)
    const previousSelected=selected.value?.nome
    doc.value=imported
    selectedId.value=doc.value.tabelas.find(t=>identifier(t.nome)===identifier(previousSelected))?.uid||doc.value.tabelas[0]?.uid||null
    return {...parsed.resumo,addedTables,addedColumns,skippedColumns,avisos:parsed.avisos}
  }
  function saveFunctionSql(sql,index=null){
    const parsed=validateFunctionSql(sql)
    const current=doc.value.funcoesSql||[]
    if(index!==null&&(!Number.isInteger(index)||index<0||index>=current.length))throw new Error('Função não encontrada.')
    const previous=index===null?null:parseFunction(current[index])
    const same=current.some((existing,i)=>i!==index&&existing.trim()===String(sql).trim())
    if(same)throw new Error('Esta definição SQL já existe.')
    if(index===null)doc.value.funcoesSql.push(String(sql).trim())
    else doc.value.funcoesSql[index]=String(sql).trim()
    if(previous&&previous.name!==parsed.name&&!current.some((item,i)=>i!==index&&parseFunction(item)?.name===previous.name)){
      doc.value.regrasSchema=replaceFunctionReference(doc.value.regrasSchema,previous.name,parsed.name)
      for(const t of doc.value.tabelas){
        t.regras=replaceFunctionReference(t.regras,previous.name,parsed.name)
        for(const c of t.colunas)c.descricao=replaceFunctionReference(c.descricao,previous.name,parsed.name)
      }
    }
    return parsed
  }
  function removeFunctionSql(index){
    const functions=doc.value.funcoesSql||[]
    if(!Number.isInteger(index)||index<0||index>=functions.length)throw new Error('Função não encontrada.')
    const name=parseFunction(functions[index])?.name
    const others=functions.filter((_,i)=>i!==index)
    if(name&&!others.some(sql=>parseFunction(sql)?.name===name)){
      const texts=[doc.value.regrasSchema,...doc.value.tabelas.flatMap(t=>[t.regras,...t.colunas.map(c=>c.descricao)])]
      if(texts.some(t=>referencesInText(t,functions).some(ref=>ref.toLowerCase()===name.toLowerCase())))throw new Error('Esta função está referenciada em regras. Remova as referências #'+name+' antes de excluí-la.')
    }
    doc.value.funcoesSql.splice(index,1)
  }
  const exported=computed(()=>({
    formato:'proposta_de_modelagem_banco_rpg',versao:2,projeto:doc.value.projeto,schema_alvo:doc.value.schema,regrasSchema:doc.value.regrasSchema,
    ...(doc.value.enums?.length?{enums:doc.value.enums}:{}),
    ...(doc.value.funcoesSql?.length?{funcoesSql:doc.value.funcoesSql}:{}),
    ...(doc.value.comentariosSql?.length?{comentariosSql:doc.value.comentariosSql}:{}),
    tabelas:sortedTables.value.map(t=>({nome:t.nome,comentario:t.comentario,regras:t.regras,finalidade:t.finalidade,
      ...(t.sqlRestricoes?.length?{sqlRestricoes:t.sqlRestricoes}:{}),
      ...(t.sqlTriggers?.length?{sqlTriggers:t.sqlTriggers}:{}),
      ...(t.sqlIndices?.length?{sqlIndices:t.sqlIndices}:{}),
      ...(t.sqlPoliticas?.length?{sqlPoliticas:t.sqlPoliticas}:{}),
      ...(formatTableComment(doc.value.schema,t)?{comentario_sql:formatTableComment(doc.value.schema,t)}:{}),
      uniqueCompostos:t.uniqueCompostos.map(group=>({colunas:group.colunas.map(id=>t.colunas.find(c=>c.uid===id).nome)})),
      colunas:orderColumns(t.colunas).map(({uid,uniqueComposto,checkEnabled,checks,...c})=>({...c,padrao:c.fk?'':c.padrao,
        ...(formatColumnComment(doc.value.schema,t,c)?{comentario_sql:formatColumnComment(doc.value.schema,t,c)}:{}),
        checks:checks.map(({uid,...check})=>check),...(c.pk?{imutavel:true,nullable:false,unique:c.unique||t.colunas.filter(column=>column.pk).length===1}:{})}))}))
  }))
  return {doc,selectedId,selected,sortedTables,columns,primaryKeyColumns,isUnique,isCompositeUnique,isUniqueEnabled,setUnique,setCompositeUnique,isCheckEnabled,setCheck,saveCheck,removeCheck,setPrimaryKey,setForeignKey,setForeignTable,addTable,renameTable,renameColumn,nameError,removeTable,addColumn,duplicateColumn,addDefaults,bulkRenameColumns,bulkSetColumns,transferColumns,moveColumn,removeColumn,importData,importSql,exported,addCompositeUnique,removeCompositeUnique,saveFunctionSql,removeFunctionSql}
})
