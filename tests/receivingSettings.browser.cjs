// Start the admin dev server; all API calls below are intercepted, never live.
// Optional: PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, ADMIN_TEST_URL, TEST_SCREENSHOT.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } })
    const baseUrl = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5194'
    const errors = []
    const writes = []
    let failSave = false
    let failLoad = false
    const state = {
      source: 'unconfigured', revision: 0, updated_at: null, updated_by: null,
      form: { cash_type: '', out_fee_acct_type: '', fix_amt: null, fee_rate: null, weekday_fix_amt: null, weekday_fee_rate: null },
      onboarding_ready: false, withdrawal_enabled: false,
      checks: [
        { key: 'environment', label: '渠道环境', ok: true, message: '已满足' },
        { key: 'onboarding_switch', label: '渠道开户开关', ok: false, message: 'HUIFU_USER_ONBOARDING_ENABLED 尚未开启' },
        { key: 'HUIFU_USER_UPPER_ID', label: '用户上级汇付 ID', ok: false, message: '请由运维配置有效的 HUIFU_USER_UPPER_ID' },
        { key: 'HUIFU_USER_NOTIFY_URL', label: '开户回调地址', ok: false, message: '请由运维配置有效 HTTPS 回调地址 HUIFU_USER_NOTIFY_URL' },
        { key: 'cash_config', label: '提现费用规则', ok: false, message: '手动提现参数及平台承担手续费配置尚未完成，请联系平台。' },
      ],
    }
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (!url.pathname.startsWith('/api/v1/')) {
        return url.origin === new URL(baseUrl).origin ? route.continue() : route.abort()
      }
      if (!url.pathname.endsWith('/admin/operation-settings/receiving-withdrawal/')) {
        return route.fulfill({ status: 500, json: { detail: 'Unexpected API call in isolated UI test' } })
      }
      if (request.method() === 'PUT') {
        const body = request.postDataJSON()
        writes.push(body)
        if (failSave) return route.fulfill({ status: 409, json: { detail: '配置已被其他管理员修改，请重新加载并核对后再保存。' } })
        Object.assign(state, {
          revision: body.revision + 1, source: 'admin', updated_by: '测试管理员', updated_at: '2026-10-03T08:00:00Z',
          form: Object.fromEntries(Object.keys(state.form).map(key => [key, body[key]])),
        })
        const check = state.checks.find(item => item.key === 'cash_config')
        check.ok = true
        check.message = '已满足'
      } else if (failLoad) return route.fulfill({ status: 503, json: { detail: '配置暂时无法读取' } })
      return route.fulfill({ json: { data: state } })
    })
    await page.goto(`${baseUrl}/?preview=1#/receiving-settings`)
    await page.getByRole('heading', { name: '收款与提现配置', exact: true }).waitFor()
    await page.getByText('来源：尚未配置', { exact: true }).waitFor()
    assert.equal(writes.length, 0)
    assert.equal(await page.getByRole('textbox', { name: '每笔固定费用', exact: true }).inputValue(), '')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    assert.equal(await page.getByRole('dialog').count(), 0)
    const selects = page.locator('.receiving-settings .el-select')
    await selects.nth(0).click()
    await page.getByRole('option', { name: 'D1 · 下一自然日到账' }).click()
    await page.getByRole('textbox', { name: '每笔固定费用', exact: true }).fill('0')
    await page.getByRole('textbox', { name: '按金额收取费率', exact: true }).fill('0.05')
    await page.getByRole('textbox', { name: '工作日每笔固定费用', exact: true }).fill('0')
    await selects.nth(1).click()
    await page.getByRole('option', { name: '基本户（01）' }).click()
    await page.getByRole('option', { name: '基本户（01）' }).waitFor({ state: 'hidden' })
    await page.locator('.el-message').waitFor({ state: 'hidden' })
    if (process.env.TEST_SCREENSHOT) await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true })

    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '确认发布提现规则' })
    await dialog.waitFor()
    assert.equal(await dialog.getByRole('button', { name: '确认保存', exact: true }).isEnabled(), false)
    await dialog.getByText('0.05%', { exact: true }).waitFor()
    await dialog.getByRole('textbox', { name: '变更说明' }).fill('离线浏览器验证')
    assert.equal(await dialog.getByRole('button', { name: '确认保存', exact: true }).isEnabled(), false)
    await dialog.locator('.el-checkbox').click()
    assert.equal(await dialog.getByRole('checkbox').isChecked(), true)
    await dialog.getByRole('button', { name: '确认保存', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(writes.length, 1)
    assert.deepEqual(writes[0], { ...state.form, revision: 0, confirmed: true, reason: '离线浏览器验证' })
    assert.equal(writes[0].weekday_fee_rate, null)
    assert.equal(writes[0].fix_amt, '0')
    await page.getByText('来源：后台表单', { exact: true }).waitFor()
    await page.getByText('HUIFU_USER_ONBOARDING_ENABLED 尚未开启', { exact: true }).waitFor()

    // A server conflict must keep the draft, show the real message, never retry.
    failSave = true
    await page.getByRole('textbox', { name: '每笔固定费用', exact: true }).fill('2')
    await page.getByRole('button', { name: '保存配置', exact: true }).click()
    await dialog.getByRole('textbox', { name: '变更说明' }).fill('验证版本冲突')
    await dialog.locator('.el-checkbox').click()
    await dialog.getByRole('button', { name: '确认保存', exact: true }).click()
    await dialog.getByText('配置已被其他管理员修改，请重新加载并核对后再保存。', { exact: true }).waitFor()
    assert.equal(writes.length, 2)
    assert.equal(writes[1].revision, 1)
    await dialog.getByRole('button', { name: '返回修改' }).click()
    assert.equal(await page.getByRole('textbox', { name: '每笔固定费用', exact: true }).inputValue(), '2')
    await page.getByRole('button', { name: '平台参数', exact: true }).click()
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    assert.ok(page.url().includes('/receiving-settings'))
    await page.getByRole('button', { name: '重新加载', exact: true }).click()
    await page.getByRole('button', { name: '放弃修改', exact: true }).click()
    await page.getByText('有未保存修改', { exact: true }).waitFor({ state: 'hidden' })

    // Existing admin shell has a global 1180px desktop minimum width.
    for (const width of [1440, 1280, 1180]) {
      await page.setViewportSize({ width, height: 1000 })
      const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
      assert.ok(size.scroll <= size.client + 1, `Horizontal overflow at ${width}: ${JSON.stringify(size)}`)
    }
    failLoad = true
    await page.getByRole('button', { name: '重新加载', exact: true }).click()
    await page.getByText('配置暂时无法读取', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '保存配置', exact: true }).isEnabled(), false)
    assert.deepEqual(errors, [])
    console.log('PASS: navigation, empty form, D1 fees, consent, save payload, conflict/draft protection, failed load, responsive layouts; no live API')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
