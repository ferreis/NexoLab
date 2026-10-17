<script setup>
import { ref, watch } from 'vue'

const props=defineProps({modelValue:{type:Array,required:true}})
const emit=defineEmits(['update:modelValue'])
const text=ref(props.modelValue.join('\n'))
const values=value=>value.split(/[,\n]/).map(item=>item.trim()).filter(Boolean)
const normalize=value=>value.replaceAll(',', '\n')

// Preserva o texto em edição, inclusive a última linha vazia e a posição do cursor.
watch(()=>props.modelValue,value=>{
  if(JSON.stringify(value)!==JSON.stringify(values(text.value)))text.value=value.join('\n')
})
function input(event){
  if(event.isComposing)return
  const field=event.target
  const start=normalize(field.value.slice(0,field.selectionStart)).length
  const end=normalize(field.value.slice(0,field.selectionEnd)).length
  text.value=normalize(field.value)
  if(field.value!==text.value){field.value=text.value;field.setSelectionRange(start,end)}
  emit('update:modelValue',values(text.value))
}
</script>

<template>
  <textarea :value="text" rows="3" @input="input" @compositionend="input"/>
</template>
