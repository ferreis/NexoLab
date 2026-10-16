<script setup>
import { ref, useId } from 'vue'
import { Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { formatCheckSQL } from '../checkConstraints.js'

const props=defineProps({column:{type:Object,required:true},save:{type:Function,required:true},remove:{type:Function,required:true}})
const open=ref(!props.column.checks.length), expression=ref(''), editingId=ref(null), error=ref(''), inputId=useId()
function edit(check){editingId.value=check?.uid||null;expression.value=check?.expressao||'';error.value='';open.value=true}
function submit(){
  try{props.save(editingId.value,expression.value);expression.value='';editingId.value=null;error.value='';open.value=false}
  catch(err){error.value=err.message}
}
function removeCheck(id){props.remove(id);if(editingId.value===id){open.value=false;editingId.value=null;expression.value=''}}
</script>

<template>
  <div class="check-editor">
    <p class="typehelp">CHECK é uma restrição do PostgreSQL: rejeita FALSE e aceita TRUE ou NULL. Para campos obrigatórios, mantenha NOT NULL. A expressão pode envolver várias colunas desta tabela.</p>
    <div v-for="(check,index) in column.checks" :key="check.uid" class="check-entry">
      <pre><code>{{formatCheckSQL(check.expressao)}}</code></pre>
      <div class="buttons">
        <button class="btn" :aria-label="`Editar CHECK ${index+1}`" @click="edit(check)"><Pencil :size="14"/>Editar</button>
        <button class="btn danger" :aria-label="`Excluir CHECK ${index+1}`" @click="removeCheck(check.uid)"><Trash2 :size="14"/>Excluir</button>
      </div>
    </div>
    <button class="btn" :aria-expanded="open" :aria-controls="inputId" @click="edit()"><Plus :size="14"/>Adicionar CHECK</button>
    <div v-if="open" class="check-form">
      <label :for="inputId">Expressão SQL do CHECK</label>
      <textarea :id="inputId" v-model="expression" rows="4" placeholder="valor > 0 ou numero >= 1" :aria-invalid="!!error" :aria-describedby="error?`${inputId}-error`:`${inputId}-help`" @input="error=''"/>
      <p :id="`${inputId}-help`" class="fieldhelp">Informe somente a expressão, sem CHECK (...). Pode usar AND, OR, IS NULL e IS NOT NULL. Ao renomear ou excluir colunas, revise os nomes usados nas expressões.</p>
      <p v-if="error" :id="`${inputId}-error`" class="name-error" role="alert">{{error}}</p>
      <div class="buttons"><button class="btn primary" :disabled="!expression.trim()" @click="submit">{{editingId?'Salvar CHECK':'Adicionar restrição'}}</button><button class="btn" @click="open=false;error=''">Cancelar</button></div>
    </div>
  </div>
</template>

<style scoped>
.check-editor, .check-form, .check-entry { display: grid; gap: 10px; min-width: 0; }
.check-editor > .btn { justify-self: start; }
.check-entry { border-left: 2px solid #68548c; padding-left: 12px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; color: #d1c2ff; font-size: 12px; line-height: 1.6; }
.check-form textarea { margin-top: 0; }
</style>
