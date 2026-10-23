<script setup>
import { computed, ref } from 'vue'
import { ArrowRightLeft, Copy, Search, X } from 'lucide-vue-next'
import { useModelStore } from '../stores/modelador.js'

const emit=defineEmits(['moved','copied'])
const store=useModelStore()
const dialog=ref(null)
const sourceId=ref('')
const targetId=ref('')
const query=ref('')
const selected=ref(new Set())
const confirmed=ref(false)
const error=ref('')
const mode=ref('move')
const copying=computed(()=>mode.value==='copy')

const source=computed(()=>store.doc.tabelas.find(t=>t.uid===sourceId.value))
const destinations=computed(()=>store.sortedTables.filter(t=>t.uid!==sourceId.value))
const visible=computed(()=>{
  const search=query.value.trim().toLocaleLowerCase('pt-BR')
  return (source.value?.colunas||[]).filter(c=>!search||[c.nome,c.tipo,c.descricao].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(search)))
})
const checked=computed(()=>(source.value?.colunas||[]).filter(c=>selected.value.has(c.uid)))
const allVisible=computed(()=>visible.value.length>0&&visible.value.every(c=>selected.value.has(c.uid)))
const destination=computed(()=>destinations.value.find(t=>t.uid===targetId.value))

function open(tableId,action='move',initialIds=[]){
  mode.value=action==='copy'?'copy':'move'
  sourceId.value=tableId
  targetId.value=destinations.value[0]?.uid||''
  query.value=''
  selected.value=new Set((source.value?.colunas||[]).filter(c=>initialIds.includes(c.uid)).map(c=>c.uid))
  confirmed.value=false
  error.value=''
  if(!source.value||!destinations.value.length)return
  dialog.value?.showModal()
}
function resetConfirmation(){confirmed.value=false;error.value=''}
function toggle(id,on){
  const next=new Set(selected.value)
  if(on)next.add(id)
  else next.delete(id)
  selected.value=next
  resetConfirmation()
}
function toggleVisible(){
  const next=new Set(selected.value)
  const on=!allVisible.value
  for(const column of visible.value)if(on)next.add(column.uid);else next.delete(column.uid)
  selected.value=next
  resetConfirmation()
}
function transfer(){
  error.value=''
  try{
    if(!confirmed.value)throw new Error('Confirme a transferência antes de continuar.')
    if(!targetId.value)throw new Error('Selecione a tabela de destino.')
    const result=copying.value?store.copyColumns(sourceId.value,targetId.value,[...selected.value]):store.transferColumns(sourceId.value,targetId.value,[...selected.value])
    dialog.value.close()
    emit(copying.value?'copied':'moved',result)
  }catch(e){error.value=e.message}
}
defineExpose({open})
</script>

<template>
  <dialog ref="dialog" class="bulk-edit-dialog column-transfer-dialog" aria-labelledby="transfer-columns-title">
    <div class="bulk-edit-header">
      <div>
        <h2 id="transfer-columns-title"><Copy v-if="copying" :size="21"/><ArrowRightLeft v-else :size="21"/> {{copying?'Copiar colunas':'Transferir colunas'}}</h2>
        <p v-if="copying">Selecione as colunas de <strong>{{source?.nome}}</strong> que serão copiadas para outra tabela. As originais permanecerão na origem.</p><p v-else>Selecione as colunas de <strong>{{source?.nome}}</strong> que serão movidas para outra tabela. As colunas deixam a origem; não é uma cópia.</p>
      </div>
      <button type="button" class="iconbtn" title="Fechar" aria-label="Fechar transferência" @click="dialog.close()"><X :size="18"/></button>
    </div>
    <div class="bulk-edit-content">
      <label class="column-transfer-destination">Tabela de destino
        <select v-model="targetId" @change="resetConfirmation">
          <option value="" disabled>Selecione a tabela</option>
          <option v-for="table in destinations" :key="table.uid" :value="table.uid">{{table.nome}}</option>
        </select>
      </label>
      <label class="bulk-edit-search"><Search :size="17"/><input v-model="query" type="search" placeholder="Buscar coluna pelo nome ou tipo" aria-label="Buscar colunas para transferir"/></label>
      <div class="bulk-edit-selectline">
        <button type="button" class="btn" :disabled="!visible.length" @click="toggleVisible">{{allVisible?'Desmarcar resultados':'Selecionar resultados'}} ({{visible.length}})</button>
        <span>{{checked.length}} de {{source?.colunas.length||0}} coluna(s) selecionada(s)</span>
      </div>
      <div class="bulk-edit-list" role="group" aria-label="Colunas da tabela de origem">
        <label v-for="column in visible" :key="column.uid" class="bulk-edit-item">
          <input type="checkbox" :checked="selected.has(column.uid)" @change="toggle(column.uid,$event.target.checked)"/>
          <span class="bulk-edit-item-name"><strong>{{column.nome||'(sem nome)'}}</strong></span>
          <small>{{column.tipo}}{{column.pk?' · PK':''}}{{column.fk?' · FK':''}}</small>
        </label>
        <p v-if="!visible.length" class="bulk-edit-noresults">Nenhuma coluna encontrada.</p>
      </div>
      <div class="column-transfer-summary" aria-live="polite">
        <strong>{{source?.nome}} → {{destination?.nome||'Escolha o destino'}}</strong>
        <span v-if="copying">{{checked.length}} coluna(s) serão copiadas. Os nomes, tipos, tamanhos e descrições serão preservados; nomes repetidos receberão sufixo. Nenhum CHECK, PK, UNIQUE, FK, trigger ou função será copiado.</span><span v-else>{{checked.length}} coluna(s) serão movidas. Identificadores, tipos, descrições, CHECKs e UNIQUEs serão preservados. CHECKs SQL importados e triggers associadas às colunas serão transferidos, preservando a ligação com suas funções SQL no projeto.</span>
        <small v-if="copying">Somente a definição das colunas será copiada. Valores padrão de identidade não são repetidos. O modelo e as regras da origem permanecem intactos.</small><small v-else>Triggers e CHECKs que dependam de colunas não selecionadas permanecem protegidos. Funções SQL são compartilhadas pelo projeto e não são apagadas. Dependências ambíguas, políticas e índices afetados exigem revisão.</small>
      </div>
      <label class="bulk-edit-tick bulk-edit-confirm">
        <input v-model="confirmed" type="checkbox"/>
        Confirmo que {{checked.length}} coluna(s) {{copying?'serão copiadas':'sairão'}} de {{source?.nome}} {{copying?'para':'e irão para'}} {{destination?.nome||'a tabela escolhida'}}{{copying?', sem regras SQL e sem excluir as originais.':'.'}}
      </label>
      <p v-if="error" class="sql-import-error" role="alert">{{error}}</p>
    </div>
    <div class="bulk-edit-footer">
      <button type="button" class="btn" @click="dialog.close()">Cancelar</button>
      <button type="button" class="btn primary" :disabled="!confirmed||!checked.length||!targetId" @click="transfer"><Copy v-if="copying" :size="15"/><ArrowRightLeft v-else :size="15"/> {{copying?'Copiar':'Transferir'}} {{checked.length}} coluna(s)</button>
    </div>
  </dialog>
</template>
