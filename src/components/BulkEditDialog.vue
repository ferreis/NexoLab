<script setup>
import { computed, ref } from 'vue'
import { Search, X, ListChecks } from 'lucide-vue-next'
import { useModelStore, TYPES } from '../stores/modelador.js'
import { bulkReplaceName } from '../modelRefactor.js'

const emit=defineEmits(['applied'])
const store=useModelStore()
const dialog=ref(null)
const query=ref('')
const selected=ref(new Set())
const mode=ref('rename')
const find=ref('')
const replacement=ref('')
const matchCase=ref(false)
const fieldValue=ref('')
const yesNo=ref('false')
const error=ref('')
const confirmed=ref(false)

const rows=computed(()=>store.sortedTables.flatMap(t=>t.colunas.map(c=>({
  uid:c.uid,table:t.nome,name:c.nome,type:c.tipo,fk:c.fk
}))))
const visible=computed(()=>{
  const needle=query.value.trim().toLocaleLowerCase('pt-BR')
  return rows.value.filter(item=>!needle||(item.name+' '+item.table).toLocaleLowerCase('pt-BR').includes(needle))
})
const checked=computed(()=>rows.value.filter(item=>selected.value.has(item.uid)))
const preview=computed(()=>{
  if(mode.value!=='rename'||!find.value)return []
  return checked.value.map(item=>{
    const after=bulkReplaceName(item.name,find.value,replacement.value,matchCase.value)
    return {...item,after}
  }).filter(item=>item.after!==item.name)
})
const selectedVisible=computed(()=>visible.value.length>0&&visible.value.every(item=>selected.value.has(item.uid)))
const totalChanges=computed(()=>mode.value==='rename'?preview.value.length:checked.value.length)
function open(){
  query.value='';selected.value=new Set();mode.value='rename';find.value='';replacement.value=''
  matchCase.value=false;fieldValue.value='';yesNo.value='false';error.value='';confirmed.value=false
  dialog.value?.showModal()
}
function toggle(id,checked){
  const next=new Set(selected.value)
  if(checked)next.add(id);else next.delete(id)
  selected.value=next;confirmed.value=false;error.value=''
}
function toggleVisible(){
  const next=new Set(selected.value)
  const shouldSelect=!selectedVisible.value
  for(const item of visible.value)if(shouldSelect)next.add(item.uid);else next.delete(item.uid)
  selected.value=next;confirmed.value=false;error.value=''
}
function apply(){
  error.value=''
  try{
    if(!confirmed.value)throw new Error('Confirme a prévia antes de alterar várias colunas.')
    if(!selected.value.size)throw new Error('Selecione pelo menos uma coluna.')
    let result
    const ids=[...selected.value]
    if(mode.value==='rename')result=store.bulkRenameColumns(ids,find.value,replacement.value,matchCase.value)
    else result=store.bulkSetColumns(ids,mode.value,mode.value==='nullable'||mode.value==='imutavel'?yesNo.value==='true':fieldValue.value)
    emit('applied',result)
    dialog.value.close()
  }catch(e){error.value=e.message}
}
defineExpose({open})
</script>

<template>
  <dialog ref="dialog" class="bulk-edit-dialog" aria-labelledby="bulk-title">
    <div class="bulk-edit-header">
      <div><h2 id="bulk-title"><ListChecks :size="21"/> Alterar colunas em massa</h2>
      <p>Pesquise por nome de tabela ou coluna, selecione os campos e confira a prévia. Nenhum comando SQL será executado no banco.</p></div>
      <button class="iconbtn" title="Fechar" aria-label="Fechar" @click="dialog.close()"><X :size="18"/></button>
    </div>
    <div class="bulk-edit-content">
      <label class="bulk-edit-search"><Search :size="17"/><input v-model="query" type="search" placeholder="Buscar coluna ou tabela (ex.: cena, id, financeiros)" aria-label="Buscar colunas"/></label>
      <div class="bulk-edit-selectline">
        <button class="btn" :disabled="!visible.length" @click="toggleVisible">{{selectedVisible?'Desmarcar resultados':'Selecionar resultados'}} ({{visible.length}})</button>
        <span>{{checked.length}} selecionada(s) · {{rows.length}} no projeto</span>
      </div>
      <div class="bulk-edit-list" role="group" aria-label="Colunas disponíveis">
        <label v-for="row in visible" :key="row.uid" class="bulk-edit-item">
          <input type="checkbox" :checked="selected.has(row.uid)" @change="toggle(row.uid,$event.target.checked)"/>
          <span class="bulk-edit-item-name">{{row.table}}.<strong>{{row.name}}</strong></span>
          <small>{{row.type}}{{row.fk?' · FK':''}}</small>
        </label>
        <p v-if="!visible.length" class="bulk-edit-noresults">Nenhuma coluna corresponde à busca.</p>
      </div>
      <fieldset class="bulk-edit-fields">
        <legend>Alteração a aplicar</legend>
        <label>Operação
          <select v-model="mode" @change="confirmed=false;error=''">
            <option value="rename">Substituir trecho nos nomes</option>
            <option value="tipo">Alterar tipo de dado</option>
            <option value="nullable">Permite NULL</option>
            <option value="imutavel">Imutável</option>
            <option value="padrao">Definir valor padrão</option>
          </select>
        </label>
        <template v-if="mode==='rename'">
          <div class="bulk-edit-dual">
            <label>Encontrar no nome<input v-model="find" placeholder="Ex.: cena" @input="confirmed=false;error=''"/></label>
            <label>Substituir por<input v-model="replacement" placeholder="Ex.: acao" @input="confirmed=false;error=''"/></label>
          </div>
          <label class="bulk-edit-tick"><input v-model="matchCase" type="checkbox" @change="confirmed=false"/> Diferenciar letras maiúsculas e minúsculas</label>
          <div class="bulk-edit-preview">
            <strong>Prévia: {{preview.length}} nome(s) alterado(s)</strong>
            <div v-for="row in preview.slice(0,120)" :key="row.uid">
              <span>{{row.table}}.{{row.name}}</span><span aria-hidden="true">→</span><strong>{{row.after}}</strong>
            </div>
            <small v-if="preview.length>120">Mais {{preview.length-120}} alterações não exibidas.</small>
            <p v-if="!preview.length">Selecione colunas e informe o texto a encontrar para visualizar as alterações.</p>
          </div>
        </template>
        <label v-else-if="mode==='tipo'">Novo tipo
          <select v-model="fieldValue" @change="confirmed=false"><option value="" disabled>Selecione o tipo</option><option v-for="[type] in TYPES" :key="type" :value="type">{{type}}</option></select>
        </label>
        <label v-else-if="mode==='padrao'">Novo valor padrão<input v-model="fieldValue" placeholder="Ex.: now(), 0, false" @input="confirmed=false"/></label>
        <label v-else>Aplicar valor
          <select v-model="yesNo" @change="confirmed=false"><option value="true">Sim</option><option value="false">Não</option></select>
        </label>
      </fieldset>
      <label class="bulk-edit-tick bulk-edit-confirm">
        <input v-model="confirmed" type="checkbox"/>
        Confirmo a alteração em {{totalChanges}} coluna(s) do projeto.
      </label>
      <p v-if="error" class="sql-import-error" role="alert">{{error}}</p>
    </div>
    <div class="bulk-edit-footer">
      <button class="btn" @click="dialog.close()">Cancelar</button>
      <button class="btn primary" :disabled="!confirmed||!totalChanges||(mode==='rename'&&!find)||(mode==='tipo'&&!fieldValue)" @click="apply">Aplicar alterações</button>
    </div>
  </dialog>
</template>
