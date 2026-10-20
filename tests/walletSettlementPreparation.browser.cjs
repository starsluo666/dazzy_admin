// Offline only: mock every API, reject external requests and assert no money writes.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5196'
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = [], writes = []
    let mode = 'mixed'
    const preparation = () => ({
      version: 'provider-wallet-preparation-v1', status: mode === 'unknown' ? 'blocked' : 'awaiting_channel',
      status_label: mode === 'unknown' ? '待业务与资金核对' : '待渠道资金核验',
      execution_enabled: false, channel_funds_verified: false, channel_transfer_amount: null, channel_fee_amount: null,
      wallet_remaining_amount: 3000, external_remaining_amount: 7000,
      traceable_wallet_amount: mode === 'unknown' ? null : 3000, untraced_wallet_amount: mode === 'unknown' ? null : 0,
      provider_receivable_amount: 8000, platform_gross_amount: 2000,
      sources: [{ recharge_no: 'TEST-RECHARGE-001', debited_amount: 3000, restored_amount: 0, remaining_amount: 3000, record_complete: true, evidence_digest: '' }],
      sources_truncated: mode === 'unknown',
      external_payment: { payment_no: 'TEST-PAYMENT-001', paid_amount: 7000, refunded_amount: 0, remaining_amount: 7000, delay_acct_flag: 'N', record_complete: true, evidence_digest: '' },
      source_issues: mode === 'unknown' ? [{ code: 'source_limit', message: '充值来源超过单次核对上限，须人工核账；当前明细不完整' }] : [],
      business_blockers: [], pending_confirmations: ['确认平台商户是否获准向达人个人收款账户进行余额支付'],
    })
    const settlement = () => ({
      settlement_no: 'TEST-SETTLEMENT-001', order_no: 'TEST-ORDER-001', provider_name: '测试达人', service_name: '测试服务', city_code: '130400', city_name: '邯郸市',
      status: 'settled', status_label: '平台账务已结算', paid_amount: 10000, refunded_amount: 0,
      net_service_fee_amount: 10000, net_transport_fee_amount: 0, net_other_fee_amount: 0,
      platform_commission_rate: '20.00', platform_commission_amount: 2000, provider_service_income_amount: 8000, provider_settlement_amount: 8000,
      freeze_until: '2026-10-01T00:00:00Z', settled_at: '2026-10-01T00:00:00Z', dispute_reason: '',
      ...(mode.startsWith('balance') ? { distribution: {
        route: 'balance', route_label: '平台余额支付结算', req_date: '20261019', req_seq_id: 'PB-OFFLINE-001',
        status: mode === 'balance' ? 'succeeded' : 'unknown',
        status_label: mode === 'balance' ? '达人账户收款成功（非银行卡到账）' : '余额付款结果待核实',
        provider_amount: 8000, platform_amount: 2000, payment_fee_flag: '',
        payment_fee_amount: null, split_fee_amount: null, platform_split_amount: null, split_amount: null,
        account_payment_amount: 8000, account_payment_fee_amount: mode === 'balance' ? 12 : null,
        bank_arrival_verified: false, attention_reason: '', evidence_conflict_code: '',
        last_queried_at: '2026-10-19T00:00:00Z',
      } } : {}),
      distribution_plan: {
        plan_no: 'TEST-PLAN-001', status: mode.startsWith('balance') ? 'ready' : 'blocked', status_label: mode.startsWith('balance') ? '业务条件已满足' : '待核实', funding_type: 'mixed', funding_type_label: '组合支付',
        revision: 2, evaluated_at: '2026-10-18T00:00:00Z', execution_enabled: false,
        fee_policy_snapshot: { bearer: 'platform' },
        blockers: mode.startsWith('balance') ? [] : [{ code: 'wallet_route_unconfirmed', message: '余额结算尚未启用或授权未确认' }],
        funding_snapshot: { wallet_paid_amount: 3000, external_paid_amount: 7000, wallet_refunded_amount: 0, external_refunded_amount: 0,
          ...(mode === 'legacy' ? {} : { wallet_settlement_preparation: preparation() }) },
      },
    })
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      if (req.method() !== 'GET' && !url.pathname.endsWith('/auth/refresh/')) writes.push(url.pathname)
      let data = { items: [], pagination: { total: 0 }, summary: {} }
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'offline-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = { user: { nickname: '离线财务测试', phone: '' }, organization: null, permissions: ['*'], role_name: '管理员', data_scope: 'all', city_codes: [] }
      else if (url.pathname.endsWith('/admin/work/summary/')) data = { total: 0, unread_count: 0, todos: [] }
      else if (url.pathname.endsWith('/admin/provider-order-finance/')) data = {
        items: url.searchParams.get('record_type') === 'settlement' ? [settlement()] : [], pagination: { total: 1 },
        summary: { paid_amount: 10000, refunded_amount: 0, pending_settlement_amount: 0, settled_amount: 8000, exception_count: 0 },
      }
      await route.fulfill({ json: { data } })
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/#/settlements`)
    await page.getByRole('heading', { name: '交易与结算', exact: true }).waitFor()
    await page.getByRole('button', { name: '达人结算', exact: true }).click()
    await page.getByRole('button', { name: '详情', exact: true }).click()
    const panel = page.getByTestId('wallet-settlement-preparation')
    await panel.getByText('待渠道资金核验', { exact: true }).waitFor()
    assert.match(await panel.innerText(), /实际付款结果请查看上方渠道结算状态/)
    assert.match(await panel.locator('.funding-totals').innerText(), /30\.00/)
    assert.match(await panel.locator('.funding-totals').innerText(), /70\.00/)
    assert.equal(await panel.locator('.source-details').getAttribute('open'), null)
    await panel.locator('.source-details summary').click()
    await panel.getByText('TEST-RECHARGE-001', { exact: true }).waitFor()
    await panel.locator('.channel-details summary').click()
    await panel.getByText('确认平台商户是否获准向达人个人收款账户进行余额支付', { exact: true }).waitFor()
    assert.equal(await panel.getByRole('button').count(), 0)
    await panel.scrollIntoViewIfNeeded()
    const screenshot = process.env.TEST_SCREENSHOT || require('node:path').join(require('node:os').tmpdir(), 'dazzy-wallet-settlement.png')
    await page.screenshot({ path: screenshot })
    console.log(`Preview: ${screenshot}`)
    for (const next of ['unknown', 'balance', 'balance-unknown', 'legacy']) {
      await page.keyboard.press('Escape')
      mode = next
      await page.getByRole('button', { name: '刷新数据', exact: true }).click()
      await page.getByRole('button', { name: '详情', exact: true }).click()
      if (next === 'unknown') {
        await panel.getByText('待业务与资金核对', { exact: true }).waitFor()
        assert.equal(await panel.locator('.funding-totals dd').nth(2).innerText(), '待核实')
        assert.equal(await panel.locator('.funding-totals dd').nth(3).innerText(), '待核实')
        assert.match(await panel.innerText(), /未完整展示/)
      } else if (next.startsWith('balance')) {
        await page.getByText('平台余额支付结算', { exact: true }).waitFor()
        const fee = page.locator('dt').filter({ hasText: /^余额支付手续费（平台承担）$/ }).locator('..').locator('dd')
        assert.equal(await fee.innerText(), next === 'balance' ? '¥0.12' : '待核实')
        assert.equal(await page.getByText('平台分账金额', { exact: true }).count(), 0)
        assert.equal(await page.getByText('分账请求总额', { exact: true }).count(), 0)
        await page.getByText('向达人付款金额', { exact: true }).waitFor()
        if (next === 'balance') {
          await page.waitForFunction(() => {
            const drawer = document.querySelector('.detail-drawer')?.closest('.el-drawer')
            if (!drawer) return false
            const bounds = drawer.getBoundingClientRect()
            return bounds.width > 0 && bounds.left >= 0 && bounds.right <= innerWidth + 1
          })
          await page.locator('.el-drawer__body').filter({ has: page.locator('.detail-drawer') }).evaluate(node => { node.scrollTop = 0 })
          const preview = require('node:path').join(require('node:os').tmpdir(), 'dazzy-balance-settlement.png')
          await page.screenshot({ path: preview })
          console.log(`Balance preview: ${preview}`)
        }
      } else {
        await page.getByText('TEST-PLAN-001 · 第 2 版', { exact: true }).waitFor()
        assert.equal(await panel.count(), 0)
      }
    }
    assert.deepEqual(writes, [])
    assert.deepEqual(errors, [])
    console.log('PASS mixed funding, balance channel state/fees, unknown totals, legacy compatibility and no financial writes')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
