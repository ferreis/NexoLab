<script setup>
import { computed } from 'vue'

const props=defineProps({column:{type:Object,required:true},table:{type:Object,required:true}})
const groups=computed(()=>props.table.uniqueCompostos.filter(group=>group.colunas.includes(props.column.uid)))
const composite=computed(()=>props.column.uniqueComposto||groups.value.length>0)
const unique=computed(()=>props.column.unique||(props.column.pk&&props.table.colunas.filter(c=>c.pk).length===1))
const names=group=>group.colunas.map(id=>props.table.colunas.find(c=>c.uid===id)?.nome).join(', ')
const groupLabel=group=>`UNIQUE composto {${names(group)}}`
</script>

<template>
  <span v-if="column.pk" class="columnbadge">PK</span>
  <span v-if="column.fk" class="columnbadge">FK</span>
  <span v-if="!column.nullable" class="columnbadge">NOT NULL</span>
  <span v-if="column.imutavel" class="columnbadge">Imutável</span>
  <span v-if="column.checks.length" class="columnbadge">CHECK ({{column.checks.length}})</span>
  <span v-if="unique&&!composite" class="columnbadge">UNIQUE</span>
  <span v-for="group in groups" :key="group.uid" class="columnbadge">{{groupLabel(group)}}</span>
  <span v-if="composite&&!groups.length" class="columnbadge">UNIQUE composto (sem composição definida)</span>
</template>
