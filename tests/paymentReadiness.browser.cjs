// All APIs are synthetic. Loading and refreshing must never send a money request.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5196'
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    const writes = [], errors = []
    let fail = false, checks = 0
    const jobs = [{ id: 1, key: 'providers.process_income_transfers', label: '渠道出款与提现查单',
      state: 'stale', alert: true, reason: '已超过预期执行间隔，请检查任务。', started_at: null,
      finished_at: null, succeeded_at: '2026-10-20T05:00:00Z', quiet_seconds: 300 }]
    const groups = [
      ['payment', '微信收款', 'HUIFU_PAYMENT_ENABLED', 'configured'],
      ['distribution', '达人订单延时分账', 'HUIFU_PROVIDER_DISTRIBUTION_ENABLED', 'configured'],
      ['balance', '余额／组合支付的达人结算', 'HUIFU_PROVIDER_BALANCE_PAYMENT_ENABLED', 'incomplete'],
      ['withdrawal', '达人主动提现', 'HUIFU_PROVIDER_WITHDRAWAL_ENABLED', 'disabled'],
      ['reconciliation', '每日渠道对账', 'HUIFU_RECONCILIATION_ENABLED', 'configured'],
    ].map(([key, label, setting, state]) => ({ key, label, switch: setting, state,
      enabled: state !== 'disabled', limit_cents: key === 'balance' ? 10000 : null,
      checks: [{ key: key === 'balance' ? 'HUIFU_PROVIDER_BALANCE_PAYMENT_CONFIRMED' : setting,
        label: key === 'balance' ? '余额付款权限与用途已登记确认' : '本地配置检查',
        ok: state === 'configured', help: '请核对已确认的配置。' }],
    }))
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      if (req.method() !== 'GET' && !url.pathname.endsWith('/auth/refresh/')) writes.push(url.pathname)
      let data
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'offline-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = {
        user: { nickname: '只读财务', phone: '' }, organization: null,
        permissions: ['finance.recovery.view'], role_name: '只读财务', data_scope: 'all', city_codes: [],
      }
      else if (url.pathname.endsWith('/admin/work/summary/')) data = { total: 0, unread_count: 0, todos: [] }
      else if (url.pathname.endsWith('/admin/payment-readiness/')) {
        checks++
        if (fail) return route.fulfill({ status: 503, json: { detail: '检查暂不可用' } })
        data = { checked_at: '2026-10-21T06:00:00Z', environment: '正式环境', groups, jobs,
          manual_checks: [{ key: 'acceptance', label: '真实小额闭环与银行到账', description: '核对真实交易、银行凭证和次日账单。' }] }
      }
      else if (url.pathname.endsWith('/admin/payment-job-health/')) data = { items: jobs }
      else throw new Error(`Unexpected API ${req.method()} ${url.pathname}`)
      return route.fulfill({ json: { data } })
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/#/finance-recovery?view=readiness`)
    await page.getByRole('heading', { name: '资金上线检查', exact: true }).waitFor()
    await page.getByText('余额付款权限与用途已登记确认', { exact: true }).waitFor()
    await page.getByText('真实小额闭环与银行到账', { exact: true }).waitFor()
    await page.locator('.group-status .el-tag').first().waitFor({ state: 'visible', timeout: 5000 })
    assert.equal(await page.getByRole('button', { name: '确认登记', exact: true }).count(), 0)
    assert.deepEqual(writes, [])
    assert.equal(checks, 1)
    fail = true
    await page.getByRole('button', { name: '刷新本地记录', exact: true }).click()
    await page.getByText('未加载检查结果，请刷新重试', { exact: true }).waitFor()
    assert.equal(await page.locator('.readiness-summary').count(), 0)
    fail = false
    await page.getByRole('button', { name: '刷新本地记录', exact: true }).click()
    await page.getByRole('heading', { name: '资金上线检查', exact: true }).waitFor()
    await page.getByRole('button', { name: '查看任务巡检', exact: true }).click()
    await page.getByText('长时间未运行', { exact: true }).waitFor()
    await page.getByText('资金上线检查', { exact: true }).click()
    await page.getByRole('heading', { name: '资金上线检查', exact: true }).waitFor()
    const screenshot = require('node:path').join(require('node:os').tmpdir(), 'dazzy-payment-readiness.png')
    await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' })
    assert.deepEqual(writes, [])
    assert.deepEqual(errors, [])
    console.log(`PASS read-only permission, configuration states, stale-report removal, retry and task navigation; ${screenshot}`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
