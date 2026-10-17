import { compileCheckBuilder, isCheckGroup } from './checkBuilder.js'
const reserved=new Set('AND OR NOT IS DISTINCT FROM NULL TRUE FALSE UNKNOWN CHECK IN BETWEEN LIKE ILIKE SELECT CASE WHEN THEN ELSE END CAST CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP LOCALTIME LOCALTIMESTAMP CURRENT_USER SESSION_USER USER'.split(' '))

// Conversor deliberadamente restrito ao que o formulário consegue representar.
// Não executa SQL nem tenta simplificar expressões desconhecidas.
function tokenize(sql){
  const tokens=[]
  let i=0
  while(i<sql.length){
    if(/\s/.test(sql[i])){i++;continue}
    if(sql.startsWith('--',i)){while(i<sql.length&&sql[i]!=='\n')i++;continue}
    if(sql.startsWith('/*',i)){
      let depth=1;i+=2
      while(i<sql.length&&depth){if(sql.startsWith('/*',i)){depth++;i+=2}else if(sql.startsWith('*/',i)){depth--;i+=2}else i++}
      if(depth)throw new Error('Comentário SQL não foi fechado.')
      continue
    }
    const char=sql[i]
    if(char==='"'||char==="'"){
      const quote=char;let value='',closed=false;i++
      while(i<sql.length){
        if(sql[i]===quote){if(sql[i+1]===quote){value+=quote;i+=2}else{i++;closed=true;break}}
        else value+=sql[i++]
      }
      if(!closed)throw new Error('Aspas SQL não foram fechadas.')
      tokens.push({kind:quote==='"'?'identifier':'string',value});continue
    }
    const rest=sql.slice(i)
    const number=rest.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)
    if(number){tokens.push({kind:'number',value:number[0]});i+=number[0].length;continue}
    const word=rest.match(/^[\p{L}_][\p{L}\p{N}_$]*/u)
    if(word){tokens.push({kind:'word',value:word[0]});i+=word[0].length;continue}
    const operator=rest.match(/^(?:>=|<=|<>|!=|=|>|<)/)
    if(operator){tokens.push({kind:'operator',value:operator[0]==='!='?'<>':operator[0]});i+=operator[0].length;continue}
    if('();,'.includes(char)){tokens.push({kind:char,value:char});i++;continue}
    throw new Error(`O trecho “${rest.slice(0,20)}” não é suportado pelo formulário.`)
  }
  return tokens
}

export function parseCheckSQL(sql,columns){
  if(typeof sql!=='string'||!sql.trim())throw new Error('Cole uma expressão CHECK para converter.')
  const tokens=tokenize(sql)
  let index=0
  const peek=()=>tokens[index]
  const word=value=>peek()?.kind==='word'&&peek().value.toUpperCase()===value
  function take(kind){const token=tokens[index++];if(!token||token.kind!==kind)throw new Error('Expressão incompleta ou não suportada pelo formulário.');return token}
  function column(token){
    if(!token||!['identifier','word'].includes(token.kind))throw new Error('Esperava o nome de uma coluna.')
    if(token.kind==='word'&&reserved.has(token.value.toUpperCase()))throw new Error('Esta palavra SQL deve permanecer no modo avançado; nomes de colunas reservados precisam de aspas duplas.')
    const name=token.kind==='word'?token.value.toLowerCase():token.value
    if(!columns.some(c=>c.nome===name))throw new Error(`A coluna “${name}” não existe nesta tabela.`)
    return name
  }
  function compare(){
    // Para dois campos, exatamente um preenchido é um OU entre dois grupos E.
    // Cada teste IS NULL/IS NOT NULL sempre resulta em boolean, como num_nonnulls.
    if(word('NUM_NONNULLS')&&tokens[index+1]?.kind==='('){
      index++;take('(')
      const first=column(tokens[index++]);take(',')
      const second=column(tokens[index++]);take(')')
      if(take('operator').value!=='='||Number(take('number').value)!==1)throw new Error('O formulário suporta num_nonnulls com duas colunas e comparação = 1.')
      return {operador:'OR',itens:[
        {operador:'AND',itens:[{coluna:first,operador:'IS NOT NULL'},{coluna:second,operador:'IS NULL'}]},
        {operador:'AND',itens:[{coluna:first,operador:'IS NULL'},{coluna:second,operador:'IS NOT NULL'}]}
      ]}
    }
    const left=column(tokens[index++])
    let operator
    if(word('IS')){
      index++;const not=word('NOT');if(not)index++
      if(word('NULL')){index++;return {coluna:left,operador:not?'IS NOT NULL':'IS NULL'}}
      if(!word('DISTINCT'))throw new Error('O formulário suporta IS [NOT] NULL e IS [NOT] DISTINCT FROM.')
      index++
      if(!word('FROM'))throw new Error('Esperava FROM após DISTINCT.')
      index++;operator=not?'IS NOT DISTINCT FROM':'IS DISTINCT FROM'
    }else operator=take('operator').value
    const token=tokens[index++]
    if(!token)throw new Error('Falta o valor ou a coluna da comparação.')
    const base={coluna:left,operador:operator,origem:'valor'}
    if(token.kind==='number')return {...base,tipoValor:'numero',valor:token.value}
    if(token.kind==='string')return {...base,tipoValor:'texto',valor:token.value}
    if(token.kind==='word'&&['TRUE','FALSE'].includes(token.value.toUpperCase()))return {...base,tipoValor:'boolean',valor:token.value.toLowerCase()}
    if(token.kind==='word'&&token.value.toUpperCase()==='NULL')throw new Error('Comparações com NULL como valor devem permanecer no SQL avançado. Use IS NULL nas seleções.')
    return {...base,origem:'coluna',valor:column(token)}
  }
  function primary(){
    if(peek()?.kind==='('){index++;const node=or();take(')');return isCheckGroup(node)?node:{operador:'AND',itens:[node]}}
    return compare()
  }
  function and(){const itens=[primary()];while(word('AND')){index++;itens.push(primary())}return itens.length===1?itens[0]:{operador:'AND',itens}}
  function or(){const itens=[and()];while(word('OR')){index++;itens.push(and())}return itens.length===1?itens[0]:{operador:'OR',itens}}
  const wrapped=word('CHECK')
  if(wrapped){index++;take('(')}
  const parsed=or()
  if(wrapped)take(')')
  if(peek()?.kind===';')index++
  if(index!==tokens.length)throw new Error(`O trecho “${peek().value}” não é suportado. Mantenha esta expressão no SQL avançado.`)
  const tree=isCheckGroup(parsed)?parsed:{operador:'AND',itens:[parsed]}
  compileCheckBuilder(tree,columns)
  return tree
}
