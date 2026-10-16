<script setup>
import { computed } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import { CHECK_OPERATORS, isNumericColumn, makeCondition, makeCheckTree, isCheckGroup } from '../checkBuilder.js'

const props=defineProps({modelValue:{type:Object,required:true},columns:{type:Array,required:true},column:{type:Object,required:true},path:{type:String,default:'raiz'},removable:Boolean})
const emit=defineEmits(['update:modelValue','remove'])
const available=computed(()=>props.columns.filter(c=>c.nome.trim()))
const findColumn=name=>props.columns.find(c=>c.nome===name)
function update(change){const next=JSON.parse(JSON.stringify(props.modelValue));change(next);emit('update:modelValue',next)}
function setOperator(index,value){update(b=>{const condition=b.itens[index];if(!condition.origem)Object.assign(condition,{...makeCondition(findColumn(condition.coluna)),...condition,operador:value});else condition.operador=value})}
</script>

<template>
  <fieldset class="check-builder condition-group">
    <legend>{{path==='raiz'?'Grupo principal':`Grupo ${path}`}}</legend>
    <div class="group-heading">
      <label>Combinar com<select :value="modelValue.operador" @change="update(b=>b.operador=$event.target.value)"><option value="AND">E — todas as condições</option><option value="OR">OU — qualquer condição</option></select></label>
      <button v-if="removable" class="iconbtn danger" :aria-label="`Excluir grupo ${path}`" @click="emit('remove')"><Trash2 :size="14"/></button>
    </div>
    <template v-for="(condition,ci) in modelValue.itens" :key="ci">
      <CheckBuilder v-if="isCheckGroup(condition)" :model-value="condition" :columns="columns" :column="column" :path="path==='raiz'?String(ci+1):`${path}.${ci+1}`" removable @update:model-value="update(b=>b.itens[ci]=$event)" @remove="update(b=>b.itens.splice(ci,1))"/>
      <div v-else class="condition-row">
        <div class="condition-fields">
        <label>Coluna<select :value="condition.coluna" @change="update(b=>b.itens[ci]=makeCondition(findColumn($event.target.value)))"><option value="" disabled>Selecione</option><option v-for="c in available" :key="c.uid" :value="c.nome">{{c.nome}}</option></select></label>
        <label>Condição<select :value="condition.operador" @change="setOperator(ci,$event.target.value)"><option v-for="[value,label] in CHECK_OPERATORS" :key="value" :value="value">{{label}}</option></select></label>
        <template v-if="!['IS NULL','IS NOT NULL'].includes(condition.operador)">
          <label>Comparar com<select :value="condition.origem" @change="update(b=>{b.itens[ci].origem=$event.target.value;b.itens[ci].valor=$event.target.value==='coluna'?(available.find(c=>c.nome!==condition.coluna)?.nome||condition.coluna):makeCondition(findColumn(condition.coluna)).valor})"><option value="valor">Um valor</option><option value="coluna">Outra coluna</option></select></label>
          <label v-if="condition.origem==='coluna'">Outra coluna<select :value="condition.valor" @change="update(b=>b.itens[ci].valor=$event.target.value)"><option v-for="c in available" :key="c.uid" :value="c.nome">{{c.nome}}</option></select></label>
          <label v-else-if="(condition.tipoValor==='boolean'||(!condition.tipoValor&&findColumn(condition.coluna)?.tipo==='BOOLEAN'))">Valor<select :value="condition.valor" @change="update(b=>b.itens[ci].valor=$event.target.value)"><option value="true">Verdadeiro</option><option value="false">Falso</option></select></label>
          <label v-else-if="findColumn(condition.coluna)?.tipo==='ENUM'&&findColumn(condition.coluna).enumValores.length">Valor<select :value="condition.valor" @change="update(b=>b.itens[ci].valor=$event.target.value)"><option value="">Selecione</option><option v-for="value in findColumn(condition.coluna).enumValores" :key="value" :value="value">{{value}}</option></select></label>
          <label v-else>Valor<input :type="(condition.tipoValor==='numero'||(!condition.tipoValor&&isNumericColumn(findColumn(condition.coluna))))?'number':'text'" step="any" :value="condition.valor" @input="update(b=>b.itens[ci].valor=$event.target.value)"/></label>
        </template>
        </div>
        <button v-if="modelValue.itens.length>1" class="iconbtn danger" :aria-label="`Excluir condição ${ci+1} do grupo ${path}`" @click="update(b=>b.itens.splice(ci,1))"><Trash2 :size="14"/></button>
      </div>
    </template>
    <div class="buttons"><button class="btn" @click="update(b=>b.itens.push(makeCondition(column)))"><Plus :size="14"/>Adicionar condição</button><button class="btn" @click="update(b=>b.itens.push(makeCheckTree(column)))"><Plus :size="14"/>Adicionar subgrupo</button></div>
  </fieldset>
</template>

<style scoped>
.check-builder { display: grid; gap: 12px; min-width: 0; }
.check-builder > .btn { justify-self: start; }
.condition-group { display: grid; gap: 12px; min-width: 0; border: 0; border-left: 2px solid #68548c; padding: 0 0 0 12px; margin: 0; }
legend { font-size: 12px; color: #b2bfd2; padding: 0 0 8px; }
.condition-row { display: grid; grid-template-columns: minmax(0,1fr) 32px; gap: 10px; min-width: 0; align-items: end; }
.condition-fields { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(150px,100%),1fr)); gap: 10px; min-width: 0; align-items: end; }
.condition-row .iconbtn { justify-self: end; }
.group-heading { display: flex; gap: 10px; align-items: end; }
.group-heading label { flex: 1; }
.condition-group > .btn { justify-self: start; }
.condition-group .condition-group { padding-left: 8px; }
.condition-group > .buttons { min-width: 0; }
.condition-group > .buttons .btn { min-width: 0; white-space: normal; }
</style>
