// Local synthetic fixtures only: never contact production or a payment service.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5196'
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = [], writes = []
    let permissions = ['finance.recovery.view', 'finance.recovery.manage']
    let status = 'open', revision = 1, exists = false
    const row = () => ({
      id: 1, case_no: 'OFFLINE-CASE', kind: 'pool', kind_label: '平台余额付款暂停', target_id: 8,
      reference: '平台付款账户 #8', status, status_label: status === 'review' ? '待独立复核' : '待核查',
      revision, resolution: 'record', created_at: '2026-10-20T05:00:00Z', queried_at: null,
      current_state: '已暂停', current_reason: '余额付款失败，等待核账。', current_amount: null,
      events: [{ action: 'create', actor: '离线财务', note: '核查付款暂停', evidence_reference: '', created_at: '2026-10-20T05:00:00Z' }],
    })
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      if (req.method() !== 'GET' && !url.pathname.endsWith('/auth/refresh/')) writes.push([url.pathname, req.postDataJSON()])
      let data
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'offline-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = {
        user: { nickname: '离线财务', phone: '' }, organization: null, permissions,
        role_name: '财务', data_scope: 'all', city_codes: [],
      }
      else if (url.pathname.endsWith('/admin/work/summary/')) data = { total: 0, unread_count: 0, todos: [] }
      else if (url.pathname.endsWith('/admin/finance-recovery/')) {
        if (req.method() === 'POST') { exists = true; data = row() }
        else data = {
          items: exists ? [row()] : [], total: exists ? 1 : 0, pools_total: 1, recovery_enabled: false,
          pools: [{ id: 8, reference: '平台付款账户 #8', reason: '余额付款失败，等待核账。' }],
        }
      } else if (url.pathname.endsWith('/admin/finance-recovery/1/')) {
        if (req.method() === 'POST') {
          const p = req.postDataJSON()
          assert.equal(p.revision, revision)
          assert.equal(p.action, 'submit')
          assert.equal(p.resolution, 'record')
          assert.equal(p.evidence_reference, 'FIN-TEST-1')
          status = 'review'; revision++
        }
        data = row()
      } else if (url.pathname.endsWith('/admin/payment-job-health/')) data = { items: [{
        id: 1, key: 'providers.process_income_transfers', label: '渠道出款与提现查单',
        state: 'stale', alert: true, reason: '已超过预期执行间隔，请检查任务。',
        started_at: null, finished_at: null, succeeded_at: '2026-10-19T05:00:00Z', quiet_seconds: 300,
      }] }
      else throw new Error(`Unexpected API ${req.method()} ${url.pathname}`)
      await route.fulfill({ json: { data } })
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/#/finance-recovery?view=pools`)
    await page.getByRole('heading', { name: '资金处置与巡检', exact: true }).waitFor()
    await page.getByRole('button', { name: '登记处置单', exact: true }).waitFor()
    assert.deepEqual(writes, [])
    await page.getByRole('button', { name: '登记处置单', exact: true }).click()
    await page.getByRole('textbox', { name: '登记说明' }).fill('核查原交易失败后的账户暂停')
    await page.getByRole('button', { name: '确认登记', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '资金处置详情' })
    await drawer.getByRole('heading', { name: '平台付款账户 #8' }).waitFor()
    await drawer.getByRole('textbox', { name: '核查说明' }).fill('对照原流水，记录人工核查结果')
    await drawer.getByRole('textbox', { name: '内部凭证编号' }).fill('FIN-TEST-1')
    await drawer.getByRole('button', { name: '提交独立复核' }).click()
    await drawer.getByText('待独立复核', { exact: true }).waitFor()
    assert.equal(await drawer.getByRole('button', { name: '独立复核通过' }).count(), 0)
    assert.equal(writes.length, 2)
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden' })
    await page.getByText('支付任务巡检', { exact: true }).click()
    await page.getByText('长时间未运行', { exact: true }).waitFor()
    assert.equal(writes.length, 2)
    const screenshot = require('node:path').join(require('node:os').tmpdir(), 'dazzy-finance-recovery.png')
    await page.screenshot({ path: screenshot })
    permissions = ['finance.recovery.view']
    await page.reload()
    await page.getByText('平台付款暂停', { exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '登记处置单', exact: true }).count(), 0)
    assert.deepEqual(errors, [])
    console.log(`PASS read-only loads, explicit registration, revisioned submission, permission boundaries and job alerts; ${screenshot}`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
