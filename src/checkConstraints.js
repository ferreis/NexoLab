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

// Apresentação compacta para documentação; não altera o SQL salvo ou exportado em JSON.
export function formatCheckText(expression){
  const sql=checkExpression(expression),tokens=[]
  let i=0
  while(i<sql.length){
    const start=i,char=sql[i]
    if(/\s/.test(char)){while(i<sql.length&&/\s/.test(sql[i]))i++;tokens.push(' ');continue}
    if(sql.startsWith('--',i)){while(i<sql.length&&sql[i]!=='\n'&&sql[i]!=='\r')i++;tokens.push(' ');continue}
    if(sql.startsWith('/*',i)){
      let depth=1;i+=2
      while(i<sql.length&&depth){
        if(sql.startsWith('/*',i)){depth++;i+=2}
        else if(sql.startsWith('*/',i)){depth--;i+=2}
        else i++
      }
      tokens.push(' ');continue
    }
    const dollar=char==='$'?sql.slice(i).match(/^\$(?:[\p{L}_][\p{L}\p{N}_]*)?\$/u)?.[0]:null
    if(dollar){
      const end=sql.indexOf(dollar,i+dollar.length)
      i=end<0?sql.length:end+dollar.length
    }else if(char==="'"||char==='"'){
      const escaped=char==="'"&&/[eE]/.test(sql[i-1]||'')&&!/[\p{L}\p{N}_$]/u.test(sql[i-2]||'')
      i++
      while(i<sql.length){
        if(escaped&&sql[i]==='\\'){i+=2;continue}
        if(sql[i]===char){if(sql[i+1]===char){i+=2;continue}i++;break}
        i++
      }
    }else i++
    // As quebras dentro de valores são representadas visivelmente, sem editar o valor salvo.
    tokens.push(sql.slice(start,i).replaceAll('\r','\\r').replaceAll('\n','\\n'))
  }
  let compact=tokens.filter((token,index)=>token!==' '||tokens[index-1]!==' ').join('').trim()
  // Remove apenas pares externos que envolvem a expressão inteira. Parênteses
  // em valores, funções e agrupamentos internos permanecem intactos.
  const significant=tokens.filter(token=>token!==' ')
  while(significant[0]==='('&&significant.at(-1)===')'){
    let depth=0,whole=true
    for(let j=0;j<significant.length;j++){
      if(significant[j]==='(')depth++
      if(significant[j]===')')depth--
      if(depth===0&&j<significant.length-1){whole=false;break}
    }
    if(!whole||depth!==0)break
    significant.shift();significant.pop()
    compact=compact.slice(1,-1).trim()
  }
  return `CHECK (${compact})`
}
