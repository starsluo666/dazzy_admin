// Start the admin dev server first. All APIs are mocked; no real coupons are issued.
// Optional: PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, ADMIN_TEST_URL, TEST_SCREENSHOT_DIR.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5194'
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    let permissions = ['*']
    const user = {
      public_id: '00000000-0000-4000-8000-000000000001', nickname: '用户1526',
      avatar_url: null, phone_masked: '159****1526', gender_label: '男',
      identity: 'provider', provider_status: 'approved', provider_status_label: '已通过',
      account_status: 'active', account_status_label: '正常', risk_flag: null,
      date_joined: '2026-10-04T11:24:00+08:00', last_login: null,
      order_count: 0, activity_count: 0, browsing_count: 0, review_count: 0,
      recent_orders: [], recent_activities: [], addresses: [], browsing_history: [], reviews: [],
    }
    const template = { public_id: 'test-coupon', name: '回访关怀券', face_amount: 2000, min_order_amount: 10000, valid_days: 30, is_active: true }
    const issued = [], errors = []
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      let data = { items: [], pagination: { total: 0 }, counters: {} }
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'local-test-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = { user: { nickname: '测试运营', phone: '' }, organization: null, role_name: '测试', permissions, data_scope: 'all', city_codes: [] }
      else if (url.pathname.endsWith('/admin/users/')) data = { items: [user], pagination: { total: 1 }, summary: { total: 1, providers: 1, flagged: 0, suspended: 0 } }
      else if (url.pathname.includes('/admin/users/')) data = user
      else if (url.pathname.endsWith('/coupon-templates/')) data = { items: [template] }
      else if (url.pathname.endsWith('/admin/coupons/') && request.method() === 'POST') {
        issued.push(request.postDataJSON()); data = { public_id: 'test-issued' }
      }
      await route.fulfill({ json: { data } })
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const openDetail = async () => {
      await page.goto(`${base}/#/users`)
      await page.reload()
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      await page.locator('.identity-card').waitFor()
      await page.locator('.management-drawer > .el-loading-mask').waitFor({ state: 'hidden' })
      await page.locator('.el-drawer').evaluate(async element => {
        await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})))
      })
    }
    await openDetail()
    const card = page.locator('.identity-card')
    const button = card.getByRole('button', { name: '发放优惠券', exact: true })
    assert.equal(await page.getByRole('button', { name: '发放优惠券', exact: true }).count(), 1)
    for (const width of [1440, 1180, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.waitForFunction(() => {
        const drawer = document.querySelector('.el-drawer').getBoundingClientRect()
        return Math.abs(drawer.width - Math.min(610, innerWidth)) < 0.1
      })
      const layout = await card.evaluate(element => {
        const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, width: r.width } }
        return { card: rect(element), button: rect(element.querySelector('button')), heading: rect(element.querySelector('.identity-heading')), info: rect(element.querySelector('.identity-info')), overflow: element.scrollWidth > element.clientWidth }
      })
      assert.ok(!layout.overflow, `Card overflow at ${width}`)
      assert.ok(layout.card.left >= 0 && layout.card.right <= width, `Card outside viewport at ${width}: ${JSON.stringify(layout)}`)
      assert.ok(layout.button.left > layout.card.left && layout.button.right < layout.card.right)
      assert.ok(layout.button.width <= 130)
      if (width > 600) {
        assert.equal(layout.button.height, 32)
        assert.ok(Math.abs(layout.button.top - layout.heading.top) < 1)
        assert.ok(layout.button.left >= layout.heading.right)
      } else assert.ok(layout.button.top >= layout.info.bottom)
      if (process.env.TEST_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.TEST_SCREENSHOT_DIR, { recursive: true })
        await card.screenshot({ path: path.join(process.env.TEST_SCREENSHOT_DIR, `user-card-${width}.png`) })
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await button.click()
    const dialog = page.locator('.el-dialog:visible')
    await dialog.getByText(/发放对象：用户1526/).waitFor()
    await dialog.locator('.el-select').click()
    await page.getByRole('option', { name: /回访关怀券/ }).click()
    await dialog.getByRole('button', { name: '发放一张' }).click()
    await page.locator('.el-message-box').getByRole('button', { name: '确认发放', exact: true }).click()
    await page.getByText('优惠券已发放，用户将收到通知', { exact: true }).waitFor()
    assert.equal(issued.length, 1)
    assert.equal(issued[0].user_public_id, user.public_id)
    assert.equal(issued[0].template_public_id, template.public_id)
    assert.ok(issued[0].request_id)

    user.nickname = '很长的用户昵称用于验证卡片布局不会挤压按钮'.repeat(2)
    await openDetail()
    assert.ok(await card.evaluate(element => element.scrollWidth <= element.clientWidth))
    assert.ok(await button.isEnabled())
    user.account_status = 'suspended'
    user.account_status_label = '已封禁'
    await openDetail()
    assert.ok(await button.isDisabled())
    permissions = ['user.view']
    await openDetail()
    assert.equal(await button.count(), 0)
    assert.equal(issued.length, 1)
    assert.deepEqual(errors, [])
    console.log('PASS: card placement, desktop/narrow layouts, long nickname, original issue flow, account and permission guards; mock APIs only')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
