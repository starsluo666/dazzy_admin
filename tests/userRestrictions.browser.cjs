const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const dist = path.resolve(__dirname, '../dist')

async function main() {
  const server = http.createServer((req, res) => {
    const target = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
    if (target !== dist && !target.startsWith(dist + path.sep)) return res.writeHead(403).end()
    const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(dist, 'index.html')
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type }); fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    const user = { public_id: '00000000-0000-4000-8000-000000000001', nickname: '功能限制测试用户',
      phone_masked: '138****1234', avatar_url: null, gender_label: '男', identity: 'user',
      account_status: 'active', account_status_label: '正常', risk_flag: null,
      date_joined: '2026-11-18T12:00:00+08:00', last_login: null,
      order_count: 0, activity_count: 0, browsing_count: 0, review_count: 0,
      recent_orders: [], recent_activities: [], addresses: [], browsing_history: [], reviews: [], function_restrictions: [],
    }
    const labels = { provider_order: '达人下单', activity_publish: '发布活动', review: '评价／评论' }
    let canManage = true, failNext = false
    const writes = [], errors = []
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === origin ? route.continue() : route.abort()
      let data = { items: [], pagination: { total: 0, page: 1, page_size: 20 }, counters: {} }
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'test-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = { user: { nickname: '测试客服', phone: '' }, organization: null, role_name: '客服', permissions: ['user.view', ...(canManage ? ['user.status.manage'] : [])], data_scope: 'all', city_codes: [] }
      else if (url.pathname.endsWith('/admin/users/')) data = { items: [user], pagination: { total: 1 }, summary: { total: 1, providers: 0, flagged: 0, suspended: 0 } }
      else if (url.pathname.endsWith('/function-action/')) {
        const body = request.postDataJSON()
        writes.push(body)
        if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { detail: '测试：操作失败，请重试' } }) }
        user.function_restrictions = user.function_restrictions.filter(item => !body.functions.includes(item.function))
        if (body.action === 'restrict') user.function_restrictions.push(...body.functions.map(value => ({
          function: value, function_label: labels[value], reason: body.reason,
          restricted_at: '2026-11-19T12:00:00+08:00', restricted_by_name: '测试客服',
        })))
        data = user
      } else if (url.pathname.endsWith('/account-action/')) {
        const { action } = request.postDataJSON()
        user.account_status = action === 'suspend' ? 'suspended' : 'active'
        user.account_status_label = action === 'suspend' ? '已封禁' : '正常'
        data = user
      } else if (url.pathname.includes('/admin/users/')) data = user
      await route.fulfill({ json: { data } })
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const openUser = async () => {
      await page.goto(`${origin}/#/users`)
      await page.reload()
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      await page.locator('.management-drawer > .el-loading-mask').waitFor({ state: 'hidden' })
    }
    await openUser()
    const manage = page.getByRole('button', { name: '功能限制', exact: true })
    assert.equal(await page.getByRole('button', { name: '限制账号', exact: true }).count(), 0)
    await manage.click()
    const dialog = page.getByRole('dialog', { name: '管理功能限制' })
    await dialog.getByRole('button', { name: '确认提交', exact: true }).click()
    await page.getByText('请选择要操作的功能', { exact: true }).waitFor()
    assert.equal(writes.length, 0)
    await dialog.locator('label.el-checkbox').filter({ hasText: '达人下单' }).click()
    await dialog.locator('label.el-checkbox').filter({ hasText: '评价／评论' }).click()
    assert.equal(await dialog.getByRole('checkbox', { name: /达人下单/ }).isChecked(), true)
    await dialog.getByRole('button', { name: '确认提交', exact: true }).click()
    await page.getByText('请填写明确的操作原因', { exact: true }).waitFor()
    assert.equal(writes.length, 0)
    await dialog.getByRole('textbox').fill('订单投诉核查中')
    failNext = true
    await dialog.getByRole('button', { name: '确认提交', exact: true }).click()
    await page.getByText('测试：操作失败，请重试', { exact: true }).waitFor()
    assert.equal(user.function_restrictions.length, 0)
    assert.equal(await dialog.getByRole('textbox').inputValue(), '订单投诉核查中')
    if (process.env.TEST_SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.TEST_SCREENSHOT_DIR, { recursive: true })
      await dialog.screenshot({ path: path.join(process.env.TEST_SCREENSHOT_DIR, 'user-function-restrictions.png') })
    }
    await dialog.getByRole('button', { name: '确认提交', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(writes.at(-1), { action: 'restrict', functions: ['provider_order', 'review'], reason: '订单投诉核查中' })
    assert.equal(user.account_status, 'active')
    await page.locator('.function-restrictions').getByText('2 项生效', { exact: true }).waitFor()
    await manage.click()
    assert.equal(await dialog.getByRole('checkbox', { name: /达人下单/ }).isDisabled(), true)
    await dialog.getByText('解除限制', { exact: true }).click()
    await dialog.locator('label.el-checkbox').filter({ hasText: '达人下单' }).click()
    assert.equal(await dialog.getByRole('checkbox', { name: /发布活动/ }).isDisabled(), true)
    await dialog.getByRole('textbox').fill('下单限制核实后解除')
    await dialog.getByRole('button', { name: '确认提交', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(writes.at(-1).functions, ['provider_order'])
    assert.deepEqual(user.function_restrictions.map(item => item.function), ['review'])
    await page.locator('.function-restrictions').getByText('1 项生效', { exact: true }).waitFor()
    await page.getByRole('button', { name: '封禁账号', exact: true }).click()
    const account = page.getByRole('dialog', { name: '封禁用户账号' })
    await account.getByRole('textbox').fill('安全复核')
    await account.getByRole('button', { name: '确认提交', exact: true }).click()
    await account.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '恢复账号', exact: true }).click()
    const restore = page.getByRole('dialog', { name: '恢复用户账号' })
    await restore.getByRole('textbox').fill('安全复核通过')
    await restore.getByRole('button', { name: '确认提交', exact: true }).click()
    await restore.waitFor({ state: 'hidden' })
    assert.equal(user.account_status, 'active')
    await page.locator('.function-restrictions').getByText('1 项生效', { exact: true }).waitFor()
    canManage = false
    await openUser()
    assert.equal(await manage.count(), 0)
    assert.deepEqual(errors, [])
    console.log('PASS: multi-select, reason validation, error retry, incremental release, account/function separation, read-only permissions; mocked APIs only')
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
