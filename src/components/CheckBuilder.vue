<script setup>
import { computed } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import { CHECK_OPERATORS, isNumericColumn, makeCondition } from '../checkBuilder.js'

const props=defineProps({modelValue:{type:Object,required:true},columns:{type:Array,required:true},column:{type:Object,required:true}})
const emit=defineEmits(['update:modelValue'])
const available=computed(()=>props.columns.filter(c=>c.nome.trim()))
const findColumn=name=>props.columns.find(c=>c.nome===name)
function update(change){const next=JSON.parse(JSON.stringify(props.modelValue));change(next);emit('update:modelValue',next)}
</script>

<template>
  <div class="check-builder">
    <label v-if="modelValue.grupos.length>1">Combinar grupos com
      <select :value="modelValue.operador" @change="update(b=>b.operador=$event.target.value)"><option value="AND">E — todos os grupos</option><option value="OR">OU — qualquer grupo</option></select>
    </label>
    <fieldset v-for="(group,gi) in modelValue.grupos" :key="gi" class="condition-group">
      <legend>Grupo {{gi+1}}</legend>
      <div class="group-heading">
        <label v-if="group.condicoes.length>1">Combinar condições com<select :value="group.operador" @change="update(b=>b.grupos[gi].operador=$event.target.value)"><option value="AND">E — todas as condições</option><option value="OR">OU — qualquer condição</option></select></label>
        <button v-if="modelValue.grupos.length>1" class="iconbtn danger" :aria-label="`Excluir grupo ${gi+1}`" @click="update(b=>b.grupos.splice(gi,1))"><Trash2 :size="14"/></button>
      </div>
      <div v-for="(condition,ci) in group.condicoes" :key="ci" class="condition-row">
        <div class="condition-fields">
        <label>Coluna<select :value="condition.coluna" @change="update(b=>b.grupos[gi].condicoes[ci]=makeCondition(findColumn($event.target.value)))"><option value="" disabled>Selecione</option><option v-for="c in available" :key="c.uid" :value="c.nome">{{c.nome}}</option></select></label>
        <label>Condição<select :value="condition.operador" @change="update(b=>b.grupos[gi].condicoes[ci].operador=$event.target.value)"><option v-for="[value,label] in CHECK_OPERATORS" :key="value" :value="value">{{label}}</option></select></label>
        <template v-if="!['IS NULL','IS NOT NULL'].includes(condition.operador)">
          <label>Comparar com<select :value="condition.origem" @change="update(b=>{b.grupos[gi].condicoes[ci].origem=$event.target.value;b.grupos[gi].condicoes[ci].valor=$event.target.value==='coluna'?(available.find(c=>c.nome!==condition.coluna)?.nome||condition.coluna):makeCondition(findColumn(condition.coluna)).valor})"><option value="valor">Um valor</option><option value="coluna">Outra coluna</option></select></label>
          <label v-if="condition.origem==='coluna'">Outra coluna<select :value="condition.valor" @change="update(b=>b.grupos[gi].condicoes[ci].valor=$event.target.value)"><option v-for="c in available" :key="c.uid" :value="c.nome">{{c.nome}}</option></select></label>
          <label v-else-if="findColumn(condition.coluna)?.tipo==='BOOLEAN'">Valor<select :value="condition.valor" @change="update(b=>b.grupos[gi].condicoes[ci].valor=$event.target.value)"><option value="true">Verdadeiro</option><option value="false">Falso</option></select></label>
          <label v-else-if="findColumn(condition.coluna)?.tipo==='ENUM'&&findColumn(condition.coluna).enumValores.length">Valor<select :value="condition.valor" @change="update(b=>b.grupos[gi].condicoes[ci].valor=$event.target.value)"><option value="">Selecione</option><option v-for="value in findColumn(condition.coluna).enumValores" :key="value" :value="value">{{value}}</option></select></label>
          <label v-else>Valor<input :type="isNumericColumn(findColumn(condition.coluna))?'number':'text'" step="any" :value="condition.valor" @input="update(b=>b.grupos[gi].condicoes[ci].valor=$event.target.value)"/></label>
        </template>
        </div>
        <button v-if="group.condicoes.length>1" class="iconbtn danger" :aria-label="`Excluir condição ${ci+1} do grupo ${gi+1}`" @click="update(b=>b.grupos[gi].condicoes.splice(ci,1))"><Trash2 :size="14"/></button>
      </div>
      <button class="btn" @click="update(b=>b.grupos[gi].condicoes.push(makeCondition(column)))"><Plus :size="14"/>Adicionar condição</button>
    </fieldset>
    <button class="btn" @click="update(b=>b.grupos.push({operador:'AND',condicoes:[makeCondition(column)]}))"><Plus :size="14"/>Adicionar grupo</button>
  </div>
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
</style>
