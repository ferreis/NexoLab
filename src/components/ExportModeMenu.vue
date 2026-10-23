<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'

const props=defineProps({modelValue:{type:String,required:true}})
const emit=defineEmits(['update:modelValue'])
const choices=[
  {value:'complete',label:'Com CHECKs, funções e triggers'},
  {value:'structure',label:'Sem CHECKs, funções e triggers'}
]
const root=ref(null)
const trigger=ref(null)
const list=ref(null)
const open=ref(false)
const selected=computed(()=>choices.find(item=>item.value===props.modelValue)||choices[0])

function close(restoreFocus=false){
  open.value=false
  if(restoreFocus)nextTick(()=>trigger.value?.focus())
}
async function show(focus='selected'){
  open.value=true
  await nextTick()
  const options=Array.from(list.value?.querySelectorAll('[role="option"]')||[])
  const selectedIndex=options.findIndex(option=>option.getAttribute('aria-selected')==='true')
  const index=focus==='first'?0:focus==='last'?options.length-1:Math.max(0,selectedIndex)
  options[index]?.focus()
}
function toggle(){open.value?close(true):show()}
function choose(value){emit('update:modelValue',value);close(true)}
function onTriggerKeydown(event){
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault()
    show(event.key==='ArrowDown'?'first':'last')
  }
}
function onListKeydown(event){
  const options=Array.from(list.value?.querySelectorAll('[role="option"]')||[])
  const index=options.indexOf(document.activeElement)
  let next
  if(event.key==='ArrowDown')next=(index+1)%options.length
  else if(event.key==='ArrowUp')next=(index-1+options.length)%options.length
  else if(event.key==='Home')next=0
  else if(event.key==='End')next=options.length-1
  else if(event.key==='Escape'){event.preventDefault();close(true);return}
  else if(event.key==='Tab'){close();return}
  else return
  event.preventDefault()
  options[next]?.focus()
}
function onOutsidePointer(event){
  if(open.value&&!root.value?.contains(event.target))close()
}
onMounted(()=>document.addEventListener('pointerdown',onOutsidePointer))
onUnmounted(()=>document.removeEventListener('pointerdown',onOutsidePointer))
</script>

<template>
  <div ref="root" class="export-mode-select">
    <span class="export-mode-label">Exportar</span>
    <button ref="trigger" class="export-mode-trigger" type="button"
      aria-label="Conteúdo da exportação" aria-haspopup="listbox"
      :aria-expanded="open" :aria-controls="open?'export-mode-options':undefined"
      @click="toggle" @keydown="onTriggerKeydown">
      <span class="export-mode-current">{{selected.label}}</span>
      <ChevronDown class="export-mode-chevron" :class="{open}" :size="15"/>
    </button>
    <div v-if="open" id="export-mode-options" ref="list" class="export-mode-menu"
      role="listbox" aria-label="Opções de exportação" @keydown="onListKeydown">
      <button v-for="choice in choices" :key="choice.value" type="button"
        role="option" class="export-mode-option"
        :class="{active:choice.value===modelValue}"
        :aria-selected="choice.value===modelValue"
        :tabindex="choice.value===modelValue?0:-1"
        @click="choose(choice.value)">
        <span>{{choice.label}}</span>
        <Check v-if="choice.value===modelValue" :size="16" class="export-mode-check"/>
      </button>
    </div>
  </div>
</template>
