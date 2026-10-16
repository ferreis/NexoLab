<script setup>
import { computed, ref, useId } from 'vue'
import { Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { formatCheckSQL } from '../checkConstraints.js'
import { makeCheckTree, normalizeCheckBuilder, compileCheckBuilder } from '../checkBuilder.js'
import { parseCheckSQL } from '../parseCheckSQL.js'
import CheckBuilder from './CheckBuilder.vue'
import HelpTooltip from './HelpTooltip.vue'

const props=defineProps({column:{type:Object,required:true},columns:{type:Array,required:true},save:{type:Function,required:true},remove:{type:Function,required:true}})
const open=ref(!props.column.checks.length), expression=ref(''), editingId=ref(null), error=ref(''), inputId=useId()
const expanded=ref(!props.column.checks.length)
const advanced=ref(true), builder=ref(makeCheckTree(props.column))
const preview=computed(()=>{try{return {sql:compileCheckBuilder(builder.value,props.columns),error:''}}catch(err){return {sql:'',error:err.message}}})
function edit(check){editingId.value=check?.uid||null;expression.value=check?.expressao||'';builder.value=check?.construtor?normalizeCheckBuilder(check.construtor):makeCheckTree(props.column);advanced.value=!check||!check.construtor;error.value='';open.value=true;expanded.value=true}
function convertSQL(){
  try{const converted=parseCheckSQL(expression.value,props.columns);builder.value=converted;advanced.value=false;error.value=''}
  catch(err){error.value=`Não foi possível converter: ${err.message} O SQL foi preservado no modo SQL.`}
}
function switchMode(value){if(!value&&advanced.value&&expression.value.trim()){convertSQL();return}if(value&&!advanced.value)expression.value=preview.value.sql;advanced.value=value;error.value=''}
function submit(){
  try{props.save(editingId.value,advanced.value?expression.value:preview.value.sql,advanced.value?null:builder.value);expression.value='';editingId.value=null;error.value='';open.value=false;expanded.value=false}
  catch(err){error.value=err.message}
}
function removeCheck(id){props.remove(id);if(editingId.value===id){open.value=false;editingId.value=null;expression.value=''}}
defineExpose({add:()=>edit()})
</script>

<template>
  <div class="check-editor">
    <HelpTooltip label="CHECK" text="CHECK é uma restrição do PostgreSQL: rejeita FALSE e aceita TRUE ou NULL. Para campos obrigatórios, mantenha NOT NULL. A expressão pode envolver várias colunas desta tabela."><button class="btn check-collapse" :aria-label="expanded?'Recolher CHECK':'Expandir CHECK'" :aria-expanded="expanded" :aria-controls="`${inputId}-content`" @click="expanded=!expanded"><ChevronUp v-if="expanded" :size="14"/><ChevronDown v-else :size="14"/>CHECK ({{column.checks.length}})</button></HelpTooltip>
    <div v-show="expanded" :id="`${inputId}-content`" class="check-content">
    <div v-for="(check,index) in column.checks" :key="check.uid" class="check-entry">
      <pre><code>{{formatCheckSQL(check.expressao)}}</code></pre>
      <div class="buttons">
        <button class="btn" :aria-label="`Editar CHECK ${index+1}`" @click="edit(check)"><Pencil :size="14"/>Editar</button>
        <button class="btn danger" :aria-label="`Excluir CHECK ${index+1}`" @click="removeCheck(check.uid)"><Trash2 :size="14"/>Excluir</button>
      </div>
    </div>
    <div v-if="open" :id="inputId" class="check-form">
      <div class="buttons check-toolbar" role="group" aria-label="Ações do CHECK">
        <HelpTooltip label="SQL" text="Informe somente a expressão, sem CHECK (...), para salvar. Converter para seleções também aceita CHECK (...), parênteses, AND/OR, comparações, booleanos e IS NULL/IS NOT NULL. Funções e outros recursos não suportados são preservados no modo SQL. Expressões livres precisam ser revisadas ao renomear ou excluir colunas."><button class="btn" :aria-pressed="advanced" @click="switchMode(true)">SQL</button></HelpTooltip>
        <button class="btn primary" :disabled="advanced?!expression.trim():!!preview.error" @click="submit">{{editingId?'Salvar CHECK':'Adicionar restrição'}}</button>
        <button class="btn" :aria-pressed="!advanced" @click="switchMode(false)">Montar</button>
        <button class="btn" @click="open=false;error=''">Cancelar</button>
      </div>
      <template v-if="!advanced">
        <CheckBuilder v-model="builder" :column="column" :columns="columns"/>
        <p v-if="preview.error" class="fieldhelp">{{preview.error}}</p>
        <details v-else><summary>Ver SQL gerado</summary><pre><code>{{formatCheckSQL(preview.sql)}}</code></pre></details>
      </template>
      <template v-else>
        <label :for="`${inputId}-sql`">Expressão SQL do CHECK</label>
        <textarea :id="`${inputId}-sql`" v-model="expression" rows="4" placeholder="valor > 0 ou numero >= 1" :aria-invalid="!!error" :aria-describedby="error?`${inputId}-error`:undefined" @input="error=''"/>
        <button class="btn" :disabled="!expression.trim()" @click="convertSQL">Converter para seleções</button>
      </template>
      <p v-if="error" :id="`${inputId}-error`" class="name-error" role="alert">{{error}}</p>
    </div>
    </div>
  </div>
</template>

<style scoped>
.check-editor, .check-content, .check-form, .check-entry { display: grid; gap: 10px; min-width: 0; }
.check-editor > .btn { justify-self: start; }
.check-editor > .help-tooltip { justify-self: start; }
.check-entry { border-left: 2px solid #68548c; padding-left: 12px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; color: #d1c2ff; font-size: 12px; line-height: 1.6; }
.check-form textarea { margin-top: 0; }
summary { color: #b2bfd2; font-size: 12px; cursor: pointer; }
details pre { margin-top: 10px; }
</style>
