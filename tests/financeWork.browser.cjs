// Offline browser contract: every API is mocked; no real money or notification requests.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5194'
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = [], financeRequests = [], taskRequests = [], writes = []
    let fail = false, resolved = false
    const labels = { distribution_attention: '分账结果待核查', income_reconciliation: '达人余额核账', withdrawal_attention: '提现结果及流水待核查', critical_tasks: '关键任务失败或超时' }
    const summary = () => ({ viewer: 'offline-finance', total: 4, unread_count: 4, overdue_count: 0, updated_at: new Date().toISOString(),
      todos: Object.entries(labels).map(([key, label]) => ({ key, label, group: key === 'critical_tasks' ? 'system' : 'finance', priority: 'high',
        count: 1, unread_count: 1, overdue_count: 0, oldest_at: new Date().toISOString(), reminder_hours: 1, signals: [`${key}:1:open`],
        target: { page: key === 'critical_tasks' ? 'tasks' : 'finance_alerts', query: { todo: key } } })) })
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      if (req.method() !== 'GET' && !url.pathname.endsWith('/auth/refresh/')) writes.push(url.pathname)
      let data = { items: [], pagination: { total: 0 }, summary: {} }
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'offline-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = { user: { nickname: '财务测试', phone: '' }, organization: null, permissions: ['*'], role_name: '管理员', data_scope: 'all', city_codes: [] }
      else if (url.pathname.endsWith('/admin/work/summary/')) data = summary()
      else if (url.pathname.endsWith('/admin/overview/')) data = { metrics: {}, trend: { days: 7, points: [] }, todos: summary().todos }
      else if (url.pathname.endsWith('/admin/work/finance/')) {
        financeRequests.push(Object.fromEntries(url.searchParams))
        if (fail) return route.fulfill({ status: 503, json: { detail: '暂时无法读取核查记录' } })
        const wallet = url.searchParams.get('queue') === 'income_reconciliation'
        data = { total: resolved ? 0 : 1, page: 1, page_size: 20, items: resolved ? [] : [{ id: '42', reference: wallet ? '测试达人' : 'SPLIT-TEST-42', provider_name: '测试达人', city_code: '130400', amount: 7000, status: 'unknown', status_label: '分账结果待核实', reason: '请核对原流水，禁止重新分账。', last_queried_at: null, order_no: wallet ? '' : 'DZY-TEST-42', checks: wallet ? [{ label: '可用余额', actual: 7000, expected: 6000 }] : [] }] }
      } else if (url.pathname.endsWith('/admin/tasks/')) {
        taskRequests.push(Object.fromEntries(url.searchParams))
        data = { items: [], pagination: { total: 0 }, summary: { total: 0, pending: 0, running: 0, succeeded_today: 0, failed: 0, overdue: 0 }, task_types: [], statuses: [] }
      }
      await route.fulfill({ json: { data } })
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/#/finance-alerts?todo=distribution_attention&work_id=42&search=SPLIT-TEST-42`)
    await page.getByRole('heading', { name: '资金异常核查', exact: true }).waitFor()
    await page.getByRole('button', { name: '核查详情', exact: true }).click()
    await page.getByText('请核对原流水，禁止重新分账。', { exact: true }).waitFor()
    assert.equal(financeRequests.at(-1).work_id, '42')
    assert.equal(financeRequests.at(-1).queue, 'distribution_attention')
    assert.equal(await page.getByRole('button', { name: /补账|解除冻结|重新分账|重试提现/ }).count(), 0)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '查看全部记录', exact: true }).click()
    await page.waitForURL('**/#/finance-alerts')
    await page.getByRole('button', { name: '核查详情', exact: true }).waitFor()
    assert.equal(financeRequests.at(-1).work_id, undefined)
    await page.locator('.work-controls .el-select__wrapper').click()
    await page.getByRole('option', { name: '达人余额核账', exact: true }).click()
    await page.getByRole('button', { name: '核查详情', exact: true }).click()
    await page.locator('.balance-checks .mismatch').waitFor()
    assert.match(await page.locator('.balance-checks').innerText(), /70\.00/)
    assert.match(await page.locator('.balance-checks').innerText(), /60\.00/)
    {
      await page.getByRole('dialog', { name: '资金核查详情' }).evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))) })
      const screenshot = process.env.TEST_SCREENSHOT || require('node:path').join(require('node:os').tmpdir(), 'dazzy-finance-work-preview.png')
      await page.screenshot({ path: screenshot, fullPage: true })
      console.log(`Preview: ${screenshot}`)
    }
    await page.keyboard.press('Escape')
    fail = true
    await page.getByRole('button', { name: '刷新本地记录', exact: true }).click()
    await page.getByText('暂时无法读取核查记录', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '核查详情', exact: true }).count(), 0)
    fail = false; resolved = true
    await page.getByRole('button', { name: '刷新本地记录', exact: true }).click()
    await page.getByText('当前没有需要核查的记录', { exact: true }).waitFor()
    const taskResponse = page.waitForResponse(response => response.url().includes('/admin/tasks/'))
    await page.goto(`${base}/#/tasks?todo=critical_tasks&work_id=23&search=DZY-TEST-42`)
    await page.getByRole('heading', { name: '任务中心', exact: true }).waitFor()
    await taskResponse
    assert.equal(taskRequests.at(-1).todo, 'critical_tasks')
    assert.equal(taskRequests.at(-1).work_id, '23')
    assert.deepEqual(writes, [])
    assert.deepEqual(errors, [])
    console.log('PASS finance drill-down, local balance comparison, filter reset, failure recovery, exact task links and no writes')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
