<script setup>
import { ref, watch, useId } from 'vue'

const props=defineProps({modelValue:{type:String,default:''},commit:{type:Function,required:true},placeholder:String,label:{type:String,required:true}})
const draft=ref(props.modelValue), error=ref(''), errorId=useId()
watch(()=>props.modelValue,value=>{draft.value=value;error.value=''})
function save(){
  try{props.commit(draft.value);draft.value=props.modelValue;error.value=''}
  catch(err){draft.value=props.modelValue;error.value=err.message}
}
</script>

<template>
  <input v-model="draft" :placeholder="placeholder" :aria-label="label" :aria-invalid="!!error" :aria-describedby="error?errorId:undefined" @input="error=''" @change="save" @keydown.enter.prevent="$event.target.blur()"/>
  <span v-if="error" :id="errorId" class="name-error" role="alert">{{error}}</span>
</template>
