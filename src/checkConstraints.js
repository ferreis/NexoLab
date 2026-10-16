export function checkExpression(value){
  if(typeof value!=='string'||!value.trim())throw new Error('Informe uma expressão SQL para o CHECK.')
  return value
}

export function convertChecks(checks){
  if(checks===undefined)return []
  if(!Array.isArray(checks))throw new Error('Lista de restrições CHECK inválida.')
  return checks.map(check=>({uid:crypto.randomUUID(),expressao:checkExpression(check?.expressao),...(check.construtor?{construtor:JSON.parse(JSON.stringify(check.construtor))}:{})}))
}

// A nova linha mantém o fechamento válido mesmo se a expressão terminar com comentário SQL.
export const formatCheckSQL=expression=>`CHECK (\n${checkExpression(expression)}\n)`
