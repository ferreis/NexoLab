<script setup>
import { computed, ref, useId } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'

const props=defineProps({table:{type:Object,required:true},column:{type:Object,required:true},add:{type:Function,required:true},remove:{type:Function,required:true}})
const open=ref(false), chosen=ref([]), error=ref(''), editorId=useId()
const others=computed(()=>props.table.colunas.filter(c=>c.uid!==props.column.uid&&c.nome.trim()))
const groups=computed(()=>props.table.uniqueCompostos.filter(group=>group.colunas.includes(props.column.uid)))
const groupColumns=group=>group.colunas.map(id=>props.table.colunas.find(c=>c.uid===id))
function save(){
  try{props.add([props.column.uid,...chosen.value]);chosen.value=[];error.value='';open.value=false}
  catch(err){error.value=err.message}
}
</script>

<template>
  <div class="composite-unique">
    <button class="btn" :aria-expanded="open" :aria-controls="editorId" @click="open=!open"><Plus :size="14"/> Adicionar composição única</button>
    <p v-if="!groups.length" class="typehelp">Adicione uma combinação para definir a unicidade composta. A coluna não terá UNIQUE individual neste modo.</p>
    <p v-if="groups.length" class="typehelp">Desmarcar UNIQUE ou Composto remove as combinações desta coluna. Sem o modo composto, UNIQUE vale para a coluna individualmente.</p>
    <div v-for="group in groups" :key="group.uid" class="unique-group">
      <span>UNIQUE ({{groupColumns(group).map(c=>c.nome).join(', ')}})</span>
      <button class="iconbtn danger" :aria-label="`Remover UNIQUE composto (${groupColumns(group).map(c=>c.nome).join(', ')})`" @click="remove(group.uid)"><Trash2 :size="14"/></button>
      <p v-if="groupColumns(group).some(c=>c.unique||(c.pk&&table.colunas.filter(c=>c.pk).length===1))" class="typehelp">Uma destas colunas também tem unicidade individual. Para permitir repetições fora da combinação, revise o UNIQUE individual ou a PK.</p>
      <p v-if="groupColumns(group).some(c=>c.nullable)" class="typehelp">Com Permite NULL, o PostgreSQL permite repetir combinações que contenham NULL. Para exigir todos os valores, desmarque Permite NULL nas colunas da combinação.</p>
    </div>
    <div v-if="open" :id="editorId" class="unique-picker">
      <p class="typehelp">Combine <strong>{{column.nome||'esta coluna'}}</strong> com outras colunas. Só a combinação inteira precisa ser única. Ex.: (financeiro_id, numero).</p>
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
