const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const dist = path.resolve(__dirname, '../dist')

async function main() {
  const server = http.createServer((req, res) => {
    const target = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
    if (target !== dist && !target.startsWith(dist + path.sep)) return res.writeHead(403).end()
    const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(dist, 'index.html')
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    const errors = [], walletWrites = [], categoryWrites = []
    let manage = true
    let config = { is_enabled: true, unit_face_amount: 100000, max_quantity_per_order: 10, rules_text: '消费折扣测试', updated_at: '2026-11-19T12:00:00+08:00',
      tiers: [{ min_quantity: 1, discount_rate_bps: 10000 }, { min_quantity: 2, discount_rate_bps: 9500 }, { min_quantity: 5, discount_rate_bps: 9555 }] }
    let category = { id: 1, name: '桌球', slug: 'billiards', icon_object_key: '', icon_asset_id: null, icon_url: null, city_codes: [], sort_order: 0, is_active: true,
      platform_commission_rate: '98.50', hourly_min_price_amount: 100, hourly_max_price_amount: 100000, per_session_min_price_amount: 100, per_session_max_price_amount: 100000,
      service_count: 0, active_service_count: 0, provider_count: 0, created_at: config.updated_at, updated_at: config.updated_at }
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === origin ? route.continue() : route.abort()
      let data = { items: [], pagination: { total: 0, page: 1, page_size: 20 }, counters: {} }
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'local-test-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = { user: { nickname: '测试客服', phone: '' }, organization: null, role_name: '客服', permissions: ['wallet.view', 'service_category.view', ...(manage ? ['wallet.manage', 'service_category.manage'] : [])], data_scope: 'all', city_codes: [] }
      else if (url.pathname.endsWith('/recharge-campaign/')) {
        if (req.method() !== 'GET') { const payload = req.postDataJSON(); walletWrites.push(payload); config = { ...config, ...payload } }
        data = config
      } else if (url.pathname.endsWith('/service-categories/')) {
        if (req.method() === 'POST') {
          const payload = req.postDataJSON(); categoryWrites.push(payload)
          data = { ...category, ...payload, id: 2 }
        } else data = { items: [category], pagination: { total: 1, page: 1, page_size: 20 }, summary: { total: 1, active: 1, inactive: 0, active_services: 0 } }
      } else if (url.pathname.endsWith('/service-categories/1/')) {
        const payload = req.postDataJSON(); categoryWrites.push(payload)
        category = { ...category, ...payload, platform_commission_rate: Number(payload.platform_commission_rate).toFixed(2) }
        data = category
      }
      await route.fulfill({ json: { data } })
    })
    page.on('pageerror', error => errors.push(error.message))
    const openConfig = async () => {
      await page.goto(`${origin}/#/wallets`)
      await page.reload()
      await page.getByRole('tab', { name: '充值配置', exact: true }).click()
      await page.locator('.tier-row').first().waitFor()
    }
    await openConfig()
    const inputs = page.getByRole('spinbutton', { name: '消费折扣（折）', exact: true })
    assert.equal(await inputs.nth(0).inputValue(), '10')
    assert.equal(await inputs.nth(1).inputValue(), '9.5')
    assert.equal(await inputs.nth(2).inputValue(), '9.555')
    const firstRow = page.locator('.tier-row').first()
    const quantityBox = await firstRow.locator('.el-input-number').first().boundingBox()
    const unitBox = await firstRow.locator(':scope > span').nth(1).boundingBox()
    assert.ok(unitBox.x >= quantityBox.x + quantityBox.width, 'quantity unit must remain visible beside the input')
    await page.getByRole('button', { name: '新增档位', exact: true }).click()
    assert.equal(await inputs.nth(3).inputValue(), '10')
    await inputs.nth(0).fill('')
    await inputs.nth(0).press('Tab')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await page.getByText('请填写有效的消费折扣，最高10折', { exact: true }).waitFor()
    assert.equal(walletWrites.length, 0)
    await inputs.nth(0).fill('9.5')
    await inputs.nth(0).press('Tab')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await page.getByText('充值配置已保存，仅影响新创建的充值单', { exact: true }).waitFor()
    assert.equal(walletWrites.length, 1)
    assert.deepEqual(walletWrites[0].tiers, [
      { min_quantity: 1, discount_rate_bps: 9500 }, { min_quantity: 2, discount_rate_bps: 9500 },
      { min_quantity: 5, discount_rate_bps: 9555 }, { min_quantity: 6, discount_rate_bps: 10000 },
    ])
    await inputs.nth(0).fill('10000')
    await inputs.nth(0).press('Tab')
    assert.equal(await inputs.nth(0).inputValue(), '10')
    if (process.env.TEST_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.TEST_SCREENSHOT_DIR, { recursive: true })
      await page.locator('.config-grid').screenshot({ path: path.join(process.env.TEST_SCREENSHOT_DIR, 'consumption-discount-input.png') })
    }
    await page.goto(`${origin}/#/service-categories`)
    for (const [index, valid] of ['10.00', '60.00', '35.25'].entries()) {
      await page.getByRole('button', { name: '编辑', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '编辑服务分类', exact: true })
      const rate = dialog.getByRole('textbox', { name: '平台抽成比例（%）', exact: true })
      const saveCategory = dialog.getByRole('button', { name: '保存分类', exact: true })
      if (index === 0) assert.equal(await rate.inputValue(), '98.50', 'open an existing out-of-range category safely')
      for (const invalid of ['98.50', '9.99', '60.01', '35.251', '']) {
        await rate.fill(invalid)
        await dialog.getByText('请输入 10%～60% 的抽成比例，最多两位小数', { exact: true }).waitFor()
        assert.equal(await saveCategory.isDisabled(), true)
        assert.equal(categoryWrites.length, index)
      }
      await rate.fill(valid)
      await saveCategory.click()
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(categoryWrites.at(-1).platform_commission_rate, Number(valid))
    }
    await page.getByRole('button', { name: '新增分类', exact: true }).click()
    const createDialog = page.getByRole('dialog', { name: '新增服务分类', exact: true })
    const newRate = createDialog.getByRole('textbox', { name: '平台抽成比例（%）', exact: true })
    await createDialog.getByPlaceholder('例如：桌球', { exact: true }).fill('新测试分类')
    await createDialog.getByPlaceholder('例如：billiards', { exact: true }).fill('test-category')
    await newRate.fill('98.50')
    assert.equal(await createDialog.getByRole('button', { name: '保存分类', exact: true }).isDisabled(), true)
    await newRate.fill('60')
    await createDialog.getByRole('button', { name: '保存分类', exact: true }).click()
    await createDialog.waitFor({ state: 'hidden' })
    assert.equal(categoryWrites.length, 4)
    assert.equal(categoryWrites.at(-1).platform_commission_rate, 60)
    manage = false
    await openConfig()
    assert.equal(await inputs.nth(0).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: '保存配置', exact: true }).isDisabled(), true)
    assert.deepEqual(errors, [])
    console.log('PASS: direct discount input, exact basis-point conversion, preserved precision, blank validation, category 10–60 bounds and read-only controls; mocked APIs only')
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
