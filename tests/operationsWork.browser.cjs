// All requests are mocked. No real orders, notifications or funds are changed.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5194'
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    let read = false, resolved = false, revision = 1, allow = true, summaryRequests = 0, readCalls = 0
    const errors = [], orderRequests = []
    const current = () => {
      const todo = { key: 'fulfillment_review', label: '履约异常待核查', group: 'urgent', priority: 'high',
        count: resolved ? 0 : 1, unread_count: read || resolved ? 0 : 1, overdue_count: 0,
        oldest_at: new Date().toISOString(), reminder_hours: 1,
        target: { page: 'orders', query: { todo: 'fulfillment_review' } },
        signals: read || resolved ? [] : [`fulfillment_review:1:${revision}:open`] }
      return { todos: allow ? [todo] : [], total: allow ? todo.count : 0, unread_count: allow ? todo.unread_count : 0,
        overdue_count: 0, updated_at: new Date().toISOString(), viewer: 'test-operator' }
    }
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      let data = { items: [], pagination: { total: 0 }, summary: {} }
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'offline-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = { user: { nickname: '测试运营', phone: '' }, organization: null, permissions: ['*'], role_name: '管理员', data_scope: 'all', city_codes: [] }
      else if (url.pathname.endsWith('/admin/work/summary/')) { summaryRequests++; data = current() }
      else if (url.pathname.endsWith('/admin/work/items/')) {
        if (req.method() === 'POST') { assert.equal(req.postDataJSON().object_id, '1'); read = true; readCalls++; data = { read: true } }
        else data = { items: resolved || !allow || (url.searchParams.get('unread_only') === 'true' && read) ? [] : [{
          queue: 'fulfillment_review', object_id: '1', event_version: `${revision}:open`, title: '履约异常待核查',
          reference: 'DZY-TEST-001', created_at: new Date().toISOString(), read, overdue: false,
          target: { page: 'orders', query: { todo: 'fulfillment_review', work_id: '1', search: 'DZY-TEST-001' } },
        }], total: resolved ? 0 : 1, page: 1, page_size: 20 }
      } else if (url.pathname.endsWith('/admin/overview/')) data = { metrics: {}, trend: { days: 7, points: [] }, todos: current().todos }
      else if (url.pathname.endsWith('/admin/provider-orders/')) { orderRequests.push(Object.fromEntries(url.searchParams)); data = { items: [], pagination: { total: 0 }, summary: {} } }
      await route.fulfill({ json: { data } })
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(base)
    await page.getByRole('heading', { name: '运营总览', exact: true }).waitFor()
    await page.locator('.work-row').waitFor()
    await page.locator('.dashboard-page > .el-loading-mask').waitFor({ state: 'hidden' })
    assert.match(await page.locator('.work-row').innerText(), /履约异常待核查/)
    if (process.env.TEST_SCREENSHOT) await page.screenshot({ path: process.env.TEST_SCREENSHOT.replace('.png', '-dashboard.png'), fullPage: true })
    const before = summaryRequests
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.waitForFunction(() => !!document.querySelector('.work-row'))
    await page.getByRole('button', { name: '打开运营待办通知' }).click()
    await page.locator('.inbox-items article').waitFor()
    await page.locator('.el-drawer').evaluate(async element => {
      await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})))
    })
    if (process.env.TEST_SCREENSHOT) await page.screenshot({ path: process.env.TEST_SCREENSHOT.replace('.png', '-inbox.png'), fullPage: true })
    await page.getByRole('button', { name: '标为已读' }).click()
    await page.getByRole('button', { name: '标为已读' }).waitFor({ state: 'hidden' })
    assert.equal(readCalls, 1)
    assert.match(await page.locator('.inbox-summary').innerText(), /1 项待处理/)
    assert.match(await page.locator('.inbox-summary').innerText(), /0 条未读/)
    await page.locator('.inbox-items').getByRole('button', { name: '去处理' }).click()
    await page.getByRole('heading', { name: '达人订单', exact: true }).waitFor()
    assert.equal(orderRequests.at(-1).todo, 'fulfillment_review')
    assert.equal(orderRequests.at(-1).work_id, '1')
    assert.equal(orderRequests.at(-1).search, 'DZY-TEST-001')
    await page.getByRole('button', { name: '查看全部记录', exact: true }).click()
    await page.waitForFunction(() => !location.hash.includes('todo='))
    await page.waitForTimeout(200)
    assert.equal(orderRequests.at(-1).todo, undefined)
    // New revision with the same count becomes unread; resolved item disappears.
    read = false; revision++
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.getByRole('button', { name: '打开运营待办通知' }).click()
    await page.locator('.inbox-items article.unread').waitFor()
    resolved = true
    await page.getByRole('button', { name: '刷新待办通知' }).click()
    await page.getByText('当前没有待处理事项', { exact: true }).waitFor()
    assert.ok(summaryRequests > before)
    assert.deepEqual(errors, [])
    if (process.env.TEST_SCREENSHOT) await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true })
    console.log('PASS live dashboard, inbox, read != resolved, scoped exact links, filter reset, new revision and resolution')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
