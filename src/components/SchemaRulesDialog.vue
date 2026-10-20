<script setup>
import { computed, nextTick, ref } from 'vue'
import { FilePenLine, Save, X } from 'lucide-vue-next'
import { useModelStore } from '../stores/modelador.js'
import FunctionMentionTextarea from './FunctionMentionTextarea.vue'

const store=useModelStore()
const modal=ref(null)
const draft=ref('')
const changed=computed(()=>draft.value!==String(store.doc.regrasSchema||''))
function open(){
  draft.value=String(store.doc.regrasSchema||'')
  if(!modal.value?.open)modal.value?.showModal()
}
function close(){modal.value?.close()}
function save(){
  store.doc.regrasSchema=draft.value
  close()
}
function openFunction(name){
  // Encaminha a navegação para o catálogo sem salvar o texto em edição.
  emit('open-function',name)
}
const emit=defineEmits(['open-function'])
defineExpose({open})
</script>

<template>
  <dialog ref="modal" class="schema-rules-dialog" aria-labelledby="schema-rules-title">
    <header class="schema-rules-header">
      <div>
        <h2 id="schema-rules-title"><FilePenLine :size="19"/> Regras do schema</h2>
        <p>Descreva as regras gerais de {{store.doc.schema||'seu schema'}} e cite funções SQL digitando #.</p>
      </div>
      <button type="button" class="iconbtn" title="Fechar sem salvar" aria-label="Fechar sem salvar" @click="close"><X :size="18"/></button>
    </header>
    <section class="schema-rules-body">
      <FunctionMentionTextarea v-model="draft" :functions="store.doc.funcoesSql" :rows="10"
        placeholder="Escreva as regras do schema. Use # para referenciar uma função."
        @open-function="openFunction"/>
      <footer class="schema-rules-footer">
        <button class="btn" type="button" @click="close">Cancelar</button>
        <button class="btn primary" type="button" :disabled="!changed" @click="save"><Save :size="15"/> Salvar regras</button>
      </footer>
    </section>
  </dialog>
</template>
