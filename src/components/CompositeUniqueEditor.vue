<script setup>
import { computed, ref, useId } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import HelpTooltip from './HelpTooltip.vue'

const props=defineProps({table:{type:Object,required:true},column:{type:Object,required:true},add:{type:Function,required:true},remove:{type:Function,required:true}})
const open=ref(false), chosen=ref([]), error=ref(''), editorId=useId()
const others=computed(()=>props.table.colunas.filter(c=>c.uid!==props.column.uid&&c.nome.trim()))
const groups=computed(()=>props.table.uniqueCompostos.filter(group=>group.colunas.includes(props.column.uid)))
const groupColumns=group=>group.colunas.map(id=>props.table.colunas.find(c=>c.uid===id))
function groupHelp(group){
  const columns=groupColumns(group)
  return ['A combinação destas colunas deve ser única.',columns.some(c=>c.unique||(c.pk&&props.table.colunas.filter(c=>c.pk).length===1))?'Uma das colunas também possui unicidade individual.':'',columns.some(c=>c.nullable)?'Combinações que contenham NULL podem se repetir.':''].filter(Boolean).join(' ')
}
function save(){
  try{props.add([props.column.uid,...chosen.value]);chosen.value=[];error.value='';open.value=false}
  catch(err){error.value=err.message}
}
defineExpose({add:()=>{open.value=true;error.value=''}})
</script>

<template>
  <div v-if="groups.length||open" class="composite-unique">
    <div v-for="group in groups" :key="group.uid" class="unique-group">
      <HelpTooltip label="Composição única" :text="groupHelp(group)"><span>UNIQUE ({{groupColumns(group).map(c=>c.nome).join(', ')}})</span></HelpTooltip>
      <button class="iconbtn danger" :aria-label="`Remover UNIQUE composto (${groupColumns(group).map(c=>c.nome).join(', ')})`" @click="remove(group.uid)"><Trash2 :size="14"/></button>
    </div>
    <div v-if="open" :id="editorId" class="unique-picker">
      <fieldset>
        <legend>Colunas da combinação</legend>
        <label v-for="other in others" :key="other.uid" class="check"><input v-model="chosen" type="checkbox" :value="other.uid"/>{{other.nome}}</label>
      </fieldset>
      <p v-if="!others.length" class="typehelp">Adicione e nomeie outra coluna para formar a combinação.</p>
      <p v-if="!column.nome.trim()" class="typehelp">Dê um nome a esta coluna antes de criar a combinação.</p>
      <p v-if="error" class="name-error" role="alert">{{error}}</p>
      <div class="buttons"><button class="btn primary" :disabled="!chosen.length||!column.nome.trim()" @click="save">Adicionar combinação</button><button class="btn" @click="open=false;error=''">Cancelar</button></div>
    </div>
  </div>
</template>

<style scoped>
.composite-unique { display: grid; gap: 10px; justify-items: start; }
.unique-group { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%; min-width: 0; }
.unique-group > span { color: #d1c2ff; font-size: 12px; overflow-wrap: anywhere; }
.unique-group p { flex-basis: 100%; margin: 0; }
.unique-picker { width: 100%; min-width: 0; border-left: 2px solid #68548c; padding-left: 12px; }
fieldset { display: flex; flex-wrap: wrap; gap: 10px; border: 0; padding: 0; margin: 12px 0; min-width: 0; }
legend { font-size: 12px; color: #b2bfd2; margin-bottom: 10px; }
</style>
