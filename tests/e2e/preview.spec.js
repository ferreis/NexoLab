import { test, expect } from '@playwright/test'

const sample={
  projeto:'RPG',
  schema_alvo:'rpg',
  tabelas:[{
    nome:'conhecimentos',
    comentario:'Primeira linha da descrição.\nSegunda linha da descrição.',
    uniqueCompostos:[],
    colunas:Array.from({length:75},(_,i)=>({
      nome:'coluna_'+String(i+1).padStart(2,'0'),
      tipo:'TEXT',
      descricao:'Regra da coluna '+String(i+1),
      checks:[]
    }))
  }]
}

test.beforeEach(async({page})=>{
  await page.goto('/')
  await page.evaluate(()=>localStorage.clear())
  await page.reload()
  await page.locator('.topbar input[type="file"]').setInputFiles({
    name:'modelo-teste.json',
    mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(sample),'utf8')
  })
  await expect(page.getByRole('heading',{name:'Estrutura da tabela'})).toBeVisible()
})

test('prévia TXT da tabela exibe linhas reais e copia exatamente o texto renderizado',async({page,context})=>{
  await page.getByRole('group',{name:'Conteúdo da prévia'}).getByRole('button',{name:/Tabela/}).click()
  const code=page.locator('.preview-scroll pre code')
  await expect(code).toContainText('TABELA: rpg.conhecimentos')
  const shown=await code.textContent()
  expect(shown).toContain('TABELA: rpg.conhecimentos\nDescrição: Primeira linha da descrição.\nSegunda linha da descrição.\n\nColunas:\n- coluna_01:')
  expect(shown).toContain('\n- coluna_75:')
  expect(shown).not.toContain('\\n')
  await context.grantPermissions(['clipboard-read','clipboard-write'])
  await page.getByRole('button',{name:'Copiar tabela atual'}).click()
  const copied=await page.evaluate(()=>navigator.clipboard.readText())
  expect(copied).toBe(shown)
})

test('painel direito permanece inteiro ao rolar a página e permite chegar ao fim da prévia',async({page})=>{
  await page.getByRole('group',{name:'Conteúdo da prévia'}).getByRole('button',{name:/Tabela/}).click()
  await page.evaluate(()=>window.scrollTo(0,1200))
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(600)
  const panel=page.locator('aside.preview')
  const bounds=await panel.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds.y).toBeGreaterThanOrEqual(-1)
  expect(bounds.y).toBeLessThanOrEqual(1)
  const viewportHeight=page.viewportSize().height
  expect(Math.abs(bounds.height-viewportHeight)).toBeLessThanOrEqual(1)
  expect(Math.abs(bounds.y+bounds.height-viewportHeight)).toBeLessThanOrEqual(1)

  await page.getByRole('button',{name:'Ir ao final da prévia'}).click()
  await expect(page.locator('.preview-end-marker')).toBeInViewport()
  const scrolled=await page.locator('.preview-scroll').evaluate(el=>({
    top:el.scrollTop, height:el.clientHeight, content:el.scrollHeight
  }))
  expect(scrolled.content).toBeGreaterThan(scrolled.height)
  expect(scrolled.top).toBeGreaterThan(0)
})

test('regras do schema são salvas no popup e cancelar descarta o rascunho',async({page})=>{
  await page.getByRole('button',{name:'Editar regras do schema'}).click()
  const dialog=page.getByRole('dialog',{name:'Regras do schema'})
  await expect(dialog).toBeVisible()
  await dialog.locator('textarea').fill('Rascunho não salvo')
  await dialog.getByRole('button',{name:'Cancelar'}).click()
  await page.getByRole('button',{name:'Editar regras do schema'}).click()
  await expect(dialog.locator('textarea')).toHaveValue('')
  await dialog.locator('textarea').fill('Regra do schema salva.')
  await dialog.getByRole('button',{name:'Salvar regras'}).click()
  await page.getByRole('button',{name:'Editar regras do schema'}).click()
  await expect(dialog.locator('textarea')).toHaveValue('Regra do schema salva.')
})


test('painel fixo permanece completo no fim da página em tela larga',async({page})=>{
  await page.setViewportSize({width:1750,height:896})
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(600)

  const metrics=await page.evaluate(()=>{
    const box=selector=>document.querySelector(selector).getBoundingClientRect()
    const panel=box('aside.preview')
    const content=box('aside.preview .code-preview')
    const scroll=box('aside.preview .preview-scroll')
    const editor=box('main.editor')
    const header=box('header.topbar')
    return {
      position:getComputedStyle(document.querySelector('aside.preview')).position,
      top:panel.top,bottom:panel.bottom,right:panel.right,width:panel.width,
      contentBottom:content.bottom,scrollBottom:scroll.bottom,
      editorRight:editor.right,headerRight:header.right,
      viewportHeight:innerHeight,viewportWidth:innerWidth
    }
  })
  expect(metrics.position).toBe('fixed')
  expect(metrics.top).toBeCloseTo(0,0)
  expect(metrics.bottom).toBeCloseTo(metrics.viewportHeight,0)
  expect(metrics.right).toBeCloseTo(metrics.viewportWidth,0)
  expect(metrics.width).toBe(380)
  expect(metrics.contentBottom).toBeGreaterThan(metrics.viewportHeight-35)
  expect(metrics.scrollBottom).toBeGreaterThan(metrics.viewportHeight-35)
  expect(metrics.editorRight).toBeLessThanOrEqual(metrics.viewportWidth-metrics.width+1)
  expect(metrics.headerRight).toBeLessThanOrEqual(metrics.viewportWidth-metrics.width+1)

  const oldScroll=await page.evaluate(()=>window.scrollY)
  await page.getByRole('button',{name:'Ir ao final da prévia'}).click()
  await expect(page.locator('.preview-end-marker')).toBeInViewport()
  expect(await page.evaluate(()=>window.scrollY)).toBe(oldScroll)
})

test('recolher e expandir prévia mantém largura reservada sem sobrepor o editor',async({page})=>{
  await page.setViewportSize({width:1750,height:896})
  const measure=()=>page.evaluate(()=>{
    const box=selector=>document.querySelector(selector).getBoundingClientRect()
    return {
      panelWidth:box('aside.preview').width,
      panelTop:box('aside.preview').top,
      panelBottom:box('aside.preview').bottom,
      editorRight:box('main.editor').right,
      headerRight:box('header.topbar').right,
      windowWidth:innerWidth
    }
  })
  const expanded=await measure()
  expect(expanded.panelWidth).toBe(380)
  await page.getByRole('button',{name:'Recolher prévia'}).click()
  const collapsed=await measure()
  expect(collapsed.panelWidth).toBe(48)
  expect(collapsed.editorRight).toBeGreaterThan(expanded.editorRight)
  expect(collapsed.headerRight).toBeGreaterThan(expanded.headerRight)
  expect(collapsed.editorRight).toBeLessThanOrEqual(collapsed.windowWidth-48+1)
  expect(collapsed.panelTop).toBe(0)
  expect(collapsed.panelBottom).toBe(896)

  await page.getByRole('button',{name:'Expandir prévia'}).click()
  const reopened=await measure()
  expect(reopened.panelWidth).toBe(380)
  expect(reopened.editorRight).toBeCloseTo(expanded.editorRight,0)
  expect(reopened.headerRight).toBeCloseTo(expanded.headerRight,0)
})

test('em telas menores o painel volta ao fluxo e não cobre o cabeçalho',async({page})=>{
  await page.setViewportSize({width:1199,height:800})
  const measure=()=>page.evaluate(()=>{
    const panel=document.querySelector('aside.preview')
    const panelBox=panel.getBoundingClientRect()
    const headerBox=document.querySelector('header.topbar').getBoundingClientRect()
    const editorBox=document.querySelector('main.editor').getBoundingClientRect()
    return {
      position:getComputedStyle(panel).position,
      panelWidth:panelBox.width,panelTop:panelBox.top,
      headerRight:headerBox.right,
      editorBottom:editorBox.bottom,
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth
    }
  })
  let metrics=await measure()
  expect(metrics.position).toBe('relative')
  expect(metrics.headerRight).toBeCloseTo(1199,0)
  expect(metrics.panelWidth).toBeCloseTo(1199,0)
  expect(metrics.panelTop).toBeGreaterThanOrEqual(metrics.editorBottom-1)
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)

  await page.setViewportSize({width:390,height:780})
  metrics=await measure()
  expect(metrics.position).toBe('relative')
  expect(metrics.headerRight).toBeCloseTo(390,0)
  expect(metrics.panelWidth).toBeCloseTo(390,0)
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
})
