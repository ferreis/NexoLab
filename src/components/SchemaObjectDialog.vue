<script setup>
import { computed, ref } from 'vue'
import { Code2, Copy, X } from 'lucide-vue-next'
import { useModelStore } from '../stores/modelador.js'
import { triggerName } from '../schemaNavigation.js'

const emit=defineEmits(['select-table'])
const store=useModelStore()
const modal=ref(null)
const selection=ref(null)
const kind=computed(()=>selection.value?.kind||'')
const item=computed(()=>{
  const s=selection.value
  if(!s)return null
  if(s.kind==='enums')return store.doc.enums?.[s.index]||null
  if(s.kind==='triggers')return store.doc.tabelas.find(t=>t.uid===s.tableId)?.sqlTriggers?.[s.index]||null
  return null
})
const enumValues=computed(()=>item.value&&kind.value==='enums'?(item.value.valores||[]):[])
const displayName=computed(()=>kind.value==='enums'?item.value?.nome:triggerName(item.value))
const rawSql=computed(()=>kind.value==='enums'?(item.value?.sql||''):item.value||'')
const table=computed(()=>store.doc.tabelas.find(t=>t.uid===selection.value?.tableId))
const copied=ref(false)
function open(kindValue,entry){
  selection.value={kind:kindValue,index:entry.index,tableId:entry.tableId}
  copied.value=false
  if(!modal.value?.open)modal.value?.showModal()
}
async function copy(){
  try{await navigator.clipboard.writeText(rawSql.value);copied.value=true}
  catch{copied.value=false}
}
function goToTable(){
  if(!table.value)return
  store.selectedId=table.value.uid
  emit('select-table')
  modal.value?.close()
}
defineExpose({open})
</script>

<template>
  <dialog ref="modal" class="schema-object-dialog" aria-labelledby="schema-object-title">
    <header class="schema-object-head">
      <div><h2 id="schema-object-title"><Code2 :size="19"/> {{kind==='enums'?'ENUM':'Trigger'}}: {{displayName}}</h2>
        <p v-if="kind==='enums'">Tipo PostgreSQL do schema {{item?.schema||store.doc.schema}}.</p>
        <p v-else>Trigger associada à tabela {{table?.nome||'não encontrada'}}.</p>
      </div>
      <button type="button" class="iconbtn" aria-label="Fechar" @click="modal.close()"><X :size="18"/></button>
    </header>
    <section class="schema-object-content">
      <template v-if="kind==='enums'">
        <h3>Valores ({{enumValues.length}})</h3>
        <div class="schema-enum-values"><span v-for="(value,i) in enumValues" :key="i">{{value}}</span></div>
        <p v-if="item?.comentario" class="schema-object-comment">{{item.comentario}}</p>
      </template>
      <h3>Definição SQL</h3>
      <pre><code>{{rawSql}}</code></pre>
      <p class="schema-object-help">Esta visualização preserva a definição SQL importada, sem executar alterações no banco.</p>
      <footer class="schema-object-actions">
        <button v-if="kind==='triggers'&&table" class="btn" type="button" @click="goToTable">Selecionar tabela {{table.nome}}</button>
        <span class="schema-object-spacer"/>
        <button class="btn" type="button" @click="copy"><Copy :size="14"/> {{copied?'Copiado':'Copiar SQL'}}</button>
        <button class="btn primary" type="button" @click="modal.close()">Fechar</button>
      </footer>
    </section>
  </dialog>
</template>
