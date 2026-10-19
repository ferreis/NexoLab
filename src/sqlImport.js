// Interpreta DDL PostgreSQL no navegador sem executar SQL.
const ID = '(?:"(?:[^"]|"")*"|[A-Za-z_][\\w$]*)'
const NAME = ID + '(?:\\s*\\.\\s*' + ID + ')?'
const re = (s,flags='i') => new RegExp(s,flags)
const unquote = s => String(s).trim().replace(/^"|"$/g,'').replace(/""/g,'"')
const norm = s => String(s).trim().toLowerCase()
const arrayUnique = a => [...new Set(a)]

function qualified(value,fallback) {
  const m = re('^\\s*('+ID+')\\s*\\.\\s*('+ID+')\\s*$').exec(value)
  return m?{schema:unquote(m[1]),nome:unquote(m[2])}:{schema:fallback,nome:unquote(value)}
}
function walkTop(sql,fn) {
  let depth=0, single=false, double=false, dollar=''
  for(let i=0;i<sql.length;i++){
    const c=sql[i],n=sql[i+1]
    if(dollar){if(sql.startsWith(dollar,i)){i+=dollar.length-1;dollar=''}continue}
    if(single){if(c==="'"&&n==="'"){i++;continue}if(c==="'"&&sql[i-1]!=='\\')single=false;continue}
    if(double){if(c==='"'&&n==='"'){i++;continue}if(c==='"')double=false;continue}
    if(c==="'"){single=true;continue}
    if(c==='"'){double=true;continue}
    if(c==='$'){const m=/^\$[\w]*\$/.exec(sql.slice(i));if(m){dollar=m[0];i+=dollar.length-1;continue}}
    if(c==='('){depth++;continue}
    if(c===')'){depth--;continue}
    if(depth===0&&fn(i,c)===false)return
  }
}
function splitTop(sql){
  let start=0
  const out=[]
  walkTop(sql,(i,c)=>{if(c===','){out.push(sql.slice(start,i).trim());start=i+1}})
  out.push(sql.slice(start).trim())
  return out.filter(Boolean)
}
function keyword(sql,patterns){
  const r=re('^(?:'+patterns.join('|')+')\\b')
  let result=-1
  walkTop(sql,(i,c)=>{
    if(/[a-z]/i.test(c)&&(i===0||!/[a-z0-9_$]/i.test(sql[i-1]))&&r.test(sql.slice(i))){result=i;return false}
  })
  return result
}
function parenthesized(sql,start){
  if(sql[start]!=='(')throw new Error('Parênteses inválidos.')
  let depth=0,single=false,double=false
  for(let i=start;i<sql.length;i++){
    const c=sql[i],n=sql[i+1]
    if(single){if(c==="'"&&n==="'"){i++;continue}if(c==="'")single=false;continue}
    if(double){if(c==='"'&&n==='"'){i++;continue}if(c==='"')double=false;continue}
    if(c==="'"){single=true;continue}
    if(c==='"'){double=true;continue}
    if(c==='(')depth++
    if(c===')'&&!--depth)return sql.slice(start+1,i)
  }
  throw new Error('Parênteses não fechados.')
}
function literal(raw){
  return raw.replace(/^E'/i,"'").replace(/^'/,'').replace(/'$/,'').replace(/''/g,"'")
}
export function splitSqlStatements(sql){
  if(typeof sql!=='string')throw new Error('Cole o SQL ou selecione um arquivo.')
  const out=[]
  let b='',single=false,double=false,dollar='',line=false,block=0
  for(let i=0;i<sql.length;i++){
    const c=sql[i],n=sql[i+1]
    if(line){if(c==='\n'){line=false;b+='\n'}continue}
    if(block){if(c==='/'&&n==='*'){block++;i++}else if(c==='*'&&n==='/'){block--;i++}continue}
    if(dollar){if(sql.startsWith(dollar,i)){b+=dollar;i+=dollar.length-1;dollar=''}else b+=c;continue}
    if(single){b+=c;if(c==="'"&&n==="'"){b+=n;i++}else if(c==="'"&&sql[i-1]!=='\\')single=false;continue}
    if(double){b+=c;if(c==='"'&&n==='"'){b+=n;i++}else if(c==='"')double=false;continue}
    if(c==='-'&&n==='-'){line=true;i++;b+=' ';continue}
    if(c==='/'&&n==='*'){block=1;i++;b+=' ';continue}
    if(c==="'"){single=true;b+=c;continue}
    if(c==='"'){double=true;b+=c;continue}
    if(c==='$'){const m=/^\$[\w]*\$/.exec(sql.slice(i));if(m){dollar=m[0];b+=dollar;i+=dollar.length-1;continue}}
    if(c===';'){if(b.trim())out.push(b.trim()+';');b='';continue}
    b+=c
  }
  if(single||double||dollar||block)throw new Error('SQL incompleto (aspas ou comentário abertos).')
  if(b.trim())out.push(b.trim())
  return out
}
function column(name,raw,enums,warnings,schema){
  const stop=['NOT\\s+NULL','NULL','DEFAULT','GENERATED','CONSTRAINT','PRIMARY\\s+KEY','UNIQUE','REFERENCES','CHECK','COLLATE']
  const index=keyword(raw,stop)
  const type=(index<0?raw:raw.slice(0,index)).trim()
  const opts=index<0?'':raw.slice(index)
  const numeric=/^(?:"?numeric"?|"?decimal"?)\s*(?:\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?$/i.exec(type)
  const varchar=/^("?character varying"?|"?varchar"?|"?character"?|"?char"?)\s*(?:\(\s*(\d+)\s*\))?$/i.exec(type)
  const known={
    bigint:'BIGINT',int8:'BIGINT',bigserial:'BIGINT',integer:'INTEGER',int:'INTEGER',int4:'INTEGER',serial:'INTEGER',
    smallint:'SMALLINT',int2:'SMALLINT',smallserial:'SMALLINT',boolean:'BOOLEAN',bool:'BOOLEAN',text:'TEXT',
    date:'DATE',time:'TIME','time without time zone':'TIME',timestamp:'TIMESTAMP',
    'timestamp without time zone':'TIMESTAMP','timestamp with time zone':'TIMESTAMPTZ',
    timestamptz:'TIMESTAMPTZ',uuid:'UUID',jsonb:'JSONB','text[]':'TEXT[]'
  }
  let tipo=known[type.replace(/"([^"]+)"/g,'$1').toLowerCase()]||'CUSTOM',tamanho='',escala='',enumNome='',enumValores=[]
  if(numeric){tipo='NUMERIC';tamanho=numeric[1]||'';escala=numeric[2]||''}
  else if(varchar){tipo=/^(char|character)$/i.test(varchar[1])?'CHAR':'VARCHAR';tamanho=varchar[2]||''}
  else if(tipo==='CUSTOM'){
    const r=qualified(type,schema)
    const en=enums.find(e=>norm(e.schema)===norm(r.schema)&&norm(e.nome)===norm(r.nome))
    if(en){tipo='ENUM';enumNome=r.schema+'.'+r.nome;enumValores=[...en.valores]}
    else warnings.push('Tipo '+type+' de '+name+' preservado como personalizado.')
  }
  let padrao=''
  const def=keyword(opts,['DEFAULT'])
  if(def>=0){const after=opts.slice(def+7);const last=keyword(after,['NOT\\s+NULL','NULL','CONSTRAINT','PRIMARY\\s+KEY','UNIQUE','REFERENCES','CHECK','COLLATE','GENERATED']);padrao=(last<0?after:after.slice(0,last)).trim()}
  const generated=/\b(GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY)\b/i.exec(opts)
  if(generated)padrao=generated[1].replace(/\s+/g,' ').toUpperCase()
  const checks=[]
  const ck=/\bCHECK\s*\(/i.exec(opts)
  if(ck)checks.push({expressao:parenthesized(opts,ck.index+ck[0].lastIndexOf('(')).trim()})
  const foreign=re('\\bREFERENCES\\s+('+NAME+')\\s*\\(\\s*('+ID+')\\s*\\)').exec(opts)
  return {nome:name,tipo,tamanho,escala,sqlTipoOriginal:type,enumNome,enumValores,
    nullable:!/\bNOT\s+NULL\b|\bPRIMARY\s+KEY\b/i.test(opts),pk:/\bPRIMARY\s+KEY\b/i.test(opts),
    unique:/\bUNIQUE\b/i.test(opts),padrao,checks,checkEnabled:checks.length>0,
    fk:!!foreign,fkTabela:foreign?(qualified(foreign[1],schema).schema===schema?qualified(foreign[1],schema).nome:qualified(foreign[1],schema).schema+'.'+qualified(foreign[1],schema).nome):'',fkColuna:foreign?unquote(foreign[2]):'id',
    descricao:'',comentario:''}
}
function constraint(t,sql,schema){
  sql=sql.replace(/;\s*$/,'').trim()
  if(!t.sqlRestricoes.includes(sql))t.sqlRestricoes.push(sql)
  const body=sql.replace(re('^CONSTRAINT\\s+'+ID+'\\s+'),'')
  const cols=prefix=>{
    const m=re('^'+prefix+'\\s*\\(').exec(body)
    return m?splitTop(parenthesized(body,m[0].length-1)).map(unquote):null
  }
  const pk=cols('PRIMARY\\s+KEY')
  if(pk){for(const c of t.colunas)if(pk.some(n=>norm(n)===norm(c.nome))){c.pk=true;c.nullable=false}return}
  const uq=cols('UNIQUE')
  if(uq){
    if(uq.length===1){const c=t.colunas.find(c=>norm(c.nome)===norm(uq[0]));if(c)c.unique=true}
    if(uq.length>1&&!t.uniqueCompostos.some(g=>g.colunas.map(norm).join('|')===uq.map(norm).join('|')))t.uniqueCompostos.push({colunas:uq})
    return
  }
  const fk=re('^FOREIGN\\s+KEY\\s*\\(\\s*('+ID+')\\s*\\)\\s*REFERENCES\\s+('+NAME+')\\s*\\(\\s*('+ID+')\\s*\\)').exec(body)
  if(fk){const c=t.colunas.find(c=>norm(c.nome)===norm(unquote(fk[1])));if(c){const ref=qualified(fk[2],schema);c.fk=true;c.fkTabela=ref.schema===schema?ref.nome:ref.schema+'.'+ref.nome;c.fkColuna=unquote(fk[3])}}
}
function createTable(sql,schema,enums,warnings){
  const m=re('^CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?('+NAME+')\\s*\\(').exec(sql)
  if(!m)throw new Error('CREATE TABLE inválido ou não suportado.')
  const r=qualified(m[1],schema)
  const t={nome:r.nome,schema:r.schema,comentario:'',colunas:[],uniqueCompostos:[],sqlRestricoes:[],sqlTriggers:[],sqlIndices:[],sqlPoliticas:[]}
  const defs=splitTop(parenthesized(sql,m[0].length-1))
  for(const part of defs){
    if(/^(?:CONSTRAINT\s+\S+\s+)?(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\b/i.test(part)){t.sqlRestricoes.push(part);continue}
    const c=re('^('+ID+')\\s+([\\s\\S]+)$').exec(part)
    if(!c)throw new Error('Coluna não reconhecida em '+r.nome+': '+part.slice(0,65))
    t.colunas.push(column(unquote(c[1]),c[2],enums,warnings,r.schema))
  }
  for(const item of [...t.sqlRestricoes])constraint(t,item,r.schema)
  return t
}
export function parsePostgresDDL(sql,defaultSchema='rpg'){
  const statements=splitSqlStatements(sql),enums=[],warnings=[],functions=[],other=[],create=[]
  let ignored=0
  for(const st of statements){
    const m=re('^CREATE\\s+TYPE\\s+('+NAME+')\\s+AS\\s+ENUM\\s*\\(').exec(st)
    if(m){const r=qualified(m[1],defaultSchema);enums.push({...r,valores:splitTop(parenthesized(st,m[0].length-1)).map(literal),sql:st});continue}
    if(/^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/i.test(st)){functions.push(st);continue}
    if(/^CREATE\s+(?:UNLOGGED\s+)?TABLE\b/i.test(st)){create.push(st);continue}
    if(/^(?:ALTER\s+TABLE|COMMENT\s+ON|CREATE\s+(?:UNIQUE\s+)?INDEX|CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER|CREATE\s+POLICY)\b/i.test(st)){other.push(st);continue}
    if(/^CREATE\s+|^ALTER\s+|^COMMENT\s+/i.test(st)&&!/^ALTER\s+(?:TYPE|FUNCTION|SCHEMA|DEFAULT\s+PRIVILEGES)\b|^CREATE\s+(?:SCHEMA|EXTENSION|SEQUENCE)\b|^COMMENT\s+ON\s+(?:SCHEMA|TYPE|FUNCTION)\b/i.test(st))ignored++
  }
  const tables=create.map(st=>createTable(st,defaultSchema,enums,warnings))
  if(!tables.length)throw new Error('Não foi encontrado CREATE TABLE no SQL informado.')
  const schemas=arrayUnique(tables.map(t=>norm(t.schema)))
  if(schemas.length!==1)throw new Error('O NexoDB Lab usa um único schema por projeto. Encontrados: '+schemas.join(', '))
  const schema=tables[0].schema
  const find=r=>tables.find(t=>norm(t.schema)===norm(r.schema)&&norm(t.nome)===norm(r.nome))
  for(const st of other){
    let policy=re('^CREATE\\s+POLICY\\s+[\\s\\S]+?\\bON\\s+('+NAME+')(?=\\s|;|$)').exec(st)
    if(policy){const t=find(qualified(policy[1],schema));if(t)t.sqlPoliticas.push(st);continue}
    policy=re('^ALTER\\s+TABLE\\s+('+NAME+')\\s+(?:ENABLE|DISABLE|FORCE|NO\\s+FORCE)\\s+ROW\\s+LEVEL\\s+SECURITY').exec(st)
    if(policy){const t=find(qualified(policy[1],schema));if(t)t.sqlPoliticas.push(st);continue}
    let m=re('^ALTER\\s+TABLE\\s+(?:ONLY\\s+)?('+NAME+')\\s+ADD\\s+(CONSTRAINT\\s+[\\s\\S]+)$').exec(st)
    if(m){const t=find(qualified(m[1],schema));if(t)constraint(t,m[2],schema);continue}
    m=re('^ALTER\\s+TABLE\\s+(?:ONLY\\s+)?('+NAME+')\\s+ALTER\\s+COLUMN\\s+('+ID+')\\s+ADD\\s+(GENERATED\\s+(?:ALWAYS|BY\\s+DEFAULT)\\s+AS\\s+IDENTITY)').exec(st)
    if(m){const c=find(qualified(m[1],schema))?.colunas.find(c=>norm(c.nome)===norm(unquote(m[2])));if(c)c.padrao=m[3].replace(/\s+/g,' ').toUpperCase();continue}
    m=re('^COMMENT\\s+ON\\s+TABLE\\s+('+NAME+')\\s+IS\\s+(E?\\x27(?:\\x27\\x27|[^\\x27])*\\x27|NULL)').exec(st)
    if(m){const t=find(qualified(m[1],schema));if(t)t.comentario=/^NULL$/i.test(m[2])?'':literal(m[2]);continue}
    m=re('^COMMENT\\s+ON\\s+COLUMN\\s+('+ID+')\\s*\\.\\s*('+ID+')\\s*\\.\\s*('+ID+')\\s+IS\\s+(E?\\x27(?:\\x27\\x27|[^\\x27])*\\x27|NULL)').exec(st)
    if(m){const c=find({schema:unquote(m[1]),nome:unquote(m[2])})?.colunas.find(c=>norm(c.nome)===norm(unquote(m[3])));if(c)c.comentario=/^NULL$/i.test(m[4])?'':literal(m[4]);continue}
    if(/^CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b/i.test(st)){
      const target=re('\\bON\\s+('+NAME+')\\s+FOR\\s+EACH\\s+(?:ROW|STATEMENT)').exec(st)
      const t=target&&find(qualified(target[1],schema))
      if(t)t.sqlTriggers.push(st)
      else warnings.push('Há uma trigger sem tabela correspondente no arquivo.')
      continue
    }
    m=re('^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?'+ID+'\\s+ON\\s+(?:ONLY\\s+)?('+NAME+')(?=\\s|;|$)').exec(st)
    if(m){const t=find(qualified(m[1],schema));if(t)t.sqlIndices.push(st)}
  }
  if(ignored)warnings.push(ignored+' instruções adicionais não foram interpretadas.')
  return {schema_alvo:schema,tabelas:tables.map(({schema:unused,...t})=>t),
    enums:enums.filter(e=>norm(e.schema)===norm(schema)),
    funcoesSql:functions.filter(f=>f.toLowerCase().includes(schema.toLowerCase()+'.')||f.toLowerCase().includes('"'+schema.toLowerCase()+'".')),
    avisos:arrayUnique(warnings),
    resumo:{tabelas:tables.length,colunas:tables.reduce((n,t)=>n+t.colunas.length,0),
      enums:enums.filter(e=>norm(e.schema)===norm(schema)).length,funcoes:functions.length,
      triggers:tables.reduce((n,t)=>n+t.sqlTriggers.length,0),politicas:tables.reduce((n,t)=>n+t.sqlPoliticas.length,0),restricoes:tables.reduce((n,t)=>n+t.sqlRestricoes.length,0)}}
}
