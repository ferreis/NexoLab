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

test('menu lateral estilizado oferece Tabelas, Enum, Triggers, Functions, Diagramas e Prévia',async({page})=>{
  const trigger=page.getByRole('button',{name:'Selecionar categoria do menu lateral'})
  await expect(trigger).toHaveAttribute('aria-expanded','false')
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded','true')
  const options=page.getByRole('listbox',{name:'Categorias do menu lateral'}).getByRole('option')
  await expect(options).toHaveCount(6)
  await expect(options.nth(0)).toContainText('Tabelas')
  await expect(options.nth(1)).toContainText('Enum')
  await expect(options.nth(2)).toContainText('Triggers')
  await expect(options.nth(3)).toContainText('Functions')
  await expect(options.nth(4)).toContainText('Diagramas')
  await expect(options.nth(5)).toContainText('Prévia')
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
  const original=page.locator('.columncard').filter({has:page.getByRole('button',{name:'Duplicar coluna coluna_01',exact:true})})
  await expect(original).toBeVisible()
  const actions=original.locator('.column-actions button')
  await expect(actions).toHaveCount(2)
  await expect(actions.nth(0)).toHaveAttribute('title','Duplicar coluna')
  await expect(actions.nth(1)).toHaveAttribute('title','Excluir coluna')
  await actions.nth(0).click()
  await expect(page.getByRole('heading',{name:/Colunas/})).toContainText('(76)')
  const copy=page.locator('.columncard').filter({has:page.getByRole('button',{name:'Duplicar coluna coluna_01_copia',exact:true})})
  await expect(copy).toBeVisible()
  await expect(copy.locator('.columnbody')).toBeVisible()
  await expect(copy.locator('.cardtoggle')).toContainText('TEXT')
  await expect(original.locator('.cardtoggle')).toContainText('coluna_01')
  await original.getByRole('button',{name:'Duplicar coluna coluna_01',exact:true}).click()
  await expect(page.getByRole('button',{name:'Duplicar coluna coluna_01_copia_2',exact:true})).toBeVisible()
  await expect(page.getByRole('heading',{name:/Colunas/})).toContainText('(77)')
  await copy.getByRole('button',{name:'Excluir coluna coluna_01_copia',exact:true}).click()
  await expect(page.getByRole('button',{name:'Duplicar coluna coluna_01_copia',exact:true})).toHaveCount(0)
  await expect(original).toBeVisible()
  await expect(page.getByRole('heading',{name:/Colunas/})).toContainText('(76)')
})

test('duplicar coluna id preserva PK original e não marca PK na cópia',async({page})=>{
  await page.getByRole('button',{name:/ID e datas padrão/}).click()
  const id=page.locator('.columncard').filter({has:page.getByRole('button',{name:'Duplicar coluna id',exact:true})})
  await expect(id.locator('.columnbadge')).toContainText(['PK','NOT NULL','Imutável','UNIQUE'])
  await id.getByRole('button',{name:'Duplicar coluna id',exact:true}).click()
  const copy=page.locator('.columncard').filter({has:page.getByRole('button',{name:'Duplicar coluna id_copia',exact:true})})
  await expect(copy).toBeVisible()
  await expect(copy.locator('.columnbadge').filter({hasText:'PK'})).toHaveCount(0)
  await expect(copy.locator('.columnbadge').filter({hasText:'UNIQUE'})).toHaveCount(0)
  await expect(page.locator('.columncard .columnbadge').filter({hasText:'PK'})).toHaveCount(1)
})


const diagramSample={
  schema_alvo:'public',
  tabelas:[
    {nome:'clientes',colunas:[
      {nome:'id',tipo:'BIGINT',pk:true},
      {nome:'nome',tipo:'TEXT',nullable:false}
    ]},
    {nome:'pedidos',colunas:[
      {nome:'id',tipo:'BIGINT',pk:true},
      {nome:'cliente_id',tipo:'BIGINT',fk:true,fkTabela:'clientes',fkColuna:'id',nullable:false},
      {nome:'responsavel_id',tipo:'BIGINT',fk:true,fkTabela:'externa',fkColuna:'id',nullable:true}
    ]},
    {nome:'categorias',colunas:[{nome:'titulo',tipo:'TEXT'}]}
  ]
}
async function openDiagrams(page){
  await page.evaluate(data=>localStorage.setItem('modelador-rpg-vue-v2',JSON.stringify(data)),diagramSample)
  await page.reload()
  await page.getByRole('button',{name:'Selecionar categoria do menu lateral'}).click()
  await page.getByRole('option',{name:'Diagramas'}).click()
  await expect(page.locator('.diagram-board')).toBeVisible()
}
test('visualiza mapa Mermaid de FKs, permite zoom e copia código sem sair do app',async({page,context})=>{
  await openDiagrams(page)
  const stage=page.getByRole('region',{name:/Mapa interativo/})
  const img=stage.locator('img')
  await expect(img).toHaveAttribute('src',/^blob:/,{timeout:30000})
  await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>0),{timeout:30000}).toBe(true)
  await expect(page.locator('.diagram-counts')).toContainText('3 tabela(s) · 2 ligação(ões)')
  await expect(page.locator('.diagram-warning')).toHaveCount(0)
  await page.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button',{name:'Código'}).click()
  const code=page.locator('.diagram-code-stage code')
  await expect(code).toContainText('flowchart LR')
  await expect(code).toContainText('cliente_id → id')
  await expect(code).toContainText('não encontrada')
  await expect(page.locator('.diagram-stage')).toBeHidden()
  const mermaidCode=await code.textContent()
  await page.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button',{name:'Ligações'}).click()
  await expect(page.locator('.diagram-stage')).toBeVisible()
  const before=await page.locator('.diagram-zoom').textContent()
  await page.getByRole('button',{name:'Aumentar zoom'}).click()
  await expect(page.locator('.diagram-zoom')).not.toHaveText(before)
  await page.getByRole('button',{name:'Ajustar diagrama à tela'}).click()
  await context.grantPermissions(['clipboard-read','clipboard-write'])
  await page.getByRole('button',{name:'Copiar Mermaid'}).click()
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(mermaidCode)
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'Baixar .mmd'}).click()
  expect((await download).suggestedFilename()).toBe('nexodb-ligacoes.mmd')
})
test('diagrama ER exibe campos PK/FK, aceita seleção de tabela e exporta SVG',async({page})=>{
  await openDiagrams(page)
  await page.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button',{name:'Banco ER'}).click()
  await page.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button',{name:'Código'}).click()
  const code=page.locator('.diagram-code-stage code')
  await expect(code).toContainText('erDiagram')
  await expect(code).toContainText('BIGINT cliente_id FK')
  await expect(code).toContainText('BIGINT id PK')
  await page.getByRole('group',{name:'Direção do diagrama'}).getByRole('button',{name:'Vertical'}).click()
  await expect(code).toContainText('direction TB')
  await page.getByRole('navigation',{name:'Tabelas para diagrama'}).getByRole('button',{name:/pedidos/}).click()
  await expect(page.getByRole('group',{name:'Escopo do diagrama'}).getByRole('button',{name:'Tabela e ligações'})).toHaveAttribute('aria-pressed','true')
  await expect(code).not.toContainText('categorias')
  await expect(code).toContainText('clientes')
  await page.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button',{name:'Banco ER'}).click()
  await expect.poll(()=>page.locator('.diagram-stage img').evaluate(el=>el.complete&&el.naturalWidth>0),{timeout:30000}).toBe(true)
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'SVG',exact:true}).click()
  expect((await download).suggestedFilename()).toBe('nexodb-banco-er.svg')
  const pngDownload=page.waitForEvent('download')
  await page.getByRole('button',{name:'PNG',exact:true}).click()
  await page.waitForTimeout(500)
  const pngError=await page.locator('.diagram-message').allTextContents()
  if(pngError.some(message=>message.includes('Não foi possível gerar o PNG')))throw new Error(pngError.join('; '))
  expect((await pngDownload).suggestedFilename()).toBe('nexodb-banco-er.png')
})
test('diagramas preservam layout sem rolagem horizontal em desktop e celular',async({page})=>{
  await openDiagrams(page)
  const image=page.locator('.diagram-stage img')
  await expect(image).toBeVisible({timeout:30000})
  await expect.poll(()=>image.evaluate(el=>el.complete&&el.naturalWidth>0),{timeout:30000}).toBe(true)
  for(const width of [1440,767,390]){
    await page.setViewportSize({width,height:900})
    const size=await page.evaluate(()=>({
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      stageWidth:document.querySelector('.diagram-stage').getBoundingClientRect().width,
      imgCount:document.querySelectorAll('.diagram-stage img').length
    }))
    expect(size.documentWidth).toBeLessThanOrEqual(size.viewportWidth)
    expect(size.stageWidth).toBeGreaterThan(150)
    expect(size.imgCount).toBe(1)
  }
})

test('toolbar reúne Visualização, Direção e Tema; rodapé reúne exportações sem textos removidos',async({page})=>{
  await openDiagrams(page)
  const toolbar=page.locator('.diagram-toolbar')
  const footer=page.locator('.diagram-board-footer')
  await expect(toolbar.getByRole('group',{name:'Tipo de diagrama'})).toBeVisible()
  await expect(toolbar.getByRole('group',{name:'Direção do diagrama'})).toBeVisible()
  await expect(toolbar.getByRole('group',{name:'Tema do diagrama'})).toBeVisible()
  await expect(toolbar.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button')).toHaveCount(3)
  await expect(footer.getByRole('button',{name:'Copiar Mermaid'})).toBeVisible()
  await expect(footer.getByRole('button',{name:'Baixar .mmd'})).toBeVisible()
  await expect(footer.getByRole('button',{name:'SVG',exact:true})).toBeVisible()
  await expect(footer.getByRole('button',{name:'PNG',exact:true})).toBeVisible()
  await expect(page.locator('.diagram-source')).toHaveCount(0)
  await expect(page.locator('.diagram-export')).toHaveCount(0)
  await expect(page.getByText('Projetos PostgreSQL e Supabase, sem alterar o banco')).toHaveCount(0)
  await expect(page.getByText('Diagramas Mermaid', {exact:true})).toHaveCount(0)
  await expect(page.getByText('Explore as ligações entre tabelas ou a estrutura do banco. Atualização automática, sem conexão com o PostgreSQL.')).toHaveCount(0)
  await expect(page.getByText('O diagrama ER apresenta PK, FK, UNIQUE individual e nulidade. CHECKs, UNIQUEs compostos e triggers continuam disponíveis no editor e no JSON do projeto.')).toHaveCount(0)
})
test('aba Código substitui o mapa e mantém o tipo ER, direção e código ao alternar',async({page})=>{
  await openDiagrams(page)
  const tabs=page.getByRole('group',{name:'Tipo de diagrama'})
  await tabs.getByRole('button',{name:'Banco ER'}).click()
  await page.getByRole('group',{name:'Direção do diagrama'}).getByRole('button',{name:'Vertical'}).click()
  await tabs.getByRole('button',{name:'Código'}).click()
  await expect(tabs.getByRole('button',{name:'Código'})).toHaveAttribute('aria-pressed','true')
  await expect(page.locator('.diagram-stage')).toBeHidden()
  await expect(page.locator('.diagram-toolbar-actions')).toHaveCount(0)
  const code=page.getByRole('region',{name:'Código Mermaid do diagrama'}).locator('code')
  await expect(code).toContainText('erDiagram')
  await expect(code).toContainText('direction TB')
  await expect(code).toContainText('BIGINT cliente_id FK')
  await tabs.getByRole('button',{name:'Banco ER'}).click()
  await expect(page.locator('.diagram-stage')).toBeVisible()
  await expect(page.locator('.diagram-code-stage')).toHaveCount(0)
  await tabs.getByRole('button',{name:'Código'}).click()
  await expect(code).toContainText('erDiagram')
  await expect(code).toContainText('direction TB')
  await tabs.getByRole('button',{name:'Ligações'}).click()
  await tabs.getByRole('button',{name:'Código'}).click()
  await expect(code).toContainText('flowchart TB')
  await expect(code).not.toContainText('erDiagram')
})
test('código Mermaid tem rolagem interna em telas estreitas, sem ampliar largura do documento',async({page})=>{
  await openDiagrams(page)
  await page.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button',{name:'Código'}).click()
  for(const width of [1440,767,390]){
    await page.setViewportSize({width,height:900})
    const size=await page.evaluate(()=>{
      const stage=document.querySelector('.diagram-code-stage')
      return {
        documentWidth:document.documentElement.scrollWidth,
        viewportWidth:innerWidth,
        stageWidth:stage.getBoundingClientRect().width,
        scrollWidth:stage.scrollWidth
      }
    })
    expect(size.documentWidth).toBeLessThanOrEqual(size.viewportWidth)
    expect(size.stageWidth).toBeGreaterThan(150)
    expect(size.scrollWidth).toBeGreaterThanOrEqual(Math.floor(size.stageWidth))
  }
})

test('diagrama usa toda a área útil entre cabeçalho, barra lateral e bordas da janela',async({page})=>{
  await openDiagrams(page)
  for(const {width,height} of [{width:1741,height:864},{width:1440,height:900},{width:1024,height:768},{width:768,height:700}]){
    await page.setViewportSize({width,height})
    await expect.poll(()=>page.evaluate(()=>{
      const board=document.querySelector('.diagram-board').getBoundingClientRect()
      const header=document.querySelector('.topbar').getBoundingClientRect()
      return Math.abs(board.top-header.bottom)+Math.abs(board.bottom-innerHeight)
    })).toBeLessThan(2)
    const metrics=await page.evaluate(()=>{
      const board=document.querySelector('.diagram-board').getBoundingClientRect()
      const sidebar=document.querySelector('.sidebar').getBoundingClientRect()
      const stage=document.querySelector('.diagram-stage').getBoundingClientRect()
      const toolbar=document.querySelector('.diagram-toolbar').getBoundingClientRect()
      const footer=document.querySelector('.diagram-board-footer').getBoundingClientRect()
      return {
        boardLeft:board.left,boardRight:board.right,boardBottom:board.bottom,
        sidebarRight:sidebar.right,stageHeight:stage.height,
        toolbarTop:toolbar.top,footerBottom:footer.bottom,
        scrollHeight:document.documentElement.scrollHeight,
        scrollWidth:document.documentElement.scrollWidth
      }
    })
    expect(metrics.boardLeft).toBeCloseTo(metrics.sidebarRight,0)
    expect(metrics.boardRight).toBeCloseTo(width,0)
    expect(metrics.boardBottom).toBeCloseTo(height,0)
    expect(metrics.stageHeight).toBeGreaterThan(100)
    expect(metrics.footerBottom).toBeCloseTo(height,0)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width)
    expect(await page.evaluate(()=>getComputedStyle(document.documentElement).overflowY)).toBe('hidden')
    await page.locator('.topbar').hover()
    await page.mouse.wheel(0,900)
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0)
  }
  await page.getByRole('button',{name:'Recolher barra lateral'}).click()
  await expect.poll(()=>page.locator('.diagram-board').evaluate(el=>el.getBoundingClientRect().left)).toBeCloseTo(48,0)
  await expect(page.locator('.diagram-stage')).toBeVisible()
  await page.getByRole('button',{name:'Expandir tabelas'}).click()
  await expect.poll(()=>page.evaluate(()=>{
    const board=document.querySelector('.diagram-board').getBoundingClientRect()
    const sidebar=document.querySelector('.sidebar').getBoundingClientRect()
    return Math.abs(board.left-sidebar.right)
  })).toBeLessThan(1)
})
test('sem aviso de FK externa, o Mermaid mantém a referência e a visão Código ocupa a área disponível',async({page})=>{
  await openDiagrams(page)
  await expect(page.getByText(/FKs sem tabela correspondente no modelo/)).toHaveCount(0)
  await expect(page.locator('.diagram-warning')).toHaveCount(0)
  await page.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button',{name:'Código'}).click()
  const code=page.locator('.diagram-code-stage code')
  await expect(code).toContainText('externa')
  await expect(code).toContainText('não encontrada')
  const metrics=await page.evaluate(()=>{
    const board=document.querySelector('.diagram-board').getBoundingClientRect()
    const stage=document.querySelector('.diagram-code-stage').getBoundingClientRect()
    const toolbar=document.querySelector('.diagram-toolbar').getBoundingClientRect()
    const footer=document.querySelector('.diagram-board-footer').getBoundingClientRect()
    return {stageTop:stage.top,stageBottom:stage.bottom,stageLeft:stage.left,stageRight:stage.right,toolbarBottom:toolbar.bottom,footerTop:footer.top,boardRight:board.right}
  })
  expect(metrics.stageTop).toBeCloseTo(metrics.toolbarBottom,0)
  expect(metrics.stageBottom).toBeCloseTo(metrics.footerTop,0)
  expect(metrics.stageRight).toBeCloseTo(metrics.boardRight,0)
})
test('diagrama sem margens laterais no celular e sem rolagem horizontal',async({page})=>{
  await openDiagrams(page)
  for(const {width,height} of [{width:767,height:900},{width:390,height:850}]){
    await page.setViewportSize({width,height})
    const metrics=await page.evaluate(()=>{
      const board=document.querySelector('.diagram-board').getBoundingClientRect()
      const editor=document.querySelector('.diagram-editor').getBoundingClientRect()
      const sidebar=document.querySelector('.sidebar').getBoundingClientRect()
      return {boardLeft:board.left,boardRight:board.right,boardTop:board.top,editorTop:editor.top,sidebarBottom:sidebar.bottom,scrollWidth:document.documentElement.scrollWidth}
    })
    expect(metrics.boardLeft).toBeCloseTo(0,0)
    expect(metrics.boardRight).toBeCloseTo(width,0)
    expect(metrics.boardTop).toBeGreaterThanOrEqual(metrics.sidebarBottom-1)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width)
  }
})

test('Banco ER com modelo vazio mantém Mermaid válido e não exibe erro de sintaxe',async({page})=>{
  await page.evaluate(()=>localStorage.setItem('modelador-rpg-vue-v2',JSON.stringify({schema_alvo:'public',tabelas:[]})))
  await page.reload()
  await page.getByRole('button',{name:'Selecionar categoria do menu lateral'}).click()
  await page.getByRole('option',{name:'Diagramas'}).click()
  await page.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button',{name:'Banco ER'}).click()
  await page.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button',{name:'Código'}).click()
  const code=page.locator('.diagram-code-stage code')
  await expect(code).toContainText('erDiagram')
  await expect(code).not.toContainText('SEM_TABELAS[')
  await page.getByRole('group',{name:'Tipo de diagrama'}).getByRole('button',{name:'Banco ER'}).click()
  await expect(page.locator('.diagram-error')).toHaveCount(0)
  await expect(page.locator('.diagram-stage img')).toHaveAttribute('src',/^blob:/,{timeout:30000})
})

test('transferência move CHECK importado e trigger com função sem perder o vínculo SQL',async({page})=>{
  const check='CONSTRAINT fichas_forca_check CHECK (forca >= 0)'
  const functionSql="CREATE OR REPLACE FUNCTION rpg.validar_forca() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF NEW.forca < 0 THEN RAISE EXCEPTION 'negativo'; END IF; RETURN NEW; END; $fn$;"
  const triggerSql='CREATE TRIGGER valida_forca BEFORE UPDATE ON rpg.fichas FOR EACH ROW EXECUTE FUNCTION rpg.validar_forca();'
  const model={schema_alvo:'rpg',funcoesSql:[functionSql],tabelas:[
    {nome:'fichas',colunas:[{nome:'forca',tipo:'SMALLINT',checks:[{expressao:'forca >= 0',origemRestricao:check}]},{nome:'nome',tipo:'TEXT',checks:[]}],sqlRestricoes:[check],sqlTriggers:[triggerSql]},
    {nome:'atributos',colunas:[{nome:'codigo',tipo:'INTEGER',checks:[]}]}
  ]}
  await page.evaluate(value=>localStorage.setItem('modelador-rpg-vue-v2',JSON.stringify(value)),model)
  await page.reload()
  await page.getByRole('button',{name:'Transferir colunas'}).click()
  const dialog=page.getByRole('dialog',{name:'Transferir colunas'})
  await expect(dialog).toBeVisible()
  await dialog.getByRole('group',{name:'Colunas da tabela de origem'}).getByRole('checkbox').first().check()
  await dialog.getByRole('checkbox',{name:/Confirmo que 1 coluna/}).check()
  await dialog.getByRole('button',{name:'Transferir 1 coluna(s)'}).click()
  await expect(dialog).not.toBeVisible()
  await expect.poll(()=>page.evaluate(()=>{
    const doc=JSON.parse(localStorage.getItem('modelador-rpg-vue-v2'))
    return {
      source:doc.tabelas.find(t=>t.nome==='fichas').colunas.map(c=>c.nome),
      dest:doc.tabelas.find(t=>t.nome==='atributos').colunas.map(c=>c.nome),
      destChecks:doc.tabelas.find(t=>t.nome==='atributos').sqlRestricoes.length,
      destTriggers:doc.tabelas.find(t=>t.nome==='atributos').sqlTriggers.length,
      functionCount:doc.funcoesSql.length
    }
  }))).toEqual({source:['nome'],dest:['codigo','forca'],destChecks:1,destTriggers:1,functionCount:1})
  const next=await page.evaluate(()=>JSON.parse(localStorage.getItem('modelador-rpg-vue-v2')))
  const target=next.tabelas.find(t=>t.nome==='atributos')
  expect(target.sqlTriggers[0]).toContain('ON rpg."atributos"')
  expect(target.colunas.find(c=>c.nome==='forca').checks[0].origemRestricao).toBe(check)
})
