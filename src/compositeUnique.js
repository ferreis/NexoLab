import { normalizedName } from './modelNames.js'

// A primeira coluna é a origem do cadastro; as demais participam da restrição.
export const isCompositeOwner=(group,columnId)=>group.colunas[0]===columnId

export const groupKey=ids=>[...ids].sort().join('|')

export function validateGroup(ids,columns){
  if(!Array.isArray(ids)||ids.length<2||new Set(ids).size!==ids.length){
    throw new Error('Selecione pelo menos duas colunas diferentes para o UNIQUE composto.')
  }
  if(ids.some(id=>!columns.some(c=>c.uid===id&&c.nome.trim()))){
    throw new Error('O UNIQUE composto deve usar colunas existentes e com nome nesta tabela.')
  }
}

export function convertGroups(groups,columns){
  if(groups===undefined)return []
  if(!Array.isArray(groups))throw new Error('Lista de UNIQUEs compostos inválida.')
  const seen=new Set()
  return groups.map(group=>{
    if(!Array.isArray(group.colunas))throw new Error('Colunas do UNIQUE composto inválidas.')
    const ids=group.colunas.map(value=>columns.find(c=>c.uid===value)?.uid||columns.find(c=>normalizedName(c.nome)===normalizedName(value))?.uid)
    validateGroup(ids,columns)
    const key=groupKey(ids)
    if(seen.has(key))throw new Error('Esta combinação de colunas já possui UNIQUE composto.')
    seen.add(key)
    return {uid:group.uid||crypto.randomUUID(),colunas:ids}
  })
}
