<script setup>
import { computed, nextTick, ref } from 'vue'
import { useModelStore, TYPES, isDefaultColumn } from './stores/modelador'
import { Database, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Trash2, Download, Upload, Info, ChevronDown, ChevronUp, KeyRound, Copy, FileJson } from 'lucide-vue-next'
const store=useModelStore()
const leftOpen=ref(true), rightOpen=ref(true), fileInput=ref(null)
const helpType=ref(''), tab=ref('txt'), notice=ref('')
const collapsed=ref(new Set())
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
function download(filename,text,type){const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),500)}
const txt=computed(()=>{
  const d=store.exported
  return [`Projeto: ${d.projeto}\nSchema: ${d.schema_alvo}\n`,...d.tabelas.map(t=>[
    `\nTABELA: ${t.nome}`,
    `Finalidade: ${t.finalidade||'Não definida'}`,
    `Regras: ${t.regras||'Nenhuma'}`,
    t.colunas.filter(c=>c.pk).length>1?`Chave primária composta (combinação única): ${t.colunas.filter(c=>c.pk).map(c=>c.nome||'sem_nome').join(', ')}`:'',
    ...t.colunas.map(c=>[
      `- ${c.nome||'sem_nome'}: ${c.tipo}${showSize(c.tipo)&&c.tamanho?'('+c.tamanho+(c.tipo==='NUMERIC'&&c.escala?','+c.escala:'')+')':''}`,
      c.pk?'PK':'',c.fk?`FK -> ${c.fkTabela}.${c.fkColuna||'id'}`:'',c.nullable?'NULL':'NOT NULL',
      c.unique?'UNIQUE':'',c.padrao?`DEFAULT ${c.padrao} (na criação)`:'',
      c.imutavel?'IMUTÁVEL após o primeiro preenchimento':'',
      c.tipo==='ENUM'?`ENUM [${c.enumValores.join(', ')}]`:'',
      c.descricao?`Regras e observações: ${c.descricao}`:''
    ].filter(Boolean).join(' | '))
  ].join('\n'))].join('\n')
})
const json=computed(()=>JSON.stringify(store.exported,null,2))
async function importJson(e){const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(store.doc.tabelas.length&&!await askConfirmation({title:'Substituir projeto?',message:'As tabelas do projeto atual serão substituídas pelo arquivo importado. Exporte o projeto antes se quiser guardar uma cópia.',action:'Substituir projeto'}))return;store.importData(data);collapseDefaults();toast('Projeto importado.')}catch(err){toast('Erro ao importar: '+err.message)}finally{e.target.value=''}}
async function confirmDelete(){
  const table=store.selected
  if(!table)return
  if(await askConfirmation({title:'Excluir tabela?',message:`A tabela “${table.nome||'Sem nome'}” e todas as suas colunas serão excluídas do projeto. Esta ação não pode ser desfeita.`,action:'Excluir tabela'})){
    if(store.selectedId===table.uid)store.removeTable()
  }
}
function help(t){helpType.value=helpType.value===t?'':t}
function toggleCard(id){const next=new Set(collapsed.value);next.has(id)?next.delete(id):next.add(id);collapsed.value=next}
function enumText(c){return c.enumValores.join('\n')}
function setEnum(c,str){c.enumValores=str.split(/[,\n]/).map(s=>s.trim()).filter(Boolean)}
function setType(c,v){c.tipo=v;if(!showSize(v)){c.tamanho='';c.escala=''}if(v!=='ENUM')c.enumValores=[];if(!fks.includes(v)){c.fk=false;c.fkTabela=''}}
const typeInfo=t=>TYPES.find(x=>x[0]===t)?.[1]||''
async function copyPreview(){try{await navigator.clipboard.writeText(tab.value==='txt'?txt.value:json.value);toast('Prévia copiada.')}catch{toast('Não foi possível copiar.')}}
</script>

<template>
<div class="app">
  <header class="topbar">
    <div class="brand"><Database :size="23"/><div><strong>ModeladorBanco</strong><small>Projetos PostgreSQL e Supabase, sem alterar o banco</small></div></div>
    <div class="top-actions">
      <button class="btn ghost" @click="fileInput?.click()"><Upload :size="15"/> Importar</button>
      <button class="btn" @click="download('modelo-banco.json',json,'application/json')"><FileJson :size="15"/> JSON</button>
      <button class="btn primary" @click="download('modelo-banco.txt',txt,'text/plain')"><Download :size="15"/> TXT</button>
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importJson"/>
    </div>
  </header>
  <div class="workspace" :class="{leftclosed:!leftOpen,rightclosed:!rightOpen}">
    <aside class="sidebar panel" :class="{collapsed:!leftOpen}">
      <button class="dock-toggle" :title="leftOpen?'Recolher tabelas':'Expandir tabelas'" @click="leftOpen=!leftOpen"><PanelLeftClose v-if="leftOpen" :size="18"/><PanelLeftOpen v-else :size="18"/></button>
      <template v-if="leftOpen">
        <div class="sidehead"><h2>Tabelas <span class="subtle">({{store.doc.tabelas.length}})</span></h2><button class="iconbtn" title="Criar tabela" @click="store.addTable()"><Plus :size="18"/></button></div>
        <label>Projeto<input v-model="store.doc.projeto" placeholder="Nome do projeto"/></label>
        <label>Schema<input v-model="store.doc.schema" placeholder="rpg"/></label>
        <nav class="tablelist">
          <button v-for="t in store.doc.tabelas" :key="t.uid" class="tablebtn" :class="{active:store.selectedId===t.uid}" @click="store.selectedId=t.uid">
            <Database :size="15"/><span>{{t.nome||'Sem nome'}}</span><small>{{t.colunas.length}}</small>
          </button>
        </nav>
        <button class="btn primary full" @click="store.addTable()"><Plus :size="16"/> Nova tabela</button>
      </template>
    </aside>
    <main class="editor panel">
      <template v-if="store.selected">
        <div class="sectionhead"><div><h1>Estrutura da tabela</h1><p>Defina colunas, chaves e comportamentos esperados.</p></div><button class="btn danger" @click="confirmDelete"><Trash2 :size="16"/> Excluir</button></div>
        <div class="formgrid">
          <label>Nome da tabela<input v-model="store.selected.nome" placeholder="ex.: financeiro"/></label>
          <label>Finalidade da tabela<input v-model="store.selected.finalidade" placeholder="O que esta tabela armazena?"/></label>
          <label class="table-rules">Regras e observações<textarea v-model="store.selected.regras" rows="3" placeholder="Regras, validações, triggers e funções. Ex.: ao registrar um movimento, atualizar o saldo."/></label>
        </div>
        <div class="sectionhead columnsheading"><h2>Colunas <span class="subtle">({{store.selected.colunas.length}})</span></h2><div class="buttons"><button class="btn" @click="addDefaults"><Plus :size="15"/> ID e datas padrão</button><button class="btn primary" @click="store.addColumn()"><Plus :size="15"/> Coluna</button></div></div>
        <div v-if="!store.selected.colunas.length" class="empty">Nenhuma coluna cadastrada. Use <strong>ID e datas padrão</strong> ou adicione uma coluna.</div>
        <article v-for="c in store.columns" :key="c.uid" class="columncard">
          <div class="columnhead"><button class="cardtoggle" :aria-expanded="!collapsed.has(c.uid)" @click="toggleCard(c.uid)"><ChevronDown v-if="!collapsed.has(c.uid)" :size="16"/><ChevronUp v-else :size="16"/><strong>{{c.nome||'Nova coluna'}}</strong> <small>{{c.tipo}}</small><span v-if="c.pk" class="columnbadge">PK</span><span v-if="c.imutavel" class="columnbadge">Imutável</span></button><button class="iconbtn danger" title="Excluir coluna" @click="store.removeColumn(c.uid)"><Trash2 :size="16"/></button></div>
          <div v-if="!collapsed.has(c.uid)" class="columnbody">
            <div class="fields3" :class="{fields2:!showSize(c.tipo)}">
              <label>Nome<input v-model="c.nome" placeholder="ex.: ficha_id"/></label>
              <label>Tipo de dado <button class="hint" type="button" :title="typeInfo(c.tipo)" @click="help(c.uid)"><Info :size="15"/></button>
                <select :value="c.tipo" @change="setType(c,$event.target.value)"><option v-for="[name] in TYPES" :key="name" :value="name">{{name}}</option></select>
              </label>
              <label v-if="showSize(c.tipo)">{{c.tipo==='NUMERIC'?'Precisão':'Comprimento máximo'}}<input v-model="c.tamanho" type="number" min="1" placeholder="ex.: 255"/></label>
            </div>
            <p v-if="helpType===c.uid" class="typehelp">{{c.tipo}}: {{typeInfo(c.tipo)}} <span v-if="c.tipo==='VARCHAR'">Ex.: VARCHAR(255).</span><span v-if="c.tipo==='NUMERIC'">Ex.: NUMERIC(10,2).</span></p>
            <div class="column-options" :class="{'has-scale':c.tipo==='NUMERIC'}">
              <div class="fields2 defaultsrow">
                <label v-if="c.tipo==='NUMERIC'">Casas decimais<input v-model="c.escala" type="number" min="0" placeholder="ex.: 2"/></label>
                <label>Valor padrão na criação<input v-model="c.padrao" placeholder="Sem padrão definido"/><span class="fieldhelp">Usado ao criar o registro quando o valor não é informado. Ex.: now(), 0, FALSE.</span></label>
              </div>
              <div class="checkrow">
                <label class="check"><input :checked="c.pk" type="checkbox" @change="store.setPrimaryKey(c,$event.target.checked)"/> <KeyRound :size="14"/> PK</label>
                <label class="check"><input v-model="c.nullable" type="checkbox" :disabled="c.pk"/> Permite NULL</label>
                <label class="check"><input v-model="c.imutavel" type="checkbox" :disabled="c.pk"/> Imutável</label>
                <label class="check"><input :checked="store.isUnique(c)" type="checkbox" :disabled="c.pk && store.primaryKeyColumns.length===1" @change="c.unique=$event.target.checked"/> UNIQUE</label>
                <label class="check"><input v-model="c.fk" type="checkbox" :disabled="!fks.includes(c.tipo)"/> <KeyRound :size="14"/> FK</label>
              </div>
            </div>
            <p v-if="c.pk && store.primaryKeyColumns.length>1" class="typehelp">Estas colunas formam uma única PK composta: a combinação dos valores é única. Marque UNIQUE apenas se esta coluna também precisar ser única individualmente.</p>
            <p v-if="c.imutavel" class="rulehelp"><Info :size="15"/><span>Após o primeiro preenchimento, esta coluna não deve aceitar alterações. Regra incluída na proposta; precisa ser implementada no banco ou na aplicação.</span></p>
            <div class="fields2" v-if="c.fk">
              <label>Tabela referenciada<input v-model="c.fkTabela" list="tableSuggestions" placeholder="ex.: ficha"/></label>
              <label>Coluna referenciada<input v-model="c.fkColuna" placeholder="id"/></label>
              <datalist id="tableSuggestions"><option v-for="t in store.doc.tabelas" :key="t.uid" :value="t.nome"/></datalist>
            </div>
            <label v-if="c.tipo==='ENUM'">Valores do ENUM, um por linha<textarea :value="enumText(c)" @input="setEnum(c,$event.target.value)" rows="3" placeholder="Principal&#10;Direto&#10;Indireto"/></label>
            <label>Regras da coluna e observações<textarea v-model="c.descricao" rows="2" placeholder="Explicação, limites CHECK ou regras..."/></label>
          </div>
        </article>
        <button class="btn primary" @click="store.addColumn()"><Plus :size="15"/> Adicionar coluna</button>
      </template>
      <div v-else class="welcome"><Database :size="42"/><h2>Comece com uma tabela</h2><p>Crie seu modelo e exporte uma proposta estruturada.</p><button class="btn primary" @click="store.addTable()"><Plus :size="15"/> Nova tabela</button></div>
    </main>
    <aside class="preview panel" :class="{collapsed:!rightOpen}">
      <button class="dock-toggle" :title="rightOpen?'Recolher prévia':'Expandir prévia'" @click="rightOpen=!rightOpen"><PanelRightClose v-if="rightOpen" :size="18"/><PanelRightOpen v-else :size="18"/></button>
      <template v-if="rightOpen">
        <div class="sidehead"><h2>Prévia</h2><button class="iconbtn" title="Copiar prévia" @click="copyPreview"><Copy :size="17"/></button></div>
        <div class="tabs"><button :class="{active:tab==='txt'}" @click="tab='txt'">TXT</button><button :class="{active:tab==='json'}" @click="tab='json'">JSON</button></div>
        <pre>{{tab==='txt'?txt:json}}</pre>
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
