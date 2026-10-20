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
  await page.locator('input[type="file"]').setInputFiles({
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
  expect(Math.abs(bounds.height-900)).toBeLessThanOrEqual(1)
  expect(Math.abs(bounds.y+bounds.height-900)).toBeLessThanOrEqual(1)

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
