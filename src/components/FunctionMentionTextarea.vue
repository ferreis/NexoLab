<script setup>
import { computed, nextTick, ref } from 'vue'
import { functionNames, referencesInText } from '../sqlFunctions.js'
const props=defineProps({modelValue:{type:String,default:''},functions:{type:Array,default:()=>[]},rows:{type:Number,default:2},placeholder:{type:String,default:'Escreva a regra ou digite # para referenciar uma função.'}})
const emit=defineEmits(['update:modelValue','open-function'])
const input=ref(null),query=ref(null),start=ref(-1),active=ref(0)
const choices=computed(()=>query.value===null?[]:functionNames(props.functions).filter(name=>name.toLowerCase().includes(query.value.toLowerCase())).slice(0,25))
const referenced=computed(()=>referencesInText(props.modelValue,props.functions))
function track(value,caret){
  const before=value.slice(0,caret)
  const match=/(?:^|[^\w#])#([A-Za-z_][\w$]*|)$/.exec(before)
  query.value=match?match[1]:null
  start.value=match?before.lastIndexOf('#'):-1
  active.value=0
}
function onInput(event){emit('update:modelValue',event.target.value);track(event.target.value,event.target.selectionStart)}
function onCaret(){if(input.value)track(input.value.value,input.value.selectionStart)}
async function choose(name){
  if(start.value<0||!input.value)return
  const el=input.value,caret=el.selectionStart
  const replacement='#'+name
  const value=el.value.slice(0,start.value)+replacement+el.value.slice(caret)
  const nextCaret=start.value+replacement.length
  emit('update:modelValue',value)
  query.value=null;start.value=-1
  await nextTick()
  el.focus();el.setSelectionRange(nextCaret,nextCaret)
}
function onKeydown(event){
  if(query.value===null||!choices.value.length)return
  if(event.key==='ArrowDown'){event.preventDefault();active.value=(active.value+1)%choices.value.length}
  else if(event.key==='ArrowUp'){event.preventDefault();active.value=(active.value+choices.value.length-1)%choices.value.length}
  else if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();choose(choices.value[active.value])}
  else if(event.key==='Escape'){event.preventDefault();query.value=null}
}
</script>

<template>
  <div class="function-mention">
    <textarea ref="input" :value="modelValue" :rows="rows" :placeholder="placeholder" aria-autocomplete="list" :aria-expanded="query!==null&&choices.length>0" @input="onInput" @click="onCaret" @keyup="onCaret" @keydown="onKeydown" @blur="query=null"/>
    <div v-if="query!==null&&choices.length" class="function-mention-options" role="listbox" aria-label="Funções SQL disponíveis">
      <button v-for="(name,i) in choices" :key="name" type="button" role="option" :aria-selected="i===active" :class="{active:i===active}" @mousedown.prevent="choose(name)"><span>#</span>{{name}}</button>
    </div>
    <div v-if="referenced.length" class="function-mention-references" aria-label="Funções referenciadas"><button v-for="name in referenced" :key="name" type="button" :title="`Abrir função ${name}`" @click="emit('open-function',name)">#{{name}} ↗</button></div>
    <small class="function-mention-hint">Digite # para citar uma função SQL. Texto sem # permanece uma regra comum.</small>
  </div>
</template>
