<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { Check, ChevronDown, Database } from 'lucide-vue-next'

const props=defineProps({modelValue:{type:String,default:''},options:{type:Array,default:()=>[]}})
const emit=defineEmits(['update:modelValue'])
const listId=useId()
const root=ref(null), input=ref(null), menu=ref(null)
const open=ref(false), query=ref(''), active=ref(-1), position=ref({})
const matches=computed(()=>[...new Set(props.options.filter(Boolean))].filter(name=>name.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())))
function placeMenu(){
  if(!open.value||!root.value)return
  const rect=root.value.getBoundingClientRect()
  const below=window.innerHeight-rect.bottom-12, above=rect.top-12
  const upward=below<220&&above>below
  const available=Math.max(60,upward?above:below)
  position.value={
    left:`${Math.max(8,Math.min(rect.left,window.innerWidth-rect.width-8))}px`,
    width:`${Math.min(rect.width,window.innerWidth-16)}px`,
    maxHeight:`${Math.min(310,available)}px`,
    ...(upward?{bottom:`${window.innerHeight-rect.top+6}px`}:{top:`${rect.bottom+6}px`})
  }
}
function show(){open.value=true;active.value=-1;placeMenu()}
function close(){open.value=false;active.value=-1}
function onFocus(){query.value='';show()}
function onInput(event){emit('update:modelValue',event.target.value);query.value=event.target.value;show()}
function choose(name){emit('update:modelValue',name);close();input.value.focus()}
function toggle(){
  const wasOpen=open.value
  input.value.focus()
  if(wasOpen)close()
  else{query.value='';show()}
}
async function onKey(event){
  if(event.key==='Escape'&&open.value){event.preventDefault();event.stopPropagation();close();return}
  if(event.key==='Tab'){close();return}
  if(event.key==='Enter'&&open.value&&active.value>=0){event.preventDefault();choose(matches.value[active.value]);return}
  if(!['ArrowDown','ArrowUp'].includes(event.key))return
  event.preventDefault()
  if(!open.value){query.value='';show()}
  if(!matches.value.length)return
  active.value=event.key==='ArrowDown'?(active.value+1)%matches.value.length:(active.value<=0?matches.value.length-1:active.value-1)
  await nextTick()
  document.getElementById(`${listId}-${active.value}`)?.scrollIntoView({block:'nearest'})
}
function onOutside(event){if(!root.value?.contains(event.target)&&!menu.value?.contains(event.target))close()}
onMounted(()=>{
  document.addEventListener('pointerdown',onOutside)
  window.addEventListener('resize',placeMenu)
  window.addEventListener('scroll',placeMenu,true)
})
onBeforeUnmount(()=>{
  document.removeEventListener('pointerdown',onOutside)
  window.removeEventListener('resize',placeMenu)
  window.removeEventListener('scroll',placeMenu,true)
})
</script>

<template>
  <div ref="root" class="table-combobox">
    <input ref="input" :value="modelValue" role="combobox" aria-autocomplete="list" :aria-expanded="open" :aria-controls="open?listId:undefined" :aria-activedescendant="open&&active>=0?`${listId}-${active}`:undefined" placeholder="Buscar ou digitar tabela" autocomplete="off" spellcheck="false" @input="onInput" @focus="onFocus" @click="!open && onFocus()" @blur="close" @keydown="onKey"/>
    <button type="button" class="combobox-toggle" tabindex="-1" aria-label="Mostrar tabelas" :aria-expanded="open" @mousedown.prevent @click="toggle"><ChevronDown :size="16" :class="{rotated:open}"/></button>
    <Teleport to="body">
      <div v-if="open" ref="menu" class="table-suggestions" :style="position">
        <div class="suggestions-heading">Tabelas do projeto <span>{{matches.length}}</span></div>
        <div :id="listId" role="listbox" aria-label="Tabelas do projeto" class="suggestions-list">
          <div v-for="(name,index) in matches" :id="`${listId}-${index}`" :key="name" role="option" :aria-selected="name===modelValue" class="table-suggestion" :class="{highlighted:index===active,selected:name===modelValue}" @pointermove="active=index" @mousedown.prevent @click="choose(name)">
            <Database :size="15"/><span>{{name}}</span><Check v-if="name===modelValue" :size="15" class="suggestion-check"/>
          </div>
        </div>
        <p v-if="!matches.length" class="suggestions-empty">Nenhuma tabela encontrada. Você pode manter o nome digitado.</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.table-combobox { position: relative; }
.table-combobox input { padding-right: 40px !important; }
.combobox-toggle { position: absolute; right: 4px; top: 4px; bottom: 4px; display: grid; place-items: center; width: 32px; padding: 0; background: transparent; color: var(--muted); border: 0; border-radius: 4px; }
.combobox-toggle:hover { background: #282540; color: var(--accent); }
.combobox-toggle svg { transition: transform .15s; }
.combobox-toggle .rotated { transform: rotate(180deg); }
.table-suggestions { position: fixed; z-index: 50; display: flex; flex-direction: column; overflow: hidden; background: #192232; border: 1px solid #4c416b; border-radius: 9px; padding: 5px; box-shadow: 0 12px 32px #0007; }
.suggestions-heading { display: flex; align-items: center; justify-content: space-between; padding: 8px 9px 10px; color: #9aaac1; font-size: 11px; font-weight: 500; border-bottom: 1px solid #303b50; margin-bottom: 4px; }
.suggestions-heading span { color: #c7b9ff; background: #302940; padding: 2px 6px; border-radius: 4px; }
.suggestions-list { overflow-y: auto; min-height: 0; scrollbar-width: thin; scrollbar-color: #53476d transparent; }
.table-suggestion { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 10px; border-radius: 5px; color: #d0dbee; font-size: 13px; cursor: pointer; }
.table-suggestion > svg { color: #9c8acb; flex-shrink: 0; }
.table-suggestion span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.table-suggestion.highlighted { background: #352b50; color: #f1eaff; }
.table-suggestion.selected { color: #d1c2ff; }
.table-suggestion .suggestion-check { color: #bdabff; }
.suggestions-empty { margin: 0; padding: 12px 10px; color: #9aaac1; font-size: 12px; line-height: 1.6; }
@media (prefers-reduced-motion: reduce) { .combobox-toggle svg { transition: none; } }
</style>
