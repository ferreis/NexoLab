<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { CircleAlert } from 'lucide-vue-next'

defineProps({label:{type:String,required:true},text:{type:String,required:true}})
const root=ref(null), panel=ref(null), open=ref(false), pinned=ref(false), position=ref({}), id=useId()
let timer
function place(){
  if(!open.value||!root.value||!panel.value)return
  const anchor=root.value.getBoundingClientRect(),box=panel.value.getBoundingClientRect()
  const left=Math.max(8,Math.min(anchor.left,window.innerWidth-box.width-8))
  const below=anchor.bottom+6
  const top=below+box.height<=window.innerHeight-8?below:Math.max(8,anchor.top-box.height-6)
  position.value={left:`${left}px`,top:`${top}px`}
}
async function show(){clearTimeout(timer);open.value=true;await nextTick();place()}
function close(){clearTimeout(timer);open.value=false;pinned.value=false}
function leave(){clearTimeout(timer);timer=setTimeout(()=>{if(!pinned.value)open.value=false},150)}
function toggle(){if(pinned.value)close();else{pinned.value=true;show()}}
function outside(event){if(!root.value?.contains(event.target)&&!panel.value?.contains(event.target))close()}
onMounted(()=>{document.addEventListener('pointerdown',outside);window.addEventListener('resize',place);window.addEventListener('scroll',place,true)})
onBeforeUnmount(()=>{clearTimeout(timer);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)})
</script>

<template>
  <span ref="root" class="help-tooltip" :class="{'help-control':!!$slots.default}" @mouseenter="show" @mouseleave="leave" @keydown.esc.stop="close">
    <slot/>
    <button type="button" class="help-trigger" :aria-label="`Ajuda: ${label}`" :aria-expanded="open" :aria-describedby="open?id:undefined" @focus="show" @blur="close" @click.stop.prevent="toggle"><CircleAlert :size="14"/></button>
    <Teleport to="body">
      <span v-if="open" :id="id" ref="panel" role="tooltip" class="help-popup" :style="position" @mouseenter="show" @mouseleave="leave">{{text}}</span>
    </Teleport>
  </span>
</template>

<style scoped>
.help-tooltip { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.help-control { gap: 0; border: 1px solid #303d51; border-radius: 6px; background: #1c2635; overflow: hidden; }
.help-control:has(input:checked), .help-control:has(> button[aria-pressed=true]) { background: #302743; border-color: #655084; }
.help-control :slotted(.check), .help-control :slotted(.btn) { border: 0; border-radius: 0; background: transparent; box-shadow: none; padding-right: 4px; }
.help-control :slotted(span) { padding: 6px 8px; min-width: 0; overflow-wrap: anywhere; }
.help-control .help-trigger { margin-right: 4px; }
.help-control:focus-within { outline: 2px solid #a38cf9; outline-offset: 2px; }
.help-control .help-trigger:focus-visible, .help-control :slotted(.btn):focus-visible { outline: none; }
.help-trigger { display: inline-grid; place-items: center; flex-shrink: 0; width: 24px; height: 24px; border: 0; padding: 0; border-radius: 4px; background: transparent; color: #b8a4f1; cursor: help; }
.help-trigger:hover, .help-trigger[aria-expanded=true] { background: #302940; color: #eee5ff; }
.help-popup { position: fixed; z-index: 100; display: block; width: max-content; max-width: min(340px,calc(100vw - 16px)); max-height: min(280px,calc(100dvh - 16px)); overflow-y: auto; white-space: pre-line; overflow-wrap: anywhere; border: 1px solid #655084; border-radius: 6px; background: #202939; color: #d2dbea; padding: 10px 12px; box-shadow: 0 6px 20px #0006; font-size: 12px; line-height: 1.6; }
</style>
