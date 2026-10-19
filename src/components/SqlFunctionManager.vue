<script setup>
import { computed, ref } from 'vue'
import { Code2, Plus, Trash2, X, Save } from 'lucide-vue-next'
import { useModelStore } from '../stores/modelador.js'
import { parseFunction, functionTemplate } from '../sqlFunctions.js'

const store=useModelStore()
const modal=ref(null),query=ref(''),selectedIndex=ref(null),sql=ref(''),newName=ref('nova_funcao'),error=ref(''),notice=ref('')
const functions=computed(()=>(store.doc.funcoesSql||[]).map((source,index)=>({index,source,parsed:parseFunction(source)})))
const visible=computed(()=>functions.value.filter(item=>[item.parsed?.name,item.parsed?.qualified,item.source].join(' ').toLowerCase().includes(query.value.toLowerCase())))
const original=computed(()=>selectedIndex.value===null?null:functions.value[selectedIndex.value])
const dirty=computed(()=>original.value?sql.value.trim()!==original.value.source.trim():!!sql.value.trim())
function open(){
  query.value='';error.value='';notice.value=''
  if(functions.value.length)select(functions.value[0].index)
  else prepare()
  modal.value?.showModal()
}
function select(index){selectedIndex.value=index;sql.value=functions.value[index]?.source||'';error.value='';notice.value=''}
function prepare(){selectedIndex.value=null;error.value='';notice.value='';newName.value='nova_funcao';sql.value=''}
function generate(){
  try{sql.value=functionTemplate(store.doc.schema,newName.value.trim());error.value='';notice.value='Modelo SQL preparado. Revise e salve.'}
  catch(e){error.value=e.message}
}
function save(){
  try{
    const result=store.saveFunctionSql(sql.value,selectedIndex.value)
    selectedIndex.value=(store.doc.funcoesSql||[]).findIndex(item=>item.trim()===sql.value.trim())
    sql.value=store.doc.funcoesSql[selectedIndex.value]
    error.value='';notice.value='Função '+result.qualified+' salva no projeto.'
  }catch(e){error.value=e.message}
}
function remove(){
  if(selectedIndex.value===null)return
  try{store.removeFunctionSql(selectedIndex.value);notice.value='Função removida do projeto.';error.value='';const next=functions.value[0];selectedIndex.value=next?next.index:null;sql.value=next?.source||''}
  catch(e){error.value=e.message}
}
defineExpose({open})
</script>
<template>
  <dialog ref="modal" class="function-manager-dialog" aria-labelledby="function-manager-title">
    <header class="function-manager-head">
      <div><h2 id="function-manager-title"><Code2 :size="20"/> Funções SQL</h2><p>Crie e edite definições PostgreSQL sem executar SQL no banco. Use #nome nas regras para referenciá-las.</p></div>
      <button class="iconbtn" type="button" title="Fechar" aria-label="Fechar" @click="modal.close()"><X :size="18"/></button>
    </header>
    <div class="function-manager-body">
      <aside class="function-manager-list">
        <div class="function-manager-listhead"><strong>Funções ({{functions.length}})</strong><button class="btn" type="button" @click="prepare"><Plus :size="14"/> Nova</button></div>
        <input v-model="query" type="search" placeholder="Buscar funções..." aria-label="Buscar funções SQL"/>
        <div class="function-manager-items">
          <button v-for="item in visible" :key="item.index" :class="{active:selectedIndex===item.index}" :title="item.parsed?.qualified||'Função SQL'" @click="select(item.index)">
            {{item.parsed?.name||'Função '+(item.index+1)}}<small>{{item.parsed?.schema||store.doc.schema}}</small>
          </button>
          <p v-if="!visible.length" class="subtle">Nenhuma função encontrada.</p>
        </div>
      </aside>
      <section class="function-manager-editor">
        <div v-if="selectedIndex===null" class="function-manager-new">
          <label>Nome da nova função
            <input v-model="newName" placeholder="validar_atualizacao" @keydown.enter.prevent="generate"/>
          </label>
          <button class="btn" type="button" @click="generate">Preparar SQL</button>
        </div>
        <div v-else class="function-manager-selected"><strong>{{original?.parsed?.qualified||'Função importada'}}</strong><span>Edite o SQL diretamente. O nome é reconhecido pela declaração CREATE FUNCTION.</span></div>
        <label class="function-manager-code">Definição SQL
          <textarea v-model="sql" spellcheck="false" rows="17" placeholder="CREATE OR REPLACE FUNCTION ..."/>
        </label>
        <p v-if="error" class="function-manager-error" role="alert">{{error}}</p>
        <p v-if="notice" class="function-manager-notice" role="status">{{notice}}</p>
        <footer class="function-manager-actions">
          <button v-if="selectedIndex!==null" class="btn danger" type="button" @click="remove"><Trash2 :size="14"/> Excluir função</button>
          <span class="function-manager-spacer"/>
          <button class="btn" type="button" @click="modal.close()">Fechar</button>
          <button class="btn primary" type="button" :disabled="!dirty" @click="save"><Save :size="14"/> Salvar função</button>
        </footer>
      </section>
    </div>
  </dialog>
</template>
