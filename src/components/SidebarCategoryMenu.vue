<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Check, ChevronDown, Code2, Database, FileText, List, Workflow } from 'lucide-vue-next'

const props=defineProps({
  modelValue:{type:String,required:true},
  categories:{type:Array,required:true}
})
const emit=defineEmits(['update:modelValue'])
const root=ref(null)
const trigger=ref(null)
const menu=ref(null)
const open=ref(false)
const current=computed(()=>props.categories.find(category=>category.value===props.modelValue)||props.categories[0])
function close(restoreFocus=false){
  open.value=false
  if(restoreFocus)nextTick(()=>trigger.value?.focus())
}
async function show(focusLast=false){
  open.value=true
  await nextTick()
  const options=menu.value?.querySelectorAll('[role="option"]')
  const selected=focusLast?options?.[options.length-1]:Array.from(options||[]).find(option=>option.getAttribute('aria-selected')==='true')
  ;(selected||options?.[0])?.focus()
}
function toggle(){open.value?close(true):show()}
function select(value){emit('update:modelValue',value);close(true)}
function handleTriggerKeydown(event){
  if(['ArrowDown','ArrowUp'].includes(event.key)){
    event.preventDefault()
    show(event.key==='ArrowUp')
  }
}
function handleMenuKeydown(event){
  const options=Array.from(menu.value?.querySelectorAll('[role="option"]')||[])
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
function onOutsidePointer(event){if(open.value&&!root.value?.contains(event.target))close()}
onMounted(()=>document.addEventListener('pointerdown',onOutsidePointer))
onUnmounted(()=>document.removeEventListener('pointerdown',onOutsidePointer))
</script>

<template>
  <div ref="root" class="sidebar-category">
    <button ref="trigger" type="button" class="sidebar-category-trigger" aria-label="Selecionar categoria do menu lateral"
      aria-haspopup="listbox" :aria-expanded="open" aria-controls="sidebar-category-options"
      @click="toggle" @keydown="handleTriggerKeydown">
      <span class="sidebar-category-icon">
        <Database v-if="modelValue==='tables'" :size="16"/>
        <List v-else-if="modelValue==='enums'" :size="16"/>
        <Workflow v-else-if="modelValue==='triggers'" :size="16"/>
        <Code2 v-else-if="modelValue==='functions'" :size="16"/>
        <FileText v-else :size="16"/>
      </span>
      <span class="sidebar-category-name">{{current?.label||'Tabelas'}}</span>
      <span v-if="current?.count!=null" class="sidebar-category-count">{{current.count}}</span>
      <ChevronDown :size="15" class="sidebar-category-chevron" :class="{open}"/>
    </button>
    <div v-if="open" id="sidebar-category-options" ref="menu" class="sidebar-category-menu" role="listbox"
      aria-label="Categorias do menu lateral" @keydown="handleMenuKeydown">
      <button v-for="category in categories" :key="category.value" type="button" role="option"
        class="sidebar-category-option" :class="{active:category.value===modelValue}"
        :aria-selected="category.value===modelValue" :tabindex="category.value===modelValue?0:-1"
        @click="select(category.value)">
        <span class="sidebar-category-option-icon">
          <Database v-if="category.value==='tables'" :size="16"/>
          <List v-else-if="category.value==='enums'" :size="16"/>
          <Workflow v-else-if="category.value==='triggers'" :size="16"/>
          <Code2 v-else-if="category.value==='functions'" :size="16"/>
          <FileText v-else :size="16"/>
        </span>
        <span class="sidebar-category-option-label">{{category.label}}</span>
        <span v-if="category.count!=null" class="sidebar-category-option-count">{{category.count}}</span>
        <Check v-if="category.value===modelValue" :size="15" class="sidebar-category-check"/>
      </button>
    </div>
  </div>
</template>
