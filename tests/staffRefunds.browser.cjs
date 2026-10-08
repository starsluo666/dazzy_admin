// All API routes are mocked. This test cannot issue real refunds or access user records.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5194'

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = [], writes = []
    let approve = false, blocked = false, escalated = false
    const policy = { single_limit: 1000, daily_limit: 10000, daily_used: 9000, daily_remaining: 1000, can_approve: true, supervisor: false, timezone: 'Asia/Shanghai' }
    const permissions = () => ['dashboard.view', 'order.fulfillment.view', 'order.after_sales.create', 'activity_finance.view', 'activity_after_sales.create', 'activity_after_sales.manage', 'order.after_sales.view', 'order.after_sales.review', ...(approve ? ['refund.approve'] : [])]
    const order = { order_no: 'DZY-OFFLINE', public_id: '1', status: 'pending_confirmation', status_label: '待确认',
      customer_name: '离线测试用户', provider_name: '离线测试达人', service_name: '桌球', service_city_name: '邯郸市',
      payable_amount: 5280, service_fee_amount: 5000, transport_fee_amount: 280, other_fee_amount: 0, discount_amount: 0,
      starts_at: '2026-10-07T01:00:00Z', ends_at: '2026-10-07T03:00:00Z', created_at: '2026-10-06T01:00:00Z',
      anomalies: [], after_sales_cases: [], support_notes: [], fulfillment_issues: [], fulfillment_reviews: [], review: null }
    const caseData = () => ({ case_no: 'AS-OFFLINE', public_id: '1', status: 'pending', status_label: escalated ? '待主管审核' : '待处理',
      requires_supervisor: escalated, escalation_reason: escalated ? '本订单累计退款超过客服单订单上限，请由主管审核。' : '',
      order_no: 'DZY-OFFLINE', case_type: 'refund', case_type_label: '退款申请', requested_amount: 2000, order_payable_amount: 5000,
      customer_name: '离线测试用户', provider_name: '测试达人', evidence_urls: [], created_at: '2026-10-07T01:00:00Z', reason: '离线测试退款申请', creator_name: '测试客服' })
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname
      if (!path.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      if (req.method() !== 'GET' && !path.endsWith('/auth/refresh/')) writes.push({ path, body: req.postDataJSON() })
      let data = { items: [], pagination: { total: 0 }, summary: {} }
      if (path.endsWith('/auth/refresh/')) data = { access: 'offline-token' }
      else if (path.endsWith('/admin/me/')) data = { user: { nickname: '测试客服', phone: '' }, permissions: permissions(), role_name: '客服', data_scope: 'all', city_codes: [] }
      else if (path.endsWith('/admin/work/summary/')) data = { viewer: 'offline', todos: [], total: 0, unread_count: 0, overdue_count: 0, updated_at: new Date().toISOString() }
      else if (path.endsWith('/admin/provider-orders/DZY-OFFLINE/')) data = order
      else if (path.endsWith('/admin/provider-orders/')) data = { items: [order], pagination: { total: 1 }, summary: {} }
      else if (path.endsWith('/admin/activity-finance/')) data = { items: [{ order_no: 'APO-OFFLINE', activity_id: 1, activity_title: '离线测试活动', payer_name: '离线测试用户', status: 'paid', status_label: '已支付', payable_amount: 5280, aa_principal_amount: 4800, platform_service_fee_amount: 480 }], pagination: { total: 1 }, summary: {} }
      else if (path.includes('/refund-context/')) data = { reference: path.includes('/provider/') ? 'DZY-OFFLINE' : 'APO-OFFLINE', customer: '离线测试用户', paid: 5280, refunded: 0, occupied: blocked ? 1000 : 0, remaining: blocked ? 4280 : 5280,
        components: [{ key: 'principal', remaining: 4800 }, { key: 'service_fee', remaining: 480 }], can_create: !blocked, open_case_no: '', blocked_reason: blocked ? '存在处理中或待核实的退款，请核查原退款单，不能重复申请。' : '',
        notice: '部分退款也会取消该用户报名；申请不等于退款成功。', policy }
      else if (path.endsWith('/admin/refund-policy/')) data = policy
      else if (path.endsWith('/activity-payments/APO-OFFLINE/after-sales/')) data = { case_no: 'AAS-OFFLINE' }
      else if (path.endsWith('/order-after-sales/AS-OFFLINE/action/')) { escalated = true; data = caseData() }
      else if (path.endsWith('/order-after-sales/AS-OFFLINE/')) data = caseData()
      else if (path.endsWith('/order-after-sales/')) data = { items: [caseData()], pagination: { total: 1 }, summary: { total: 1, pending: 1 } }
      await route.fulfill({ json: { data } })
    })
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${base}/#/activity-finance`)
    await page.getByRole('button', { name: '登记退款', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '登记退款申请', exact: true })
    await dialog.getByText('剩余可退', { exact: true }).waitFor()
    assert.match(await dialog.innerText(), /52\.80/)
    await dialog.getByRole('spinbutton').nth(0).fill('12.34')
    await dialog.getByRole('spinbutton').nth(1).fill('0')
    await dialog.getByRole('textbox').fill('核实用户报名争议后申请')
    const screenshot = require('node:path').join(require('node:os').tmpdir(), 'dazzy-staff-refund-preview.png')
    await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' })
    console.log(`Preview: ${screenshot}`)
    await dialog.getByRole('button', { name: /登记申请/ }).click()
    const confirm = page.getByRole('dialog', { name: '确认登记退款申请' })
    await confirm.waitFor()
    assert.equal(writes.length, 0, 'No POST before confirmation')
    await confirm.getByRole('button', { name: '确认登记', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(writes.length, 1)
    assert.equal(writes[0].body.requested_principal_amount, 1234)
    assert.equal(writes[0].body.requested_service_fee_amount, 0)
    assert(!writes[0].path.includes('/action/'), 'Intake must not approve')

    blocked = true
    await page.getByRole('button', { name: '登记退款', exact: true }).click()
    await dialog.getByText(/存在处理中或待核实的退款/).waitFor()
    assert.equal(await dialog.getByRole('button', { name: /登记申请/ }).isDisabled(), true)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()

    await page.goto(`${base}/#/after-sales`)
    await page.locator('.el-table__body-wrapper tr').first().click()
    await page.getByRole('heading', { name: '退款售后详情', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '核准退款', exact: true }).count(), 0)
    approve = true; blocked = false
    await page.reload()
    await page.locator('.el-table__body-wrapper tr').first().click()
    await page.getByRole('button', { name: '核准退款', exact: true }).click()
    const approval = page.getByRole('dialog', { name: '审核通过', exact: true })
    await approval.getByText(/今日剩余额度/).waitFor()
    await approval.getByRole('textbox').fill('核实完成同意退还服务费用')
    await approval.getByRole('button', { name: '确认通过', exact: true }).click()
    assert.equal(writes.length, 1)
    await page.getByRole('dialog', { name: '确认退款审批' }).getByRole('button', { name: '确认审批' }).click()
    await approval.waitFor({ state: 'hidden' })
    await page.getByText(/已转主管审核：/).waitFor()
    assert.equal(writes.length, 2)
    assert.equal(writes[1].body.approved_amount, 2000)
    assert.equal(await page.getByRole('button', { name: '核准退款', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: '驳回申请', exact: true }).count(), 0)
    // A first refund must be reachable even when the order has no prior after-sales cases.
    await page.goto(`${base}/#/orders`)
    await page.getByRole('button', { name: '查看详情', exact: true }).click()
    await page.getByRole('button', { name: '登记退款', exact: true }).click()
    await dialog.getByText('DZY-OFFLINE', { exact: true }).waitFor()
    await dialog.getByRole('spinbutton').fill('8.88')
    await dialog.getByRole('textbox').fill('首次申请退还部分服务费')
    await dialog.getByRole('button', { name: /登记申请/ }).click()
    await page.getByRole('dialog', { name: '确认登记退款申请' }).getByRole('button', { name: '确认登记', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(writes.length, 3)
    assert.equal(writes[2].body.requested_amount, 888)
    assert.equal(writes[2].body.order_no, 'DZY-OFFLINE')
    assert.deepEqual(errors, [])
    console.log('PASS intake balance/cent conversion, confirmation, blocked refunds, permission isolation, quota display and escalation without false success')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
