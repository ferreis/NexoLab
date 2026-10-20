<script setup>
import {computed,nextTick,onMounted,onUnmounted,ref,watch} from 'vue'
import {Network,Database,ZoomIn,ZoomOut,Maximize2,Copy,Download,Code2,Image,RefreshCw} from 'lucide-vue-next'
import {diagramModel,mermaidConnections,mermaidDatabase} from '../mermaidDiagrams.js'

const props=defineProps({
  model:{type:Object,required:true},
  selectedId:{type:String,default:null},
  scope:{type:String,default:'all'}
})
const mode=ref('links'),direction=ref('LR'),theme=ref('dark')
const source=computed(()=>mode.value==='links'
  ?mermaidConnections(props.model,{scope:props.scope,selectedId:props.selectedId,direction:direction.value})
  :mermaidDatabase(props.model,{scope:props.scope,selectedId:props.selectedId,direction:direction.value}))
const summary=computed(()=>diagramModel(props.model,{scope:props.scope,selectedId:props.selectedId}))
const viewport=ref(null),imageUrl=ref(''),dimensions=ref({width:500,height:320})
const position=ref({x:0,y:0}),scale=ref(1)
const loading=ref(false),error=ref(''),message=ref('')
let renderer=null,renderVersion=0,renderId=0,observer=null,drag=null,hasMoved=false

const diagramTitle=computed(()=>mode.value==='links'?'Mapa de ligações':'Diagrama do banco')
const transform=computed(()=>`translate(${position.value.x}px,${position.value.y}px) scale(${scale.value})`)
function bounds(svg){
  const match=svg.match(/\bviewBox="([^"]+)"/i)
  const nums=match?.[1]?.trim().split(/[\s,]+/).map(Number)
  if(nums?.length===4&&nums[2]>0&&nums[3]>0&&nums.every(Number.isFinite)){
    return {width:Math.min(20000,Math.ceil(nums[2])),height:Math.min(20000,Math.ceil(nums[3]))}
  }
  return {width:900,height:600}
}
function fit(){
  const el=viewport.value
  if(!el)return
  const {width,height}=dimensions.value
  const zoom=Math.min(2,Math.max(0.05,Math.min((el.clientWidth-60)/width,(el.clientHeight-60)/height)))
  scale.value=zoom
  position.value={x:(el.clientWidth-width*zoom)/2,y:(el.clientHeight-height*zoom)/2}
  hasMoved=false
}
function zoom(factor,clientX=null,clientY=null){
  const el=viewport.value
  if(!el)return
  const rect=el.getBoundingClientRect()
  const px=clientX===null?rect.width/2:clientX-rect.left
  const py=clientY===null?rect.height/2:clientY-rect.top
  const next=Math.min(5,Math.max(0.04,scale.value*factor))
  const ratio=next/scale.value
  position.value={x:px-(px-position.value.x)*ratio,y:py-(py-position.value.y)*ratio}
  scale.value=next
  hasMoved=true
}
function wheel(event){zoom(event.deltaY<0?1.13:1/1.13,event.clientX,event.clientY)}
function startDrag(event){
  if(event.button!==0)return
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:position.value.x,startY:position.value.y}
  event.currentTarget.setPointerCapture(event.pointerId)
}
function moveDrag(event){
  if(!drag||event.pointerId!==drag.id)return
  position.value={x:drag.startX+event.clientX-drag.x,y:drag.startY+event.clientY-drag.y}
  hasMoved=true
}
function endDrag(event){
  if(drag?.id!==event.pointerId)return
  drag=null
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)
}
function keyMove(event){
  if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.2)}
  else if(event.key==='-'){event.preventDefault();zoom(1/1.2)}
  else if(event.key==='0'){event.preventDefault();fit()}
  else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){
    event.preventDefault()
    position.value={x:position.value.x+(event.key==='ArrowLeft'?32:event.key==='ArrowRight'?-32:0),y:position.value.y+(event.key==='ArrowUp'?32:event.key==='ArrowDown'?-32:0)}
    hasMoved=true
  }
}
async function render(){
  const version=++renderVersion
  loading.value=true
  error.value=''
  try{
    if(!renderer)renderer=(await import('mermaid')).default
    if(version!==renderVersion)return
    renderer.initialize({
      startOnLoad:false,securityLevel:'strict',theme:theme.value,htmlLabels:false,
      flowchart:{htmlLabels:false,useMaxWidth:false},
      er:{useMaxWidth:false},
      maxTextSize:600000
    })
    const result=await renderer.render(`nexodb-diagrama-${++renderId}`,source.value)
    if(version!==renderVersion)return
    const url=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml;charset=utf-8'}))
    const old=imageUrl.value
    imageUrl.value=url
    dimensions.value=bounds(result.svg)
    if(old)URL.revokeObjectURL(old)
    await nextTick()
    if(version===renderVersion)fit()
  }catch(err){
    if(version!==renderVersion)return
    error.value='Não foi possível desenhar este diagrama. Confira os nomes das tabelas e colunas. '+String(err?.message||err).slice(0,240)
  }finally{
    if(version===renderVersion)loading.value=false
  }
}
watch([source,theme],render,{immediate:true})
onMounted(()=>{
  if(typeof ResizeObserver!=='undefined'&&viewport.value){
    observer=new ResizeObserver(()=>{if(!hasMoved&&imageUrl.value)fit()})
    observer.observe(viewport.value)
  }
})
onUnmounted(()=>{
  renderVersion++
  observer?.disconnect()
  if(imageUrl.value)URL.revokeObjectURL(imageUrl.value)
})
function save(blob,filename){
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=url;link.download=filename;link.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
const filename=computed(()=>mode.value==='links'?'nexodb-ligacoes':'nexodb-banco-er')
function exportMermaid(){save(new Blob([source.value+'\n'],{type:'text/plain;charset=utf-8'}),filename.value+'.mmd')}
function exportSvg(){
  if(!imageUrl.value)return
  fetch(imageUrl.value).then(r=>r.blob()).then(blob=>save(blob,filename.value+'.svg')).catch(()=>message.value='Falha ao exportar SVG.')
}
async function exportPng(){
  if(!imageUrl.value)return
  try{
    const image=new window.Image()
    image.src=imageUrl.value
    await image.decode()
    const {width,height}=dimensions.value
    const factor=Math.min(2,8192/Math.max(width,height))
    const canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.round(width*factor))
    canvas.height=Math.max(1,Math.round(height*factor))
    const ctx=canvas.getContext('2d')
    if(!ctx)throw new Error('Canvas indisponível.')
    ctx.fillStyle=theme.value==='dark'?'#121a28':'#ffffff'
    ctx.fillRect(0,0,canvas.width,canvas.height)
    ctx.drawImage(image,0,0,canvas.width,canvas.height)
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
    if(!blob)throw new Error('PNG indisponível.')
    save(blob,filename.value+'.png')
  }catch(err){message.value='Não foi possível gerar o PNG: '+err.message}
}
async function copyCode(){
  try{await navigator.clipboard.writeText(source.value);message.value='Código Mermaid copiado.'}
  catch{message.value='Não foi possível copiar o código.'}
}
</script>

<template>
  <section class="diagram-page" aria-label="Diagramas Mermaid do modelo">
    <div class="sectionhead diagram-page-heading">
      <div><h1>Diagramas Mermaid</h1><p>Explore as ligações entre tabelas ou a estrutura do banco. Atualização automática, sem conexão com o PostgreSQL.</p></div>
      <span class="diagram-counts">{{summary.tables.length}} tabela(s) · {{summary.edges.length}} ligação(ões)</span>
    </div>
    <div class="diagram-controls">
      <div class="diagram-control-set">
        <span>Visualização</span>
        <div class="tabs" role="group" aria-label="Tipo de diagrama">
          <button type="button" :class="{active:mode==='links'}" :aria-pressed="mode==='links'" @click="mode='links'"><Network :size="15"/> Ligações</button>
          <button type="button" :class="{active:mode==='er'}" :aria-pressed="mode==='er'" @click="mode='er'"><Database :size="15"/> Banco ER</button>
        </div>
      </div>
      <div class="diagram-control-set">
        <span>Direção</span>
        <div class="tabs" role="group" aria-label="Direção do diagrama">
          <button type="button" :class="{active:direction==='LR'}" :aria-pressed="direction==='LR'" @click="direction='LR'">Horizontal</button>
          <button type="button" :class="{active:direction==='TB'}" :aria-pressed="direction==='TB'" @click="direction='TB'">Vertical</button>
        </div>
      </div>
      <div class="diagram-control-set">
        <span>Tema</span>
        <div class="tabs" role="group" aria-label="Tema do diagrama">
          <button type="button" :class="{active:theme==='dark'}" :aria-pressed="theme==='dark'" @click="theme='dark'">Escuro</button>
          <button type="button" :class="{active:theme==='default'}" :aria-pressed="theme==='default'" @click="theme='default'">Claro</button>
        </div>
      </div>
    </div>
    <p v-if="summary.unresolved.length" class="diagram-warning">FKs sem tabela correspondente no modelo: {{summary.unresolved.join(', ')}}. Elas aparecem como referências externas.</p>
    <div class="diagram-board">
      <div class="diagram-toolbar">
        <strong>{{diagramTitle}}</strong>
        <div class="diagram-toolbar-actions">
          <button type="button" class="iconbtn" aria-label="Diminuir zoom" title="Diminuir zoom" :disabled="!imageUrl" @click="zoom(1/1.2)"><ZoomOut :size="17"/></button>
          <span class="diagram-zoom">{{Math.round(scale*100)}}%</span>
          <button type="button" class="iconbtn" aria-label="Aumentar zoom" title="Aumentar zoom" :disabled="!imageUrl" @click="zoom(1.2)"><ZoomIn :size="17"/></button>
          <button type="button" class="iconbtn" aria-label="Ajustar diagrama à tela" title="Ajustar à tela" :disabled="!imageUrl" @click="fit"><Maximize2 :size="17"/></button>
          <button type="button" class="iconbtn" aria-label="Redesenhar diagrama" title="Redesenhar" @click="render"><RefreshCw :size="17"/></button>
        </div>
      </div>
      <div ref="viewport" class="diagram-stage" tabindex="0" role="region" aria-label="Mapa interativo. Arraste para mover, use a roda para ampliar e as setas do teclado para navegar."
        @wheel.prevent="wheel" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @keydown="keyMove">
        <div v-if="imageUrl" class="diagram-transform" :style="{transform}">
          <img :src="imageUrl" :alt="diagramTitle+' com '+summary.tables.length+' tabelas e '+summary.edges.length+' ligações'" :width="dimensions.width" :height="dimensions.height" draggable="false"/>
        </div>
        <div v-if="loading" class="diagram-overlay" role="status">Desenhando diagrama...</div>
        <div v-else-if="error" class="diagram-overlay diagram-error" role="alert">{{error}}</div>
      </div>
      <div class="diagram-board-footer">
        <span>Arraste para navegar · Roda para zoom · Teclas +, −, 0 e setas</span>
        <span>Renderização local com Mermaid</span>
      </div>
    </div>
    <div class="diagram-export">
      <button class="btn" type="button" @click="copyCode"><Copy :size="15"/> Copiar Mermaid</button>
      <button class="btn" type="button" @click="exportMermaid"><Code2 :size="15"/> Baixar .mmd</button>
      <button class="btn" type="button" :disabled="!imageUrl||loading" @click="exportSvg"><Download :size="15"/> SVG</button>
      <button class="btn" type="button" :disabled="!imageUrl||loading" @click="exportPng"><Image :size="15"/> PNG</button>
      <span v-if="message" role="status" class="diagram-message">{{message}}</span>
    </div>
    <details class="diagram-source">
      <summary>Ver código Mermaid gerado automaticamente</summary>
      <p>O código reflete o modelo atual. Copie ou baixe para editar no <a href="https://mermaidview.io/" target="_blank" rel="noopener noreferrer">MermaidView</a>. Alterações externas não modificam o projeto.</p>
      <pre><code>{{source}}</code></pre>
    </details>
    <p class="diagram-footnote">O diagrama ER apresenta PK, FK, UNIQUE individual e nulidade. CHECKs, UNIQUEs compostos e triggers continuam disponíveis no editor e no JSON do projeto.</p>
  </section>
</template>
