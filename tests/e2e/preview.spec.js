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

async function openPreview(page){
  await page.getByRole('button',{name:'Selecionar categoria do menu lateral'}).click()
  await page.getByRole('option',{name:'Prévia'}).click()
  await expect(page.getByRole('heading',{name:'Prévia do modelo'})).toBeVisible()
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

test('menu lateral estilizado oferece Tabelas, Enum, Triggers, Functions e Prévia',async({page})=>{
  const trigger=page.getByRole('button',{name:'Selecionar categoria do menu lateral'})
  await expect(trigger).toHaveAttribute('aria-expanded','false')
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded','true')
  const options=page.getByRole('listbox',{name:'Categorias do menu lateral'}).getByRole('option')
  await expect(options).toHaveCount(5)
  await expect(options.nth(0)).toContainText('Tabelas')
  await expect(options.nth(1)).toContainText('Enum')
  await expect(options.nth(2)).toContainText('Triggers')
  await expect(options.nth(3)).toContainText('Functions')
  await expect(options.nth(4)).toContainText('Prévia')
  await page.getByRole('option',{name:'Prévia'}).click()
  await expect(trigger).toHaveAttribute('aria-expanded','false')
  await expect(page.getByRole('heading',{name:'Prévia do modelo'})).toBeVisible()
  await expect(page.locator('aside.preview')).toHaveCount(0)
  await expect(page.locator('.workspace > aside')).toHaveCount(1)
})

test('menu abre com teclado, navega por setas e fecha com Escape ou clique externo',async({page})=>{
  const trigger=page.getByRole('button',{name:'Selecionar categoria do menu lateral'})
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  await expect(trigger).toHaveAttribute('aria-expanded','true')
  await page.keyboard.press('End')
  await expect(page.getByRole('option',{name:'Prévia'})).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading',{name:'Prévia do modelo'})).toBeVisible()
  await expect(trigger).toBeFocused()

  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(trigger).toHaveAttribute('aria-expanded','false')
  await trigger.click()
  await page.getByRole('heading',{name:'Prévia do modelo'}).click()
  await expect(trigger).toHaveAttribute('aria-expanded','false')
})

test('prévia TXT de tabela preserva quebras de linha e copia exatamente o texto exibido',async({page,context})=>{
  await openPreview(page)
  await page.getByRole('group',{name:'Conteúdo da prévia'}).getByRole('button',{name:/Tabela/}).click()
  const code=page.locator('.preview-scroll pre code')
  await expect(code).toContainText('TABELA: rpg.conhecimentos')
  const shown=await code.textContent()
  expect(shown).toContain('TABELA: rpg.conhecimentos\nDescrição: Primeira linha da descrição.\nSegunda linha da descrição.\n\nColunas:\n- coluna_01:')
  expect(shown).toContain('\n- coluna_75:')
  expect(shown).not.toContain('\\n')
  await context.grantPermissions(['clipboard-read','clipboard-write'])
  await page.getByRole('button',{name:'Copiar tabela atual'}).click()
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(shown)
})

test('prévia JSON alterna entre esquema completo e tabela selecionada',async({page})=>{
  await openPreview(page)
  await page.getByRole('group',{name:'Formato da prévia'}).getByRole('button',{name:'JSON'}).click()
  const code=page.locator('.preview-scroll pre code')
  await expect(code).toContainText('"tabelas"')
  const whole=JSON.parse(await code.textContent())
  expect(whole.tabelas).toHaveLength(1)
  await page.getByRole('group',{name:'Conteúdo da prévia'}).getByRole('button',{name:/Tabela/}).click()
  const selected=JSON.parse(await code.textContent())
  expect(selected.tabelas).toHaveLength(1)
  expect(selected.tabelas[0].nome).toBe('conhecimentos')
  await page.getByRole('group',{name:'Formato da prévia'}).getByRole('button',{name:'TXT'}).click()
  await expect(code).toContainText('TABELA: rpg.conhecimentos')
})

test('escolher tabela no menu Prévia mantém prévia aberta e voltar ao editor preserva seleção',async({page})=>{
  await openPreview(page)
  await page.getByRole('navigation',{name:'Tabelas para prévia'}).getByRole('button',{name:/conhecimentos/}).click()
  await expect(page.getByRole('group',{name:'Conteúdo da prévia'}).getByRole('button',{name:/Tabela/})).toHaveAttribute('aria-pressed','true')
  await expect(page.locator('.preview-scroll pre code')).toContainText('TABELA: rpg.conhecimentos')
  await page.getByRole('button',{name:'Editar tabelas'}).click()
  await expect(page.getByRole('heading',{name:'Estrutura da tabela'})).toBeVisible()
  await expect(page.locator('aside.sidebar .sidebar-category-name')).toHaveText('Tabelas')
  await expect(page.getByRole('heading',{name:'Prévia do modelo'})).toHaveCount(0)
})

test('prévia ocupa área central, texto tem rolagem própria e botão Fim alcança rodapé',async({page})=>{
  await page.setViewportSize({width:1750,height:896})
  await openPreview(page)
  const metrics=await page.evaluate(()=>{
    const rect=selector=>document.querySelector(selector).getBoundingClientRect()
    const preview=rect('.preview-editor')
    const sidebar=rect('aside.sidebar')
    const code=rect('.preview-page-code')
    const scroll=document.querySelector('.preview-scroll')
    return {
      previewLeft:preview.left,previewRight:preview.right,
      sidebarRight:sidebar.right,codeBottom:code.bottom,
      scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,
      viewportWidth:innerWidth,viewportHeight:innerHeight
    }
  })
  expect(metrics.previewLeft).toBeCloseTo(metrics.sidebarRight,0)
  expect(metrics.previewRight).toBeCloseTo(metrics.viewportWidth,0)
  expect(metrics.codeBottom).toBeLessThanOrEqual(metrics.viewportHeight+1)
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)
  const windowScroll=await page.evaluate(()=>window.scrollY)
  await page.getByRole('button',{name:'Ir ao final da prévia'}).click()
  await expect(page.locator('.preview-end-marker')).toBeInViewport()
  const scrolled=await page.locator('.preview-scroll').evaluate(el=>({
    top:el.scrollTop,height:el.clientHeight,content:el.scrollHeight
  }))
  expect(scrolled.top).toBeGreaterThan(0)
  expect(scrolled.top+scrolled.height).toBeGreaterThanOrEqual(scrolled.content-2)
  expect(await page.evaluate(()=>window.scrollY)).toBe(windowScroll)
})

test('prévia responsiva não cria coluna fantasma ou rolagem horizontal',async({page})=>{
  await openPreview(page)
  for(const width of [1440,1199,767,390]){
    await page.setViewportSize({width,height:850})
    const metrics=await page.evaluate(()=>{
      const sidebar=document.querySelector('aside.sidebar').getBoundingClientRect()
      const editor=document.querySelector('main.editor').getBoundingClientRect()
      return {
        documentWidth:document.documentElement.scrollWidth,
        viewportWidth:innerWidth,
        sidebarRight:sidebar.right,sidebarBottom:sidebar.bottom,
        editorLeft:editor.left,editorTop:editor.top,editorRight:editor.right,
        panelCount:document.querySelectorAll('.workspace > aside').length
      }
    })
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.panelCount).toBe(1)
    expect(metrics.editorRight).toBeCloseTo(metrics.viewportWidth,0)
    if(width>767)expect(metrics.editorLeft).toBeCloseTo(metrics.sidebarRight,0)
    else expect(metrics.editorTop).toBeGreaterThanOrEqual(metrics.sidebarBottom-1)
  }
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


test('duplicar coluna usa botão ao lado de excluir, expande a cópia e gera nome único',async({page})=>{
  const original=page.locator('.columncard').filter({has:page.getByRole('button',{name:'Duplicar coluna coluna_01'})})
  await expect(original).toBeVisible()
  const actions=original.locator('.column-actions button')
  await expect(actions).toHaveCount(2)
  await expect(actions.nth(0)).toHaveAttribute('title','Duplicar coluna')
  await expect(actions.nth(1)).toHaveAttribute('title','Excluir coluna')
  await actions.nth(0).click()
  await expect(page.getByRole('heading',{name:/Colunas/})).toContainText('(76)')
  const copy=page.locator('.columncard').filter({has:page.getByRole('button',{name:'Duplicar coluna coluna_01_copia'})})
  await expect(copy).toBeVisible()
  await expect(copy.locator('.columnbody')).toBeVisible()
  await expect(copy.locator('.cardtoggle')).toContainText('TEXT')
  await expect(original.locator('.cardtoggle')).toContainText('coluna_01')
  await original.getByRole('button',{name:'Duplicar coluna coluna_01'}).click()
  await expect(page.getByRole('button',{name:'Duplicar coluna coluna_01_copia_2'})).toBeVisible()
  await expect(page.getByRole('heading',{name:/Colunas/})).toContainText('(77)')
  await copy.getByRole('button',{name:'Excluir coluna coluna_01_copia'}).click()
  await expect(page.getByRole('button',{name:'Duplicar coluna coluna_01_copia'})).toHaveCount(0)
  await expect(original).toBeVisible()
  await expect(page.getByRole('heading',{name:/Colunas/})).toContainText('(76)')
})

test('duplicar coluna id preserva PK original e não marca PK na cópia',async({page})=>{
  await page.getByRole('button',{name:/ID e datas padrão/}).click()
  const id=page.locator('.columncard').filter({has:page.getByRole('button',{name:'Duplicar coluna id',exact:true})})
  await expect(id.locator('.columnbadge')).toContainText(['PK','NOT NULL','Imutável','UNIQUE'])
  await id.getByRole('button',{name:'Duplicar coluna id',exact:true}).click()
  const copy=page.locator('.columncard').filter({has:page.getByRole('button',{name:'Duplicar coluna id_copia'})})
  await expect(copy).toBeVisible()
  await expect(copy.locator('.columnbadge')).not.toContainText('PK')
  await expect(copy.locator('.columnbadge')).not.toContainText('UNIQUE')
  await expect(page.locator('.columncard .columnbadge').filter({hasText:'PK'})).toHaveCount(1)
})
