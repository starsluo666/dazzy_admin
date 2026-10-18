// Local UI only: every API request is mocked and all other external traffic is denied.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5198'

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const writes = [], errors = []
    let item = null, reviewer = false
    const permissions = ['dashboard.view', 'order.after_sales.view', 'order.after_sales.create', 'order.finance.view', 'order.finance.manage', 'refund.supervise']
    const dataItem = () => ({ ...item, actions: item.status === 'pending' ? ['start', 'reject'] : item.status === 'processing' ? ['submit_evidence', 'reject'] : item.status === 'reviewing' && reviewer ? ['verify', 'return'] : [] })
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname
      if (!path.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      if (req.method() !== 'GET' && !path.endsWith('/auth/refresh/')) writes.push({ path, body: req.postDataJSON() })
      let data = {}
      if (path.endsWith('/auth/refresh/')) data = { access: 'offline-token' }
      else if (path.endsWith('/admin/me/')) data = { user: { nickname: '测试财务' }, permissions, role_name: '财务', data_scope: 'all', city_codes: [] }
      else if (path.endsWith('/admin/work/summary/')) data = { viewer: 'offline', todos: [], total: 0, unread_count: 0, overdue_count: 0, updated_at: new Date().toISOString() }
      else if (path.includes('/refund-context/')) data = { reference: 'DZY-OFFLINE', customer: '测试用户', paid: 5000, refunded: 0, occupied: 0, remaining: 5000, components: [], can_create: false, blocked_reason: '订单已结算，请转财务核查。', manual: { eligible: true, remaining: item ? 3766 : 5000, completed_amount: 0, occupied_amount: item ? 1234 : 0, can_create: !item, blocked_reason: item ? '已有未结束的人工售后，请处理原工单。' : '', notice: '人工登记不发起退款、不修改渠道状态。' } }
      else if (path.endsWith('/admin/manual-refunds/')) {
        if (req.method() === 'POST') {
          const body = req.postDataJSON()
          item = { case_no: 'MR-OFFLINE', order_no: body.order_no, requested_amount: body.requested_amount, reason: body.reason, status: 'pending', status_label: '待财务处理', revision: 1, customer_name: '测试用户', provider_name: '测试达人', created_by: '测试客服', processed_by: '', reviewed_by: '', receipt_no: '', evidence_reference: '', handling_note: '', review_note: '', paid_at: null, created_at: '2026-10-18T01:00:00Z', updated_at: '2026-10-18T01:00:00Z', notice: '人工登记不发起退款、不修改渠道状态。', records: [] }
          data = dataItem()
        } else data = { items: item ? [dataItem()] : [], total: item ? 1 : 0, page: 1, page_size: 20 }
      } else if (path.endsWith('/admin/manual-refunds/MR-OFFLINE/')) {
        if (req.method() === 'POST') {
          const body = req.postDataJSON()
          assert.equal(body.revision, item.revision)
          item.status = body.action === 'start' ? 'processing' : 'completed'
          item.status_label = body.action === 'start' ? '财务处理中' : '人工处理已核验'
          item.revision += 1
        }
        data = dataItem()
      } else return route.fulfill({ status: 404, json: { detail: 'Unexpected mocked API path' } })
      await route.fulfill({ json: { data } })
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/#/manual-refunds`)
    await page.getByRole('heading', { name: '已结算订单人工售后', exact: true }).waitFor()
    await page.getByRole('textbox', { name: '登记人工售后的订单号' }).fill('DZY-OFFLINE')
    await page.getByRole('button', { name: '转人工售后', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: '转人工售后', exact: true })
    await dialog.getByRole('spinbutton').fill('12.34')
    await dialog.getByRole('textbox').fill('核实用户诉求，财务人工核对退款')
    await dialog.getByRole('button', { name: /转人工售后 ·/ }).click()
    assert.equal(writes.length, 0)
    await page.getByRole('dialog', { name: '确认登记退款申请' }).getByRole('button', { name: '确认登记', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(writes[0].body.requested_amount, 1234)
    assert.match(writes[0].body.request_key, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
    await page.getByRole('button', { name: '转人工售后', exact: true }).click()
    dialog = page.getByRole('dialog', { name: '转人工售后', exact: true })
    await dialog.getByText('剩余可申请', { exact: true }).waitFor()
    assert.match(await dialog.locator('dl dd').last().innerText(), /37\.66/)
    assert.equal(await dialog.getByRole('button', { name: /转人工售后 ·/ }).isDisabled(), true)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '查看处理', exact: true }).click()
    await page.getByRole('button', { name: '开始处理', exact: true }).click()
    dialog = page.getByRole('dialog', { name: '开始处理', exact: true })
    await dialog.getByRole('textbox').fill('开始核实原始支付和分账流水')
    await dialog.getByRole('button', { name: '确认登记', exact: true }).click()
    await page.getByRole('dialog', { name: '确认人工处理记录', exact: true }).getByRole('button', { name: '确认登记', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(writes[1].body.action, 'start')
    assert.equal(writes[1].body.revision, 1)
    item.status = 'reviewing'; item.status_label = '待财务复核'; item.revision = 3
    item.receipt_no = 'TEST-RECEIPT'; item.evidence_reference = '内部归档/凭证001'
    await page.reload()
    await page.getByRole('button', { name: '查看处理', exact: true }).click()
    await page.getByText('实际退款流水：TEST-RECEIPT', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '核验凭证并结案', exact: true }).count(), 0)
    reviewer = true
    await page.reload()
    await page.getByRole('button', { name: '查看处理', exact: true }).click()
    await page.getByRole('button', { name: '核验凭证并结案', exact: true }).click()
    dialog = page.getByRole('dialog', { name: '核验凭证并结案', exact: true })
    await dialog.getByRole('textbox').fill('独立核实金额、收款用户及实际回单')
    await dialog.getByRole('button', { name: '确认登记', exact: true }).click()
    await page.getByRole('dialog', { name: '确认人工处理记录', exact: true }).getByRole('button', { name: '确认登记', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(writes[2].body.action, 'verify')
    assert.equal(writes[2].body.revision, 3)
    assert(writes.every(write => write.path.includes('/manual-refunds/')))
    assert.deepEqual(errors, [])
    console.log('PASS manual intake, integer cents, request UUID, confirmation, revisions, independent review actions and no automatic refund calls')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
