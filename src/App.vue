<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useModelStore, TYPES, isDefaultColumn } from './stores/modelador'
import TableCombobox from './components/TableCombobox.vue'
import NameInput from './components/NameInput.vue'
import CompositeUniqueEditor from './components/CompositeUniqueEditor.vue'
import ColumnBadges from './components/ColumnBadges.vue'
import HelpTooltip from './components/HelpTooltip.vue'
import CheckEditor from './components/CheckEditor.vue'
import EnumValuesInput from './components/EnumValuesInput.vue'
import SqlImportDialog from './components/SqlImportDialog.vue'
import BulkEditDialog from './components/BulkEditDialog.vue'
import DiagramViewer from './components/DiagramViewer.vue'
import SqlFunctionManager from './components/SqlFunctionManager.vue'
import SchemaObjectDialog from './components/SchemaObjectDialog.vue'
import SchemaRulesDialog from './components/SchemaRulesDialog.vue'
import SidebarCategoryMenu from './components/SidebarCategoryMenu.vue'
import { schemaCategories, schemaEntries } from './schemaNavigation.js'
import FunctionMentionTextarea from './components/FunctionMentionTextarea.vue'
import { formatText, formatTablePreviewText } from './textExport.js'
import { tablePreview } from './tablePreview.js'
import { Database, PanelLeftClose, PanelLeftOpen, Plus, Trash2, Download, Upload, Info, ChevronDown, ChevronUp, KeyRound, Copy, FileJson, GripVertical, Code2, List, Workflow, FilePenLine, ArrowDownToLine } from 'lucide-vue-next'
const store=useModelStore()
const topbar=ref(null)
const headerHeight=ref(76)
let headerResizeObserver
onMounted(()=>{
  if(!topbar.value)return
  const updateHeaderHeight=()=>{
    headerHeight.value=topbar.value.getBoundingClientRect().height
  }
  updateHeaderHeight()
  if(typeof ResizeObserver!=='undefined'){
    headerResizeObserver=new ResizeObserver(updateHeaderHeight)
    headerResizeObserver.observe(topbar.value)
  }
})
onUnmounted(()=>headerResizeObserver?.disconnect())
const checkEditors=new Map(), uniqueEditors=new Map()
function registerEditor(editors,id,instance){if(instance)editors.set(id,instance);else editors.delete(id)}
const leftOpen=ref(true), fileInput=ref(null), sqlDialog=ref(null), bulkDialog=ref(null), functionDialog=ref(null), objectDialog=ref(null), schemaRulesDialog=ref(null), previewScroll=ref(null)
const helpType=ref(''), tab=ref('txt'), notice=ref('')
const sidebarCategory=ref('tables')
const sidebarCategories=computed(()=>[...schemaCategories(store.doc),{value:'diagrams',label:'Diagramas',count:null},{value:'preview',label:'Prévia',count:null}])
const sidebarEntries=computed(()=>schemaEntries(store.doc,['preview','diagrams'].includes(sidebarCategory.value)?'tables':sidebarCategory.value))
function selectSidebarEntry(entry){
  if(['tables','preview','diagrams'].includes(sidebarCategory.value)){store.selectedId=entry.tableId;collapseSelectedTable();if(sidebarCategory.value==='preview')previewScope.value='table';if(sidebarCategory.value==='diagrams')diagramScope.value='selected';return}
  if(sidebarCategory.value==='functions'){functionDialog.value?.open(entry.label);return}
  objectDialog.value?.open(sidebarCategory.value,entry)
}
function addSidebarItem(){
  if(sidebarCategory.value==='tables')store.addTable()
  else if(sidebarCategory.value==='functions')functionDialog.value?.create()
}
const previewScope=ref('all')
const diagramScope=ref('all')
function scrollPreviewToEnd(){
  if(previewScroll.value)previewScroll.value.scrollTop=previewScroll.value.scrollHeight
}
const previewEndLabel=computed(()=>previewScope.value==='table'?`Fim da prévia da tabela ${store.selected?.nome||''}`:`Fim da prévia do schema ${store.doc.schema||''} (${store.doc.tabelas.length} tabelas)`)
watch([previewScope,tab,sidebarCategory,()=>store.selectedId],async()=>{
  await nextTick()
  if(previewScroll.value)previewScroll.value.scrollTop=0
})
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
function collapseSelectedTable(){
  collapsed.value=new Set((store.selected?.colunas||[]).map(column=>column.uid))
}
// Ao abrir uma tabela, inclusive a primeira carregada ou uma tabela importada,
// todas as colunas começam recolhidas. Alterar outras propriedades não reinicia a expansão.
watch(()=>store.selected,collapseSelectedTable,{immediate:true})
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
function addDefaults(){const result=store.addDefaults('selected');collapseDefaults();toast(`Padrões aplicados: ${result.created} criadas, ${result.updated} atualizadas.`)}
async function addDefaultsAll(){
  if(!store.doc.tabelas.length)return
  if(!await askConfirmation({title:'Aplicar padrões em todas as tabelas?',message:'Isso cria ou atualiza id, criado_em e atualizado_em em todas as tabelas. Tipos, valores padrão, imutabilidade e regras dessas três colunas serão padronizados. Se outra coluna já for PK, a coluna id dessa tabela será mantida.',action:'Aplicar padrões'}))return
  const result=store.addDefaults('all')
  collapseDefaults()
  toast(`Padrões em ${result.tables} tabelas: ${result.created} criadas, ${result.updated} atualizadas, ${result.skipped} ignoradas.`)
}
function bulkApplied(result){collapseDefaults();toast(`${result.changed} coluna(s) alterada(s).`)}
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
const txt=computed(()=>formatText(store.exported))
const json=computed(()=>JSON.stringify(store.exported,null,2))
const previewData=computed(()=>{
  if(previewScope.value==='all')return store.exported
  const index=store.sortedTables.findIndex(t=>t.uid===store.selectedId)
  return tablePreview(store.exported,index)
})
const previewContent=computed(()=>tab.value==='txt'?(previewScope.value==='table'?formatTablePreviewText(previewData.value):formatText(previewData.value)):JSON.stringify(previewData.value,null,2))
const previewCopyLabel=computed(()=>previewScope.value==='all'?'Copiar tudo':'Copiar tabela atual')
function sqlImported(summary,mode){collapseDefaults();toast(mode==='merge'?`SQL mesclado: ${summary.addedTables} tabelas e ${summary.addedColumns} colunas adicionadas.`:`SQL importado: ${summary.tabelas} tabelas carregadas.`)}
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
function duplicateColumn(id){
  try{
    const copy=store.duplicateColumn(id)
    if(!copy)return
    const next=new Set(collapsed.value)
    next.delete(copy.uid)
    collapsed.value=next
    toast(`Coluna “${copy.nome}” duplicada. Revise o nome e as restrições.`)
  }catch(error){toast('Não foi possível duplicar: '+error.message)}
}
function toggleCard(id){const next=new Set(collapsed.value);next.has(id)?next.delete(id):next.add(id);collapsed.value=next}
function setType(c,v){c.tipo=v;if(!showSize(v)){c.tamanho='';c.escala=''}if(v!=='ENUM')c.enumValores=[];if(!fks.includes(v)){c.fk=false;c.fkTabela=''}}
const typeInfo=t=>TYPES.find(x=>x[0]===t)?.[1]||''
async function copyPreview(){if(store.nameError){toast(store.nameError);return}try{await navigator.clipboard.writeText(previewContent.value);toast(previewScope.value==='all'?'Projeto copiado.':'Tabela atual copiada.')}catch{toast('Não foi possível copiar.')}}
</script>

<template>
<div class="app" :style="{'--header-height':headerHeight+'px'}">
  <header ref="topbar" class="topbar">
    <div class="brand"><Database :size="23"/><div><strong>NexoDB Lab</strong><small>Projetos PostgreSQL e Supabase, sem alterar o banco</small></div></div>
    <div class="top-actions">
      <button class="btn ghost" @click="fileInput?.click()"><Upload :size="15"/> Importar JSON</button>
      <button class="btn ghost" @click="sqlDialog?.open()"><Upload :size="15"/> Importar SQL</button>
      <button class="btn ghost" @click="functionDialog?.open()"><Code2 :size="15"/> Funções SQL</button>
      <button class="btn ghost" :disabled="!store.doc.tabelas.length" @click="bulkDialog?.open()"><Copy :size="15"/> Edição em massa</button>
      <button class="btn" :disabled="!!store.nameError" @click="download('modelo-banco.json',json,'application/json')"><FileJson :size="15"/> JSON</button>
      <button class="btn primary" :disabled="!!store.nameError" @click="download('modelo-banco.txt',txt,'text/plain')"><Download :size="15"/> TXT</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importJson"/>
    </div>
  </header>
  <div class="workspace" :class="{leftclosed:!leftOpen}">
    <aside class="sidebar panel" :class="{collapsed:!leftOpen}">
      <button v-if="!leftOpen" class="dock-toggle" :title="leftOpen?'Recolher tabelas':'Expandir tabelas'" @click="leftOpen=!leftOpen"><PanelLeftClose v-if="leftOpen" :size="18"/><PanelLeftOpen v-else :size="18"/></button>
      <template v-if="leftOpen">
        <div class="sidehead">
          <SidebarCategoryMenu v-model="sidebarCategory" :categories="sidebarCategories"/>
          <div class="panel-actions">
            <button v-if="sidebarCategory==='tables'||sidebarCategory==='functions'" class="iconbtn" :title="sidebarCategory==='tables'?'Criar tabela':'Criar função SQL'" :aria-label="sidebarCategory==='tables'?'Criar tabela':'Criar função SQL'" @click="addSidebarItem"><Plus :size="18"/></button>
            <button class="iconbtn" title="Recolher barra lateral" aria-label="Recolher barra lateral" @click="leftOpen=false"><PanelLeftClose :size="18"/></button>
          </div>
        </div>
        <div class="schema-field">
          <div class="schema-field-heading">
            <label for="schema-name">Schema</label>
            <button type="button" class="schema-rules-trigger" title="Editar regras do schema" aria-label="Editar regras do schema" @click="schemaRulesDialog?.open()">
              <FilePenLine :size="14"/>
              <span>Regras</span>
              <span v-if="store.doc.regrasSchema?.trim()" class="schema-rules-dot" aria-label="Regras cadastradas"/>
            </button>
          </div>
          <input id="schema-name" v-model="store.doc.schema" placeholder="rpg"/>
        </div>
        <details v-if="store.doc.comentariosSql?.length" class="sql-schema-info">
          <summary>Comentários SQL ({{store.doc.comentariosSql.length}})</summary>
          <details v-for="(sql,i) in store.doc.comentariosSql" :key="'comment'+i"><summary>Comentário SQL {{i+1}}</summary><pre>{{sql}}</pre></details>
        </details>

        <div v-if="sidebarCategory==='diagrams'" class="sidebar-preview-scope" role="group" aria-label="Escopo do diagrama">
          <span class="sidebar-preview-caption">Visualizar</span>
          <button type="button" :class="{active:diagramScope==='all'}" :aria-pressed="diagramScope==='all'" @click="diagramScope='all'"><Network :size="15"/> Todas as tabelas</button>
          <button type="button" :class="{active:diagramScope==='selected'}" :aria-pressed="diagramScope==='selected'" :disabled="!store.selected" @click="diagramScope='selected'"><Database :size="15"/> Tabela e ligações</button>
          <span class="sidebar-preview-caption">Escolher tabela</span>
        </div>
        <div v-if="sidebarCategory==='preview'" class="sidebar-preview-scope" role="group" aria-label="Escopo da prévia">
          <span class="sidebar-preview-caption">Visualizar</span>
          <button type="button" :class="{active:previewScope==='all'}" :aria-pressed="previewScope==='all'" @click="previewScope='all'"><FileJson :size="15"/> Esquema completo</button>
          <button type="button" :class="{active:previewScope==='table'}" :aria-pressed="previewScope==='table'" :disabled="!store.selected" @click="previewScope='table'"><Database :size="15"/> Tabela selecionada</button>
          <span class="sidebar-preview-caption">Escolher tabela</span>
        </div>
        <nav :key="sidebarCategory" class="tablelist" :aria-label="sidebarCategory==='preview'?'Tabelas para prévia':sidebarCategory==='diagrams'?'Tabelas para diagrama':'Lista de '+sidebarCategories.find(c=>c.value===sidebarCategory)?.label">
          <button v-for="entry in sidebarEntries" :key="entry.key" class="tablebtn" :title="entry.tableName?entry.label+' · '+entry.tableName:entry.label"  :class="{active:(sidebarCategory==='tables'||(sidebarCategory==='preview'&&previewScope==='table')||(sidebarCategory==='diagrams'&&diagramScope==='selected'))&&store.selectedId===entry.tableId}" @click="selectSidebarEntry(entry)">
            <Database v-if="['tables','preview','diagrams'].includes(sidebarCategory)" :size="15"/>
            <List v-else-if="sidebarCategory==='enums'" :size="15"/>
            <Workflow v-else-if="sidebarCategory==='triggers'" :size="15"/>
            <Code2 v-else :size="15"/>
            <span>{{entry.label}}</span>
            <small v-if="['tables','enums','preview','diagrams'].includes(sidebarCategory)">{{entry.count}}</small>
            <small v-else-if="sidebarCategory==='triggers'" class="sidebar-table-tag">{{entry.tableName}}</small>
          </button>
          <p v-if="!sidebarEntries.length" class="sidebar-empty">Nenhum item nesta categoria.</p>
        </nav>
        <div v-if="sidebarCategory==='tables'" class="table-side-actions">
          <button class="btn primary full" @click="store.addTable()"><Plus :size="16"/> Nova tabela</button>
          <button class="btn full" :disabled="!store.doc.tabelas.length" @click="addDefaultsAll"><Plus :size="16"/> Padrões em todas as tabelas</button>
        </div>
        <div v-else-if="sidebarCategory==='functions'" class="table-side-actions">
          <button class="btn primary full" @click="functionDialog?.create()"><Plus :size="16"/> Nova função SQL</button>
        </div>
        <div v-else-if="sidebarCategory==='preview'||sidebarCategory==='diagrams'" class="table-side-actions">
          <button class="btn full" @click="sidebarCategory='tables'"><Database :size="16"/> Voltar às tabelas</button>
        </div>
      </template>
    </aside>
    <main class="editor panel" :class="{'preview-editor':sidebarCategory==='preview','diagram-editor':sidebarCategory==='diagrams'}">
      <p v-if="store.nameError" class="name-error" role="alert">{{store.nameError}} Corrija os nomes para exportar ou copiar o modelo.</p>
      <section v-if="sidebarCategory==='preview'" class="preview-page" aria-label="Prévia do modelo">
        <div class="sectionhead preview-page-heading">
          <div><h1>Prévia do modelo</h1><p>Consulte o esquema completo ou apenas uma tabela, em TXT ou JSON.</p></div>
          <button class="btn" type="button" @click="sidebarCategory='tables'"><Database :size="16"/> Editar tabelas</button>
        </div>
        <div class="preview-page-settings">
          <div class="preview-setting-group">
            <span>Conteúdo</span>
            <div class="tabs" role="group" aria-label="Conteúdo da prévia">
              <button type="button" :class="{active:previewScope==='all'}" :aria-pressed="previewScope==='all'" @click="previewScope='all'">Esquema completo</button>
              <button type="button" :class="{active:previewScope==='table'}" :aria-pressed="previewScope==='table'" :disabled="!store.selected" @click="previewScope='table'">Tabela{{store.selected?' · '+store.selected.nome:''}}</button>
            </div>
          </div>
          <div class="preview-setting-group preview-format-group">
            <span>Formato</span>
            <div class="tabs" role="group" aria-label="Formato da prévia">
              <button type="button" :class="{active:tab==='txt'}" :aria-pressed="tab==='txt'" @click="tab='txt'">TXT</button>
              <button type="button" :class="{active:tab==='json'}" :aria-pressed="tab==='json'" @click="tab='json'">JSON</button>
            </div>
          </div>
        </div>
        <div class="code-preview preview-page-code">
          <div class="code-toolbar">
            <span>{{tab.toUpperCase()}} · {{previewScope==='all'?'Esquema completo':store.selected?.nome||'Tabela'}}</span>
            <div class="preview-toolbar-actions">
              <button class="code-copy" type="button" title="Ir ao final da prévia" aria-label="Ir ao final da prévia" @click="scrollPreviewToEnd"><ArrowDownToLine :size="15"/> Fim</button>
              <button class="code-copy" type="button" :title="previewCopyLabel" :aria-label="previewCopyLabel" :disabled="!!store.nameError||(previewScope==='table'&&!store.selected)" @click="copyPreview"><Copy :size="15"/> Copiar</button>
            </div>
          </div>
          <div ref="previewScroll" class="preview-scroll" tabindex="0" aria-label="Conteúdo completo da prévia; use a rolagem para consultar o texto até o final">
            <pre><code>{{previewScope==='table'&&!store.selected?'Selecione ou crie uma tabela para visualizar.':previewContent}}</code></pre>
            <div class="preview-end-marker"><span aria-hidden="true">✓</span> {{previewEndLabel}}</div>
          </div>
        </div>
      </section>
      <DiagramViewer v-else-if="sidebarCategory==='diagrams'" :model="store.doc" :selected-id="store.selectedId" :scope="diagramScope"/>
      <template v-else-if="store.selected">
        <div class="sectionhead"><div><h1>Estrutura da tabela</h1><p>Defina colunas, chaves e comportamentos esperados.</p></div><button class="btn danger" @click="confirmDelete"><Trash2 :size="16"/> Excluir</button></div>
        <div class="formgrid">
          <label>Nome da tabela<NameInput :key="store.selected.uid" label="Nome da tabela" :model-value="store.selected.nome" :commit="name=>store.renameTable(store.selected,name)"/></label>
          <label>Comentário<textarea v-model="store.selected.comentario" rows="3" placeholder="Explique a finalidade desta tabela."/></label>
          <label>Regras da tabela<FunctionMentionTextarea v-model="store.selected.regras" :functions="store.doc.funcoesSql" :rows="3" @open-function="name=>functionDialog?.open(name)"/></label>
        </div>
        <details v-if="store.selected.sqlRestricoes?.length||store.selected.sqlTriggers?.length||store.selected.sqlIndices?.length||store.selected.sqlPoliticas?.length" class="sql-table-info">
          <summary>Definições SQL importadas ({{(store.selected.sqlRestricoes?.length||0)+(store.selected.sqlTriggers?.length||0)+(store.selected.sqlIndices?.length||0)+(store.selected.sqlPoliticas?.length||0)}})</summary>
          <div v-if="store.selected.sqlRestricoes?.length"><h3>Restrições (PK, FK, UNIQUE, CHECK)</h3><pre v-for="(item,i) in store.selected.sqlRestricoes" :key="'constraint'+i">{{item}}</pre></div>
          <div v-if="store.selected.sqlTriggers?.length"><h3>Triggers</h3><pre v-for="(item,i) in store.selected.sqlTriggers" :key="'trigger'+i">{{item}}</pre></div>
          <div v-if="store.selected.sqlIndices?.length"><h3>Índices</h3><pre v-for="(item,i) in store.selected.sqlIndices" :key="'index'+i">{{item}}</pre></div>
          <div v-if="store.selected.sqlPoliticas?.length"><h3>Políticas e RLS</h3><pre v-for="(item,i) in store.selected.sqlPoliticas" :key="'policy'+i">{{item}}</pre></div>
        </details>
        <div class="sectionhead columnsheading"><h2>Colunas <span class="subtle">({{store.selected.colunas.length}})</span></h2><div class="buttons"><button class="btn" :disabled="!store.columns.length" @click="toggleAllColumns"><ChevronDown v-if="allColumnsCollapsed" :size="15"/><ChevronUp v-else :size="15"/>{{allColumnsCollapsed?'Expandir todas':'Recolher todas'}}</button><button class="btn" @click="addDefaults"><Plus :size="15"/> ID e datas padrão</button><button class="btn primary" @click="store.addColumn()"><Plus :size="15"/> Coluna</button></div></div>
        <div v-if="!store.selected.colunas.length" class="empty">Nenhuma coluna cadastrada. Use <strong>ID e datas padrão</strong> ou adicione uma coluna.</div>
        <p id="reorder-help" class="sr-only">Arraste pela alça para reordenar, ou use as setas para cima e para baixo com a alça em foco. ID e datas permanecem fixos.</p>
        <article v-for="c in store.columns" :key="c.uid" class="columncard" :class="{dragging:dragged?.id===c.uid,'drop-before':dropTarget?.id===c.uid&&!dropTarget.after,'drop-after':dropTarget?.id===c.uid&&dropTarget.after}" @dragover="dragOver($event,c)" @drop="dropColumn($event,c)">
          <div class="columnhead"><button v-if="!isDefaultColumn(c)" class="drag-handle" draggable="true" :aria-label="`Reordenar coluna ${c.nome||'sem nome'}`" aria-describedby="reorder-help" title="Arrastar para reordenar · ↑ ↓ pelo teclado" @dragstart="startDrag($event,c)" @dragend="endDrag" @keydown="moveWithKeyboard($event,c)"><GripVertical :size="17"/></button><button class="cardtoggle" :aria-expanded="!collapsed.has(c.uid)" @click="toggleCard(c.uid)"><ChevronDown v-if="!collapsed.has(c.uid)" :size="16"/><ChevronUp v-else :size="16"/><strong>{{c.nome||'Nova coluna'}}</strong> <small>{{c.tipo}}</small><ColumnBadges :column="c" :table="store.selected"/></button><div class="column-actions"><button type="button" class="iconbtn duplicate" title="Duplicar coluna" :aria-label="`Duplicar coluna ${c.nome||'sem nome'}`" @click="duplicateColumn(c.uid)"><Copy :size="16"/></button><button type="button" class="iconbtn danger" title="Excluir coluna" :aria-label="`Excluir coluna ${c.nome||'sem nome'}`" @click="removeColumn(c.uid)"><Trash2 :size="16"/></button></div></div>
          <div v-if="!collapsed.has(c.uid)" class="columnbody">
            <div class="fields3" :class="{fields2:!showSize(c.tipo)}">
              <label>Nome<NameInput label="Nome" :model-value="c.nome" :commit="name=>store.renameColumn(c,name)"/></label>
              <label>Tipo de dado <button class="hint" type="button" :title="typeInfo(c.tipo)" @click="help(c.uid)"><Info :size="15"/></button>
                <select :value="c.tipo" @change="setType(c,$event.target.value)"><option v-for="[name] in TYPES" :key="name" :value="name">{{name}}</option></select>
              </label>
              <label v-if="showSize(c.tipo)">{{c.tipo==='NUMERIC'?'Precisão':'Comprimento máximo'}}<input v-model="c.tamanho" type="number" min="1"/></label>
            </div>
            <label v-if="c.tipo==='CUSTOM'">Tipo SQL original<input v-model="c.sqlTipoOriginal" placeholder="Ex.: rpg.meu_tipo"/></label>
            <label v-if="c.tipo==='ENUM'&&c.enumNome">Tipo ENUM PostgreSQL<input v-model="c.enumNome" placeholder="Ex.: rpg.fichas_tipo"/></label>
            <p v-if="helpType===c.uid" class="typehelp">{{c.tipo}}: {{typeInfo(c.tipo)}}</p>
            <div class="column-options" :class="{'has-scale':c.tipo==='NUMERIC','without-default':c.fk}">
              <div v-if="c.tipo==='NUMERIC'||!c.fk" class="fields2 defaultsrow">
                <label v-if="c.tipo==='NUMERIC'">Casas decimais<input v-model="c.escala" type="number" min="0"/></label>
                <label v-if="!c.fk">Valor padrão na criação<input v-model="c.padrao" placeholder="Sem padrão definido"/></label>
              </div>
              <div class="checkrow">
                <label v-if="c.pk||!store.primaryKeyColumns.length" class="check"><input :checked="c.pk" type="checkbox" @change="store.setPrimaryKey(c,$event.target.checked)"/> <KeyRound :size="14"/> PK</label>
                <label class="check"><input v-model="c.nullable" type="checkbox" :disabled="c.pk"/> Permite NULL</label>
                <HelpTooltip label="Imutável" text="Impede alterações após o primeiro preenchimento da coluna."><label class="check"><input v-model="c.imutavel" type="checkbox" :disabled="c.pk"/> Imutável</label></HelpTooltip>
                <HelpTooltip label="UNIQUE" text="Impede valores repetidos nesta coluna. Composto aplica a unicidade à combinação de colunas."><label class="check"><input :checked="store.isUniqueEnabled(c)" type="checkbox" :disabled="c.pk && store.primaryKeyColumns.length===1" @change="store.setUnique(c,$event.target.checked)"/> UNIQUE</label></HelpTooltip>
                <HelpTooltip v-if="store.isUniqueEnabled(c)&&(!c.pk||store.primaryKeyColumns.length!==1||store.isCompositeUnique(c))" label="Composto" text="Exige que a combinação das colunas selecionadas seja única. Os valores individuais podem se repetir quando não houver outra restrição de unicidade. Desmarcar UNIQUE ou Composto remove as combinações desta coluna."><label class="check"><input :checked="store.isCompositeUnique(c)" type="checkbox" :disabled="c.pk&&store.primaryKeyColumns.length===1" @change="store.setCompositeUnique(c,$event.target.checked)"/> Composto</label></HelpTooltip>
                <HelpTooltip label="CHECK" text="Valida uma condição em cada registro. Rejeita FALSE; TRUE e NULL satisfazem a condição. Não substitui NOT NULL."><label class="check"><input :checked="store.isCheckEnabled(c)" type="checkbox" @change="store.setCheck(c,$event.target.checked)"/> CHECK</label></HelpTooltip>
                <label class="check"><input :checked="c.fk" type="checkbox" @change="store.setForeignKey(c,$event.target.checked)"/> <KeyRound :size="14"/> FK</label>
              </div>
            </div>
            <div v-if="store.isCompositeUnique(c)||store.isCheckEnabled(c)" class="rule-actions">
              <button v-if="store.isCompositeUnique(c)" class="btn" @click="uniqueEditors.get(c.uid)?.add()"><Plus :size="14"/>UNIQUE Compose</button>
              <button v-if="store.isCheckEnabled(c)" class="btn" @click="checkEditors.get(c.uid)?.add()"><Plus :size="14"/>CHECK</button>
            </div>
            <p v-if="c.pk && store.primaryKeyColumns.length>1" class="typehelp">Estas colunas formam uma única PK composta: a combinação dos valores é única. Marque UNIQUE apenas se esta coluna também precisar ser única individualmente.</p>
            <div class="fields2" v-if="c.fk">
              <label>Tabela referenciada<TableCombobox :model-value="c.fkTabela" :options="store.doc.tabelas.map(t=>t.nome)" @update:model-value="store.setForeignTable(c,$event)"/></label>
              <label>Coluna referenciada<input v-model="c.fkColuna" placeholder="id"/></label>
            </div>
            <label v-if="c.tipo==='ENUM'">Valores do ENUM, separados por Enter ou vírgula<EnumValuesInput :key="c.uid" v-model="c.enumValores"/></label>
            <CompositeUniqueEditor v-if="store.isCompositeUnique(c)" :ref="instance=>registerEditor(uniqueEditors,c.uid,instance)" :table="store.selected" :column="c" :add="store.addCompositeUnique" :remove="store.removeCompositeUnique"/>
            <CheckEditor v-if="store.isCheckEnabled(c)" :ref="instance=>registerEditor(checkEditors,c.uid,instance)" :column="c" :columns="store.selected.colunas" :save="(id,expression,builder)=>store.saveCheck(c,id,expression,builder)" :remove="id=>store.removeCheck(c,id)"/>
            <label>Regra<FunctionMentionTextarea v-model="c.descricao" :functions="store.doc.funcoesSql" :rows="2" @open-function="name=>functionDialog?.open(name)"/></label>
            <label>Comentário<textarea v-model="c.comentario" rows="3" placeholder="Explique o significado desta coluna."/></label>
          </div>
        </article>
        <button class="btn primary" @click="store.addColumn()"><Plus :size="15"/> Adicionar coluna</button>
      </template>
      <div v-else class="welcome"><Database :size="42"/><h2>Comece com uma tabela</h2><p>Crie seu modelo e exporte uma proposta estruturada.</p><button class="btn primary" @click="store.addTable()"><Plus :size="15"/> Nova tabela</button></div>
    </main>
  </div>
  <SqlImportDialog ref="sqlDialog" @imported="sqlImported"/>
  <BulkEditDialog ref="bulkDialog" @applied="bulkApplied"/>
  <SqlFunctionManager ref="functionDialog"/>
  <SchemaObjectDialog ref="objectDialog" @select-table="sidebarCategory='tables'"/>
  <SchemaRulesDialog ref="schemaRulesDialog" @open-function="name=>functionDialog?.open(name)"/>
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
