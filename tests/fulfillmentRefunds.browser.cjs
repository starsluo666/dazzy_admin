// Serves only the local build. ALL API requests are mocked; no real account or funds.
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(__dirname, '../dist')

;(async () => {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, `.${decodeURIComponent(new URL(req.url, 'http://localhost').pathname)}`)
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return }
    const target = file === root ? path.join(root, 'index.html') : file
    try {
      const content = fs.readFileSync(target)
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(target)] || 'application/octet-stream')
      res.end(content)
    } catch { res.writeHead(404); res.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = [], writes = [], forbidden = []
    let canApprove = true, blocked = false, transferred = false, decided = false
    const permissions = () => ['dashboard.view', 'order.fulfillment.view', 'order.fulfillment.review', 'order.after_sales.create', 'order.after_sales.view', 'order.after_sales.review', ...(canApprove ? ['refund.approve'] : [])]
    const caseData = () => ({ case_no: 'AS-FULFILLMENT', public_id: '1', order_no: 'DZY-FULFILLMENT',
      status: decided ? 'approved' : 'pending', status_label: decided ? '待退款' : '待处理',
      case_type: 'fulfillment_dispute', case_type_label: '履约异常售后', requested_amount: 12000,
      order_payable_amount: 12000, customer_name: '测试用户', provider_name: '测试达人',
      evidence_urls: [], reason: '双方反映服务提前结束', creator_name: '测试客服', requires_supervisor: false,
      created_at: '2026-10-13T02:00:00Z', fulfillment: { revision: 1, finance_label: '待客服核实责任及处理方案' } })
    const orderData = () => ({ order_no: 'DZY-FULFILLMENT', public_id: '1', status: transferred ? 'after_sales' : 'pending_confirmation',
      status_label: transferred ? '售后处理中' : '待确认', customer_name: '测试用户', provider_name: '测试达人', service_name: '桌球', service_city_name: '邯郸市',
      payable_amount: 12000, service_fee_amount: 10000, transport_fee_amount: 2000, other_fee_amount: 0, discount_amount: 0,
      starts_at: '2026-10-13T01:00:00Z', ends_at: '2026-10-13T03:00:00Z', created_at: '2026-10-12T01:00:00Z',
      completion_submitted_at: '2026-10-13T02:00:00Z', fulfillment_review_required: !decided, fulfillment_revision: 1,
      fulfillment_policy: { early_minutes: 30, late_minutes: 30 },
      anomalies: [], after_sales_cases: transferred ? [caseData()] : [], support_notes: [],
      fulfillment_issues: [{ revision: 1, code: 'duration_short', label: '实际服务时长不足' }], fulfillment_reviews: [], review: null })
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), pathname = url.pathname
      if (!pathname.includes('/api/v1/')) {
        if (url.origin === base) return route.continue()
        forbidden.push(url.origin); return route.abort()
      }
      if (req.method() !== 'GET' && !pathname.endsWith('/auth/refresh/')) writes.push({ path: pathname, body: req.postDataJSON() })
      let data = { items: [], pagination: { total: 0 }, summary: {} }
      if (pathname.endsWith('/auth/refresh/')) data = { access: 'offline-token' }
      else if (pathname.endsWith('/admin/me/')) data = { user: { nickname: '测试客服', phone: '' }, permissions: permissions(), role_name: '客服', data_scope: 'all', city_codes: [] }
      else if (pathname.endsWith('/admin/work/summary/')) data = { viewer: 'offline', todos: [], total: 0, unread_count: 0, overdue_count: 0 }
      else if (pathname.endsWith('/provider-orders/DZY-FULFILLMENT/fulfillment-after-sales/')) { transferred = true; data = caseData() }
      else if (pathname.endsWith('/provider-orders/DZY-FULFILLMENT/')) data = orderData()
      else if (pathname.endsWith('/provider-orders/')) data = { items: [orderData()], pagination: { total: 1 }, summary: {} }
      else if (pathname.endsWith('/fulfillment-context/')) data = {
        case_no: 'AS-FULFILLMENT', order_no: 'DZY-FULFILLMENT', revision: 1, paid: 12000, refunded: 0,
        components: [{ key: 'service', label: '服务费', paid: 10000, remaining: 10000 }, { key: 'transport', label: '交通费', paid: 2000, remaining: 2000 }, { key: 'other', label: '其他费用', paid: 0, remaining: 0 }],
        timeline: { paid_at: '2026-10-12T01:00:00Z', starts_at: '2026-10-13T01:00:00Z', ends_at: '2026-10-13T03:00:00Z', service_started_at: '2026-10-13T01:00:00Z' },
        transport_mode: '出租车', policy_available: true, policy_clauses: ['按下单时已同意的规则处理'],
        blocked_reason: blocked ? '订单已分账，请转财务核查' : '', can_preview: !blocked, can_approve: canApprove,
        policy: { single_limit: 100000, daily_limit: 1000000, daily_remaining: 1000000, supervisor: false },
      }
      else if (pathname.endsWith('/fulfillment-preview/')) {
        const input = req.postDataJSON(), refund = Object.values(input.component_refunds || {}).reduce((sum, n) => sum + n, 0)
        data = { token: 'signed-offline-preview', label: '客服按履约证据人工裁定', stage: 'in_service', responsibility_label: '达人责任', occurred_at: input.occurred_at,
          component_refunds: input.component_refunds, refund_amount: refund, remaining_amount: 12000 - refund,
          routes: { wallet: 0, external: refund }, requires_supervisor: false }
      }
      else if (pathname.endsWith('/fulfillment-resolve/')) { decided = true; data = caseData() }
      else if (pathname.endsWith('/order-after-sales/AS-FULFILLMENT/')) data = caseData()
      else if (pathname.endsWith('/order-after-sales/')) data = { items: [caseData()], pagination: { total: 1 }, summary: { total: 1, pending: 1 } }
      await route.fulfill({ json: { data } })
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/#/orders`)
    await page.getByRole('button', { name: '查看详情', exact: true }).click()
    await page.getByRole('button', { name: '继续核查', exact: true }).waitFor()
    await page.getByRole('button', { name: '存在问题，处理售后', exact: true }).click()
    const intake = page.getByRole('dialog', { name: '存在问题，转售后处理', exact: true })
    await intake.getByRole('textbox').fill('双方反映服务提前结束，需要核实责任及退款')
    assert.equal(writes.length, 0)
    await intake.getByRole('button', { name: '确认登记', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '履约异常 · 核实责任与退款', exact: true })
    await dialog.getByText('出租车', { exact: false }).waitFor()
    assert.equal(writes.length, 1, 'Transfer must not preview/approve/refund')
    const fillFacts = async () => {
      await dialog.getByText('请先核实责任', { exact: true }).click()
      await page.getByRole('option', { name: '达人责任', exact: true }).click()
      await dialog.getByPlaceholder('不是客服审核时间').fill('2026-10-13 10:00:00')
      await dialog.getByPlaceholder('不是客服审核时间').press('Tab')
      await dialog.getByRole('spinbutton').nth(0).fill('50')
      await dialog.getByRole('spinbutton').nth(1).fill('0')
      await dialog.locator('textarea').fill('已核实双方陈述、有效服务时长及交通费用')
      await dialog.getByText('已核对双方陈述及履约证据，确认责任和取消／结束时间', { exact: true }).click()
      assert.equal(await dialog.getByRole('checkbox', { name: /已核对双方陈述/ }).isChecked(), true)
    }
    await fillFacts()
    await dialog.getByRole('button', { name: '预览退款方案', exact: true }).click()
    await dialog.getByRole('region', { name: '退款预览' }).waitFor()
    assert.equal(writes.at(-1).body.component_refunds.service, 5000)
    assert.match(writes.at(-1).body.occurred_at, /Z$/)
    assert(!writes.some(w => w.path.endsWith('/fulfillment-resolve/')))
    await dialog.getByRole('spinbutton').nth(0).fill('45')
    assert.equal(await dialog.getByRole('button', { name: '确认裁定', exact: true }).count(), 0, 'Changing facts invalidates preview')
    await dialog.getByRole('button', { name: '预览退款方案', exact: true }).click()
    await dialog.getByRole('button', { name: '确认裁定', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '确认履约售后裁定', exact: true })
    await confirmation.waitFor()
    assert(!writes.some(w => w.path.endsWith('/fulfillment-resolve/')), 'No adjudication before confirmation')
    await confirmation.getByRole('button', { name: '确认提交', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(writes.at(-1).body, { token: 'signed-offline-preview' })
    assert.equal(writes.filter(w => w.path.endsWith('/fulfillment-resolve/')).length, 1)

    // A reviewer without refund authority may preview, but cannot submit a decision.
    canApprove = false; decided = false
    await page.goto(`${base}/#/after-sales`)
    await page.reload()
    await page.locator('.el-table__body-wrapper tr').first().click()
    assert.equal(await page.getByRole('button', { name: '核准退款', exact: true }).count(), 0, 'No generic approval bypass')
    await page.getByRole('button', { name: '核实责任与退款', exact: true }).click()
    await fillFacts()
    await dialog.getByRole('button', { name: '预览退款方案', exact: true }).click()
    await dialog.getByRole('region', { name: '退款预览' }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: '确认裁定', exact: true }).isDisabled(), true)
    const box = await dialog.boundingBox()
    assert(box.y >= 0 && box.y + box.height <= 1000, 'Long form must scroll inside dialog, with title and footer visible')
    await dialog.locator('.fulfillment-refund').evaluate(element => { element.scrollTop = element.scrollHeight })
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'dazzy-fulfillment-refund-preview.png'), fullPage: true, animations: 'disabled' })
    await dialog.getByRole('button', { name: '暂不处理', exact: true }).click()
    blocked = true
    await page.getByRole('button', { name: '核实责任与退款', exact: true }).click()
    await dialog.getByText('订单已分账，请转财务核查', { exact: true }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: '预览退款方案', exact: true }).isDisabled(), true)
    assert.deepEqual(errors, [])
    assert.deepEqual(forbidden, [])
    console.log('PASS: fulfillment intake, preview/cent conversion, stale preview, confirmation, signed-only submit, after-sales entry, permissions and distributed-order block; all APIs mocked.')
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
