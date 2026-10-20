// Local browser regression: synthetic financial data, no real network or fund writes.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5196'
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = [], writes = [], queries = []
    let permitted = true, revision = 1, status = 'open'
    const labels = { open: '待核查', processing: '核查中', review: '待复核' }
    const issue = () => ({
      id: 1, data_date: '2026-10-18', bill_label: '交易及退款账单',
      reference: 'OFFLINE-ORDER-1', message: '金额不一致，请核对原流水。',
      status, status_label: labels[status], revision,
      evidence: { local_amount: 10000, channel_amount: 9000, local_fee: null, channel_fee: 54, fields: ['金额'] },
      events: [{ action: 'detected', actor: '系统', note: '', evidence_reference: '', created_at: '2026-10-19T11:00:00Z' }],
    })
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      if (req.method() !== 'GET' && !url.pathname.endsWith('/auth/refresh/')) writes.push(url.pathname)
      let data = { items: [], pagination: { total: 0 }, summary: {} }
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'offline-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = {
        user: { nickname: '离线核查财务', phone: '' }, organization: null,
        permissions: permitted ? ['reconciliation.view', 'reconciliation.manage'] : ['reconciliation.view'],
        role_name: '财务', data_scope: 'all', city_codes: [],
      }
      else if (url.pathname.endsWith('/admin/work/summary/')) data = { total: 1, unread_count: 1, todos: [] }
      else if (url.pathname.endsWith('/admin/reconciliation/')) {
        queries.push(Object.fromEntries(url.searchParams))
        data = { total: 1, page: 1, page_size: 20, enabled: false, start_date: '',
          items: url.searchParams.get('view') === 'issues' ? [issue()] : [{
            id: 'offline-batch', data_date: '2026-10-18', bill_label: '交易及退款账单', status: 'differences',
            status_label: '存在差异或待核查项', open_count: 1, checked_at: '2026-10-19T11:00:00Z',
            summary: { channel_count: 1, matched_count: 0 },
          }],
        }
      } else if (url.pathname.endsWith('/admin/reconciliation/issues/1/')) {
        if (req.method() === 'POST') {
          const payload = req.postDataJSON()
          assert.equal(payload.revision, revision)
          assert.ok(payload.note.length >= 5)
          if (payload.action === 'start') status = 'processing'
          else {
            assert.equal(payload.action, 'submit')
            assert.equal(payload.evidence_reference, 'FIN-OFFLINE-1')
            status = 'review'
          }
          revision += 1
        }
        data = issue()
      } else throw new Error(`Unexpected API ${req.method()} ${url.pathname}`)
      await route.fulfill({ json: { data } })
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/#/reconciliation`)
    await page.getByRole('heading', { name: '每日对账', exact: true }).waitFor()
    await page.getByText('自动对账尚未启用，当前仅展示已保存的记录。').waitFor()
    await page.getByRole('button', { name: '1 项', exact: true }).click()
    await page.getByRole('button', { name: '核查详情', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '对账差异核查' })
    await drawer.getByRole('heading', { name: 'OFFLINE-ORDER-1' }).waitFor()
    assert.match(await drawer.locator('dl').innerText(), /100\.00/)
    assert.match(await drawer.locator('dl').innerText(), /90\.00/)
    assert.match(await drawer.locator('dl').innerText(), /待核实/)
    assert.ok(queries.some(q => q.batch_id === 'offline-batch' && q.view === 'issues'))
    assert.deepEqual(writes, [])
    await drawer.getByRole('textbox', { name: '核查说明' }).fill('核对渠道原流水及银行回单')
    await drawer.getByRole('button', { name: '开始核查' }).click()
    await drawer.getByRole('textbox', { name: '核账凭证' }).waitFor()
    await drawer.getByRole('textbox', { name: '核查说明' }).fill('已核对，提交独立财务复核')
    await drawer.getByRole('textbox', { name: '核账凭证' }).fill('FIN-OFFLINE-1')
    await drawer.getByRole('button', { name: '提交复核' }).click()
    await drawer.getByText('待复核', { exact: true }).waitFor()
    assert.equal(await drawer.getByRole('button', { name: '复核结案' }).count(), 0)
    assert.deepEqual(writes, Array(2).fill('/api/v1/admin/reconciliation/issues/1/'))
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '清除当前账单筛选' }).click()
    const screenshot = require('node:path').join(require('node:os').tmpdir(), 'dazzy-reconciliation.png')
    await page.screenshot({ path: screenshot })
    console.log(`Preview: ${screenshot}`)
    permitted = false; status = 'open'; revision = 1
    await page.reload()
    await page.getByRole('button', { name: '1 项', exact: true }).click()
    await page.getByRole('button', { name: '核查详情', exact: true }).click()
    await drawer.getByText('待核查', { exact: true }).waitFor()
    assert.equal(await drawer.getByRole('button', { name: '开始核查' }).count(), 0)
    assert.deepEqual(errors, [])
    console.log('PASS batch/issues navigation, amount/unknown fees, revisioned workflow, read-only permissions, no fund actions')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
