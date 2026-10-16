<script setup>
import { computed, nextTick, ref } from 'vue'
import { useModelStore, TYPES, isDefaultColumn } from './stores/modelador'
import TableCombobox from './components/TableCombobox.vue'
import NameInput from './components/NameInput.vue'
import CompositeUniqueEditor from './components/CompositeUniqueEditor.vue'
import ColumnBadges from './components/ColumnBadges.vue'
import CheckEditor from './components/CheckEditor.vue'
import { formatCheckSQL } from './checkConstraints.js'
import { Database, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Trash2, Download, Upload, Info, ChevronDown, ChevronUp, KeyRound, Copy, FileJson, GripVertical } from 'lucide-vue-next'
const store=useModelStore()
const sortedTables=computed(()=>[...store.doc.tabelas].sort((a,b)=>a.nome.trim().localeCompare(b.nome.trim(),'pt-BR',{sensitivity:'base'})))
const leftOpen=ref(true), rightOpen=ref(true), fileInput=ref(null)
const helpType=ref(''), tab=ref('txt'), notice=ref('')
const previewScope=ref('all'), formatOpen=ref(false)
const scopeAll=ref(null), scopeTable=ref(null)
function selectScope(scope){
  if(previewScope.value===scope)formatOpen.value=!formatOpen.value
  else{previewScope.value=scope;formatOpen.value=false}
}
async function selectFormat(format){
  tab.value=format
  formatOpen.value=false
  await nextTick()
  ;(previewScope.value==='all'?scopeAll.value:scopeTable.value)?.focus()
}
function togglePreview(){rightOpen.value=!rightOpen.value;formatOpen.value=false}
const dragged=ref(null), dropTarget=ref(null)
function startDrag(event,column){
  dragged.value={id:column.uid,tableId:store.selectedId}
  event.dataTransfer.effectAllowed='move'
  event.dataTransfer.setData('text/plain',column.uid)
}
function endDrag(){dragged.value=null;dropTarget.value=null}
function dragOver(event,column){
  if(!dragged.value||dragged.value.tableId!==store.selectedId||isDefaultColumn(column)||column.uid===dragged.value.id){dropTarget.value=null;return}
  event.preventDefault()
  event.dataTransfer.dropEffect='move'
  const rect=event.currentTarget.getBoundingClientRect()
  dropTarget.value={id:column.uid,after:event.clientY>rect.top+rect.height/2}
}
function dropColumn(event,column){
  if(!dragged.value||dragged.value.tableId!==store.selectedId||dropTarget.value?.id!==column.uid)return
  event.preventDefault()
  store.moveColumn(dragged.value.id,column.uid,dropTarget.value.after)
  endDrag()
}
async function moveWithKeyboard(event,column){
  if(!['ArrowUp','ArrowDown'].includes(event.key))return
  event.preventDefault()
  const movable=store.columns.filter(c=>!isDefaultColumn(c))
  const target=movable[movable.findIndex(c=>c.uid===column.uid)+(event.key==='ArrowUp'?-1:1)]
  const handle=event.currentTarget
  if(target&&store.moveColumn(column.uid,target.uid,event.key==='ArrowDown')){
    await nextTick()
    handle.focus()
    toast(`Coluna ${column.nome||'sem nome'} movida.`)
  }
}
const collapsed=ref(new Set())
const allColumnsCollapsed=computed(()=>store.columns.length>0&&store.columns.every(c=>collapsed.value.has(c.uid)))
function toggleAllColumns(){
  const expand=allColumnsCollapsed.value
  const next=new Set(collapsed.value)
  for(const column of store.columns){
    if(expand)next.delete(column.uid)
    else next.add(column.uid)
  }
  collapsed.value=next
}
function collapseDefaults(){
  const next=new Set(collapsed.value)
  for(const table of store.doc.tabelas)for(const column of table.colunas)if(isDefaultColumn(column))next.add(column.uid)
  collapsed.value=next
}
collapseDefaults()
function addDefaults(){store.addDefaults();collapseDefaults()}
const confirmation=ref(null), confirmationDialog=ref(null)
async function askConfirmation(options){
  if(confirmation.value)return false
  const result=new Promise(resolve=>{confirmation.value={...options,resolve}})
  await nextTick()
  confirmationDialog.value.showModal()
  return result
}
function closeConfirmation(accepted=false){
  const pending=confirmation.value
  if(!pending)return
  confirmation.value=null
  confirmationDialog.value.close()
  pending.resolve(accepted)
}
const sizes=['VARCHAR','CHAR','NUMERIC']
const fks=['BIGINT','INTEGER','SMALLINT','UUID','TEXT','VARCHAR']
const showSize=t=>sizes.includes(t)
const toast=t=>{notice.value=t;setTimeout(()=>notice.value='',3000)}
function download(filename,text,type){if(store.nameError){toast(store.nameError);return}const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}
function formatText(d){
  return [`Projeto: ${d.projeto}\nSchema: ${d.schema_alvo}\n`,...d.tabelas.map(t=>[
    `\nTABELA: ${t.nome}`,
    t.colunas.filter(c=>c.pk).length>1?`Chave primária composta (combinação única): ${t.colunas.filter(c=>c.pk).map(c=>c.nome||'sem_nome').join(', ')}`:'',
    ...t.uniqueCompostos.map(group=>`UNIQUE composto (${group.colunas.join(', ')}): a combinação dos valores não pode se repetir.`),
    ...t.colunas.flatMap(c=>c.checks.map(check=>`${formatCheckSQL(check.expressao)} — cadastrado em ${c.nome||'sem_nome'}`)),
    ...t.colunas.map(c=>[
      `- ${c.nome||'sem_nome'}: ${c.tipo}${showSize(c.tipo)&&c.tamanho?'('+c.tamanho+(c.tipo==='NUMERIC'&&c.escala?','+c.escala:'')+')':''}`,
      c.pk?'PK':'',c.fk?`FK -> ${c.fkTabela}.${c.fkColuna||'id'}`:'',c.nullable?'NULL':'NOT NULL',
      c.unique?'UNIQUE':'',c.padrao?`DEFAULT ${c.padrao} (na criação)`:'',
      c.imutavel?'IMUTÁVEL após o primeiro preenchimento':'',
      c.tipo==='ENUM'?`ENUM [${c.enumValores.join(', ')}]`:'',
      c.descricao?`Regra: ${c.descricao}`:''
    ].filter(Boolean).join(' | '))
  ].join('\n'))].join('\n')
}
const txt=computed(()=>formatText(store.exported))
const json=computed(()=>JSON.stringify(store.exported,null,2))
const previewData=computed(()=>{
  if(previewScope.value==='all')return store.exported
  const index=store.doc.tabelas.findIndex(t=>t.uid===store.selectedId)
  return {...store.exported,tabelas:index<0?[]:[store.exported.tabelas[index]]}
})
const previewContent=computed(()=>tab.value==='txt'?formatText(previewData.value):JSON.stringify(previewData.value,null,2))
const previewCopyLabel=computed(()=>previewScope.value==='all'?'Copiar tudo':'Copiar tabela atual')
async function importJson(e){const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(store.doc.tabelas.length&&!await askConfirmation({title:'Substituir projeto?',message:'As tabelas do projeto atual serão substituídas pelo arquivo importado. Exporte o projeto antes se quiser guardar uma cópia.',action:'Substituir projeto'}))return;store.importData(data);collapseDefaults();toast('Projeto importado.')}catch(err){toast('Erro ao importar: '+err.message)}finally{e.target.value=''}}
async function confirmDelete(){
  const table=store.selected
  if(!table)return
  if(await askConfirmation({title:'Excluir tabela?',message:`A tabela “${table.nome||'Sem nome'}” e todas as suas colunas serão excluídas do projeto. Esta ação não pode ser desfeita.`,action:'Excluir tabela'})){
    if(store.selectedId===table.uid)store.removeTable()
  }
}
function help(t){helpType.value=helpType.value===t?'':t}
function removeColumn(id){if(store.removeColumn(id))toast('Coluna excluída. As composições UNIQUE e os CHECKs do construtor que dependiam dela também foram removidos.')}
function toggleCard(id){const next=new Set(collapsed.value);next.has(id)?next.delete(id):next.add(id);collapsed.value=next}
function enumText(c){return c.enumValores.join('\n')}
function setEnum(c,str){c.enumValores=str.split(/[,\n]/).map(s=>s.trim()).filter(Boolean)}
function setType(c,v){c.tipo=v;if(!showSize(v)){c.tamanho='';c.escala=''}if(v!=='ENUM')c.enumValores=[];if(!fks.includes(v)){c.fk=false;c.fkTabela=''}}
const typeInfo=t=>TYPES.find(x=>x[0]===t)?.[1]||''
async function copyPreview(){if(store.nameError){toast(store.nameError);return}try{await navigator.clipboard.writeText(previewContent.value);toast(previewScope.value==='all'?'Projeto copiado.':'Tabela atual copiada.')}catch{toast('Não foi possível copiar.')}}
</script>

<template>
<div class="app">
  <header class="topbar">
    <div class="brand"><Database :size="23"/><div><strong>NexoDB Lab</strong><small>Projetos PostgreSQL e Supabase, sem alterar o banco</small></div></div>
    <div class="top-actions">
      <button class="btn ghost" @click="fileInput?.click()"><Upload :size="15"/> Importar</button>
      <button class="btn" :disabled="!!store.nameError" @click="download('modelo-banco.json',json,'application/json')"><FileJson :size="15"/> JSON</button>
      <button class="btn primary" :disabled="!!store.nameError" @click="download('modelo-banco.txt',txt,'text/plain')"><Download :size="15"/> TXT</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importJson"/>
    </div>
  </header>
  <div class="workspace" :class="{leftclosed:!leftOpen,rightclosed:!rightOpen}">
    <aside class="sidebar panel" :class="{collapsed:!leftOpen}">
      <button v-if="!leftOpen" class="dock-toggle" :title="leftOpen?'Recolher tabelas':'Expandir tabelas'" @click="leftOpen=!leftOpen"><PanelLeftClose v-if="leftOpen" :size="18"/><PanelLeftOpen v-else :size="18"/></button>
      <template v-if="leftOpen">
        <div class="sidehead"><h2>Tabelas <span class="subtle">({{store.doc.tabelas.length}})</span></h2><div class="panel-actions"><button class="iconbtn" title="Criar tabela" @click="store.addTable()"><Plus :size="18"/></button><button class="iconbtn" title="Recolher tabelas" aria-label="Recolher tabelas" @click="leftOpen=false"><PanelLeftClose :size="18"/></button></div></div>
        <label>Projeto<input v-model="store.doc.projeto" placeholder="Nome do projeto"/></label>
        <label>Schema<input v-model="store.doc.schema" placeholder="rpg"/></label>
        <nav class="tablelist">
          <button v-for="t in sortedTables" :key="t.uid" class="tablebtn" :title="t.nome||'Sem nome'" :class="{active:store.selectedId===t.uid}" @click="store.selectedId=t.uid">
            <Database :size="15"/><span>{{t.nome||'Sem nome'}}</span><small>{{t.colunas.length}}</small>
          </button>
        </nav>
        <button class="btn primary full" @click="store.addTable()"><Plus :size="16"/> Nova tabela</button>
      </template>
    </aside>
    <main class="editor panel">
      <p v-if="store.nameError" class="name-error" role="alert">{{store.nameError}} Corrija os nomes para exportar ou copiar o modelo.</p>
      <template v-if="store.selected">
        <div class="sectionhead"><div><h1>Estrutura da tabela</h1><p>Defina colunas, chaves e comportamentos esperados.</p></div><button class="btn danger" @click="confirmDelete"><Trash2 :size="16"/> Excluir</button></div>
        <div class="formgrid">
          <label>Nome da tabela<NameInput :key="store.selected.uid" label="Nome da tabela" :model-value="store.selected.nome" :commit="name=>store.renameTable(store.selected,name)" placeholder="ex.: financeiro"/></label>
        </div>
        <div class="sectionhead columnsheading"><h2>Colunas <span class="subtle">({{store.selected.colunas.length}})</span></h2><div class="buttons"><button class="btn" :disabled="!store.columns.length" @click="toggleAllColumns"><ChevronDown v-if="allColumnsCollapsed" :size="15"/><ChevronUp v-else :size="15"/>{{allColumnsCollapsed?'Expandir todas':'Recolher todas'}}</button><button class="btn" @click="addDefaults"><Plus :size="15"/> ID e datas padrão</button><button class="btn primary" @click="store.addColumn()"><Plus :size="15"/> Coluna</button></div></div>
        <div v-if="!store.selected.colunas.length" class="empty">Nenhuma coluna cadastrada. Use <strong>ID e datas padrão</strong> ou adicione uma coluna.</div>
        <p id="reorder-help" class="sr-only">Arraste pela alça para reordenar, ou use as setas para cima e para baixo com a alça em foco. ID e datas permanecem fixos.</p>
        <article v-for="c in store.columns" :key="c.uid" class="columncard" :class="{dragging:dragged?.id===c.uid,'drop-before':dropTarget?.id===c.uid&&!dropTarget.after,'drop-after':dropTarget?.id===c.uid&&dropTarget.after}" @dragover="dragOver($event,c)" @drop="dropColumn($event,c)">
          <div class="columnhead"><button v-if="!isDefaultColumn(c)" class="drag-handle" draggable="true" :aria-label="`Reordenar coluna ${c.nome||'sem nome'}`" aria-describedby="reorder-help" title="Arrastar para reordenar · ↑ ↓ pelo teclado" @dragstart="startDrag($event,c)" @dragend="endDrag" @keydown="moveWithKeyboard($event,c)"><GripVertical :size="17"/></button><button class="cardtoggle" :aria-expanded="!collapsed.has(c.uid)" @click="toggleCard(c.uid)"><ChevronDown v-if="!collapsed.has(c.uid)" :size="16"/><ChevronUp v-else :size="16"/><strong>{{c.nome||'Nova coluna'}}</strong> <small>{{c.tipo}}</small><ColumnBadges :column="c" :table="store.selected"/></button><button class="iconbtn danger" title="Excluir coluna" @click="removeColumn(c.uid)"><Trash2 :size="16"/></button></div>
          <div v-if="!collapsed.has(c.uid)" class="columnbody">
            <div class="fields3" :class="{fields2:!showSize(c.tipo)}">
              <label>Nome<NameInput label="Nome" :model-value="c.nome" :commit="name=>store.renameColumn(c,name)" placeholder="ex.: ficha_id"/></label>
              <label>Tipo de dado <button class="hint" type="button" :title="typeInfo(c.tipo)" @click="help(c.uid)"><Info :size="15"/></button>
                <select :value="c.tipo" @change="setType(c,$event.target.value)"><option v-for="[name] in TYPES" :key="name" :value="name">{{name}}</option></select>
              </label>
              <label v-if="showSize(c.tipo)">{{c.tipo==='NUMERIC'?'Precisão':'Comprimento máximo'}}<input v-model="c.tamanho" type="number" min="1" placeholder="ex.: 255"/></label>
            </div>
            <p v-if="helpType===c.uid" class="typehelp">{{c.tipo}}: {{typeInfo(c.tipo)}} <span v-if="c.tipo==='VARCHAR'">Ex.: VARCHAR(255).</span><span v-if="c.tipo==='NUMERIC'">Ex.: NUMERIC(10,2).</span></p>
            <div class="column-options" :class="{'has-scale':c.tipo==='NUMERIC','without-default':c.pk||c.fk}">
              <div v-if="c.tipo==='NUMERIC'||(!c.pk&&!c.fk)" class="fields2 defaultsrow">
                <label v-if="c.tipo==='NUMERIC'">Casas decimais<input v-model="c.escala" type="number" min="0" placeholder="ex.: 2"/></label>
                <label v-if="!c.pk&&!c.fk">Valor padrão na criação<input v-model="c.padrao" placeholder="Sem padrão definido"/><span class="fieldhelp">Usado ao criar o registro quando o valor não é informado. Ex.: now(), 0, FALSE.</span></label>
              </div>
              <div class="checkrow">
                <label v-if="c.pk||!store.primaryKeyColumns.length" class="check"><input :checked="c.pk" type="checkbox" @change="store.setPrimaryKey(c,$event.target.checked)"/> <KeyRound :size="14"/> PK</label>
                <label class="check"><input v-model="c.nullable" type="checkbox" :disabled="c.pk"/> Permite NULL</label>
                <label class="check"><input v-model="c.imutavel" type="checkbox" :disabled="c.pk"/> Imutável</label>
                <label class="check"><input :checked="store.isUniqueEnabled(c)" type="checkbox" :disabled="c.pk && store.primaryKeyColumns.length===1" @change="store.setUnique(c,$event.target.checked)"/> UNIQUE</label>
                <label v-if="store.isUniqueEnabled(c)&&(!c.pk||store.primaryKeyColumns.length!==1||store.isCompositeUnique(c))" class="check"><input :checked="store.isCompositeUnique(c)" type="checkbox" :disabled="c.pk&&store.primaryKeyColumns.length===1" @change="store.setCompositeUnique(c,$event.target.checked)"/> Composto</label>
                <label class="check"><input :checked="store.isCheckEnabled(c)" type="checkbox" @change="store.setCheck(c,$event.target.checked)"/> CHECK</label>
                <label class="check"><input :checked="c.fk" type="checkbox" @change="store.setForeignKey(c,$event.target.checked)"/> <KeyRound :size="14"/> FK</label>
              </div>
            </div>
            <p v-if="c.pk && store.primaryKeyColumns.length>1" class="typehelp">Estas colunas formam uma única PK composta: a combinação dos valores é única. Marque UNIQUE apenas se esta coluna também precisar ser única individualmente.</p>
            <p v-if="c.imutavel" class="rulehelp"><Info :size="15"/><span>Após o primeiro preenchimento, esta coluna não deve aceitar alterações. Regra incluída na proposta; precisa ser implementada no banco ou na aplicação.</span></p>
            <div class="fields2" v-if="c.fk">
              <label>Tabela referenciada<TableCombobox :model-value="c.fkTabela" :options="store.doc.tabelas.map(t=>t.nome)" @update:model-value="store.setForeignTable(c,$event)"/></label>
              <label>Coluna referenciada<input v-model="c.fkColuna" placeholder="id"/></label>
            </div>
            <label v-if="c.tipo==='ENUM'">Valores do ENUM, um por linha<textarea :value="enumText(c)" @input="setEnum(c,$event.target.value)" rows="3" placeholder="Principal&#10;Direto&#10;Indireto"/></label>
            <CompositeUniqueEditor v-if="store.isCompositeUnique(c)" :table="store.selected" :column="c" :add="store.addCompositeUnique" :remove="store.removeCompositeUnique"/>
            <CheckEditor v-if="store.isCheckEnabled(c)" :column="c" :columns="store.selected.colunas" :save="(id,expression,builder)=>store.saveCheck(c,id,expression,builder)" :remove="id=>store.removeCheck(c,id)"/>
            <label>Regra<textarea v-model="c.descricao" rows="2" placeholder="Regra, validação CHECK ou trigger da coluna..."/></label>
          </div>
        </article>
        <button class="btn primary" @click="store.addColumn()"><Plus :size="15"/> Adicionar coluna</button>
      </template>
      <div v-else class="welcome"><Database :size="42"/><h2>Comece com uma tabela</h2><p>Crie seu modelo e exporte uma proposta estruturada.</p><button class="btn primary" @click="store.addTable()"><Plus :size="15"/> Nova tabela</button></div>
    </main>
    <aside class="preview panel" :class="{collapsed:!rightOpen}" aria-label="Prévia do modelo">
      <button v-if="!rightOpen" class="dock-toggle" title="Expandir prévia" aria-label="Expandir prévia" @click="togglePreview"><PanelRightOpen :size="18"/></button>
      <template v-if="rightOpen">
        <div class="preview-toolbar" @keydown.esc="formatOpen=false">
          <button class="iconbtn" title="Recolher prévia" aria-label="Recolher prévia" @click="togglePreview"><PanelRightClose :size="18"/></button>
          <div class="tabs scope-tabs" role="group" aria-label="Conteúdo da prévia">
            <button ref="scopeAll" :class="{active:previewScope==='all'}" :aria-pressed="previewScope==='all'" :aria-expanded="previewScope==='all'&&formatOpen" aria-controls="preview-formats" title="Esquema · clique novamente para escolher TXT ou JSON" @click="selectScope('all')">Esquema<ChevronDown v-if="previewScope==='all'" :size="12"/></button>
            <button ref="scopeTable" :class="{active:previewScope==='table'}" :aria-pressed="previewScope==='table'" :aria-expanded="previewScope==='table'&&formatOpen" aria-controls="preview-formats" title="Tabela · clique novamente para escolher TXT ou JSON" @click="selectScope('table')">Tabela<ChevronDown v-if="previewScope==='table'" :size="12"/></button>
          </div>
        </div>
        <div v-if="formatOpen" id="preview-formats" class="format-picker" role="group" aria-label="Formato da prévia" @keydown.esc.stop="selectFormat(tab)">
          <button :class="{active:tab==='txt'}" :aria-pressed="tab==='txt'" @click="selectFormat('txt')">TXT</button>
          <button :class="{active:tab==='json'}" :aria-pressed="tab==='json'" @click="selectFormat('json')">JSON</button>
        </div>
        <div class="code-preview">
          <div class="code-toolbar"><span>{{tab.toUpperCase()}}</span><button class="code-copy" :title="previewCopyLabel" :aria-label="previewCopyLabel" :disabled="!!store.nameError||(previewScope==='table'&&!store.selected)" @click="copyPreview"><Copy :size="14"/>Copiar</button></div>
          <pre><code>{{previewScope==='table'&&!store.selected?'Selecione ou crie uma tabela para visualizar.':previewContent}}</code></pre>
        </div>
      </template>
    </aside>
  </div>
  <dialog ref="confirmationDialog" class="confirmation-dialog" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" @cancel.prevent="closeConfirmation(false)">
    <template v-if="confirmation">
      <div class="confirmation-icon"><Info :size="22"/></div>
      <h2 id="confirmation-title">{{confirmation.title}}</h2>
      <p id="confirmation-description">{{confirmation.message}}</p>
      <div class="confirmation-actions">
        <button class="btn" autofocus @click="closeConfirmation(false)">Cancelar</button>
        <button class="btn danger" @click="closeConfirmation(true)">{{confirmation.action}}</button>
      </div>
    </template>
  </dialog>
  <div v-if="notice" class="toast" role="status">{{notice}}</div>
</div>
</template>
