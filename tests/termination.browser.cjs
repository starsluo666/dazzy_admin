// Mock-only regression. No payment, database or channel API can be reached.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5194'

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
    const errors = [], writes = []
    let canApprove = false
    let item = { public_id: '1', case_no: 'AS-TERMINATION', case_type: 'early_termination', case_type_label: '提前终止服务',
      status: 'pending', status_label: '待处理', requires_supervisor: false, order_no: 'DZY-TERMINATION',
      order_status: 'after_sales', order_status_label: '售后中', order_payable_amount: 16800,
      customer_name: '测试用户', provider_name: '测试达人', service_name: '桌球', service_city_name: '邯郸市',
      requested_amount: 16800, approved_amount: null, reason: '服务中途离场，请平台核定退款', evidence_urls: [],
      result_note: '', creator_name: '测试用户', created_at: '2026-10-08T01:30:00Z',
      termination: { requested_by: 'customer', reported_ended_at: '2026-10-08T02:00:00Z', service_started_at: '2026-10-08T01:00:00Z',
        scheduled_ends_at: '2026-10-08T03:00:00Z', refundable_components: { service: 15000, transport: 1800, other: 0 },
        finance_state: 'review_pending', finance_label: '待客服核定' } }
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname
      if (!path.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      let data = { items: [], pagination: { total: 0 }, summary: {} }
      if (path.endsWith('/auth/refresh/')) data = { access: 'offline-token' }
      else if (path.endsWith('/admin/me/')) data = { user: { nickname: '测试客服' }, permissions: ['dashboard.view', 'order.after_sales.view', 'order.after_sales.review', ...(canApprove ? ['refund.supervise'] : [])], role_name: '客服', data_scope: 'all', city_codes: [] }
      else if (path.endsWith('/admin/work/summary/')) data = { viewer: 'offline', todos: [], total: 0, unread_count: 0, overdue_count: 0 }
      else if (path.endsWith('/admin/refund-policy/')) data = { single_limit: 100000, daily_limit: 100000, daily_used: 0, daily_remaining: 100000, can_approve: true, supervisor: true }
      else if (path.includes('/refund-context/')) data = { paid: 16800, remaining: 16800, refunded: 0, occupied: 0, components: [], policy: { supervisor: true } }
      else if (path.endsWith('/AS-TERMINATION/action/')) {
        assert.equal(req.method(), 'POST')
        writes.push(req.postDataJSON())
        item = { ...item, status: 'approved', status_label: '已同意·待退款', order_status: 'terminated', order_status_label: '已提前终止', approved_amount: 8400,
          result_note: writes[0].result_note, termination: { ...item.termination, finance_state: 'refund_pending', finance_label: '退款处理中，剩余款暂停结算',
            decision: { ...writes[0], responsibility_label: '达人责任' } } }
        data = item
      } else if (path.endsWith('/AS-TERMINATION/')) data = item
      else if (path.endsWith('/order-after-sales/')) data = { items: [item], pagination: { total: 1 }, summary: { total: 1, pending: 1, processing: 0, approved: 0, refunded: 0 } }
      await route.fulfill({ json: { data } })
    })
    await page.goto(`${base}/#/after-sales`)
    await page.locator('.el-table__body-wrapper tr').first().click()
    await page.getByRole('heading', { name: '退款售后详情' }).waitFor()
    assert.equal(await page.getByRole('button', { name: '核定终止与退款' }).count(), 0)
    canApprove = true
    await page.reload()
    await page.locator('.el-table__body-wrapper tr').first().click()
    await page.getByRole('button', { name: '核定终止与退款' }).click()
    const dialog = page.getByRole('dialog', { name: '核定提前终止服务', exact: true })
    await dialog.getByText('不按服务时间自动折半退款', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: '确认终止裁定', exact: true }).click()
    assert.equal(writes.length, 0)
    await dialog.locator('.el-select').click()
    await page.getByRole('option', { name: '达人责任', exact: true }).click()
    for (const [index, value] of ['75', '9', '0'].entries()) await dialog.getByRole('spinbutton').nth(index).fill(value)
    await dialog.locator('textarea').fill('双方确认服务中断，服务费退75元，路费退9元')
    await page.locator('.el-message').waitFor({ state: 'hidden' })
    const screenshot = require('node:path').join(require('node:os').tmpdir(), 'dazzy-termination-review.png')
    await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' })
    console.log(`Preview: ${screenshot}`)
    await dialog.getByRole('button', { name: '确认终止裁定', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '确认终止裁定', exact: true })
    await confirmation.waitFor()
    assert.equal(writes.length, 0, 'Cannot mutate before explicit confirmation')
    await confirmation.getByRole('button', { name: '确认裁定', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(writes.length, 1)
    assert.equal(writes[0].action, 'resolve_termination')
    assert.deepEqual(writes[0].component_refunds, { service: 7500, transport: 900, other: 0 })
    assert.equal(writes[0].responsibility, 'provider')
    await page.getByText('退款处理中，剩余款暂停结算', { exact: true }).waitFor()
    await page.getByText('已提前终止', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    console.log('PASS termination permissions, mandatory decisions, component amounts, confirmation and separated service/refund states')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
