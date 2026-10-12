// Run after npm run build. Serves dist locally; all APIs mocked, no business writes.
// Optional: PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, TEST_SCREENSHOT_DIR.
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce' })
    const identity = (id, nickname) => ({ public_id: id, nickname, phone_masked: '138****1234', invited_at: '2026-09-01T12:00:00+08:00' })
    const owner = identity('00000000-0000-4000-8000-000000000001', '邀请统计用户')
    const inviter = identity('00000000-0000-4000-8000-000000000002', '上级邀请人')
    const user = person => ({ ...person, avatar_url: null, gender_label: '男', identity: 'user',
      account_status: 'active', account_status_label: '正常', risk_flag: null, date_joined: person.invited_at,
      last_login: null, order_count: 0, activity_count: 0, browsing_count: 0, review_count: 0,
      recent_orders: [], recent_activities: [], addresses: [], browsing_history: [], reviews: [],
    })
    const fixtures = Array.from({ length: 12 }, (_, n) => ({
      ...identity(`00000000-0000-4000-8000-${String(n + 100).padStart(12, '0')}`, `被邀请用户${n + 1}`),
      order_count: n + 1, latest_order_at: `2026-10-${String(n + 1).padStart(2, '0')}T12:00:00+08:00`,
    }))
    const requests = [], errors = []
    let failNext = false, holdNext = false, releaseHeld, heldDone
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === origin ? route.continue() : route.abort()
      let data = { items: [], pagination: { total: 0 }, counters: {} }
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'local-test-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = { user: { nickname: '测试客服', phone: '' }, organization: null, role_name: '客服', permissions: ['user.view'], data_scope: 'all', city_codes: [] }
      else if (url.pathname.endsWith('/admin/users/')) data = { items: [user(owner)], pagination: { total: 1 }, summary: { total: 1, providers: 0, flagged: 0, suspended: 0 } }
      else if (url.pathname.endsWith('/invitations/')) {
        const query = Object.fromEntries(url.searchParams)
        requests.push(query)
        if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { detail: '测试加载失败' } }) }
        const isOwner = url.pathname.includes(owner.public_id)
        const rows = (isOwner ? fixtures : []).map(row => {
          const day = row.latest_order_at.slice(0, 10)
          return (!query.date_from || day >= query.date_from) && (!query.date_to || day <= query.date_to)
            ? row : { ...row, order_count: 0, latest_order_at: null }
        }).sort((a, b) => (b.latest_order_at || '').localeCompare(a.latest_order_at || ''))
        const page = Number(query.page || 1), size = Number(query.page_size || 10)
        data = { inviter: isOwner ? inviter : null, inviter_restricted: false,
          items: rows.slice((page - 1) * size, page * size),
          summary: { invitee_count: rows.length, ordering_user_count: rows.filter(row => row.order_count).length, order_count: rows.reduce((sum, row) => sum + row.order_count, 0) },
          pagination: { total: rows.length, page, page_size: size },
          filters: { date_from: query.date_from || null, date_to: query.date_to || null, timezone: 'Asia/Shanghai' }, data_scope: 'all',
        }
        if (holdNext) {
          holdNext = false
          let done
          heldDone = new Promise(resolve => { done = resolve })
          await new Promise(resolve => { releaseHeld = resolve })
          await route.fulfill({ json: { data } })
          done()
          return
        }
      } else if (url.pathname.includes('/admin/users/')) data = user(url.pathname.includes(inviter.public_id) ? inviter : owner)
      await route.fulfill({ json: { data } })
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const panel = page.locator('.invitation-panel')
    const open = async () => {
      await page.goto(`${origin}/#/users`)
      await page.reload()
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      await panel.locator('.invitation-total b').getByText('78', { exact: true }).waitFor()
    }
    const assertTotal = async value => {
      await panel.locator('.invitation-total b').getByText(String(value), { exact: true }).waitFor()
    }
    const filter = async (start, end) => {
      const inputs = panel.locator('.el-range-input')
      await inputs.nth(0).fill(start)
      await inputs.nth(0).press('Tab')
      await inputs.nth(1).fill(end)
      await inputs.nth(1).press('Enter')
      await panel.getByRole('heading').click()
    }
    await open()
    assert.equal(await panel.locator('.invitee-person').count(), 10)
    assert.match(await panel.locator('.invitee-person').first().innerText(), /被邀请用户12/)
    assert.match(await panel.locator('.order-time').first().innerText(), /2026-10-12 12:00/)
    await panel.locator('.el-pagination .btn-next').click()
    await panel.getByRole('button', { name: '被邀请用户2', exact: true }).waitFor()
    await assertTotal(78)
    assert.equal(await panel.locator('.invitee-person').count(), 2)
    await filter('2026-10-02', '2026-10-04')
    await assertTotal(9)
    assert.equal(requests.at(-1).page, '1')
    assert.equal(requests.at(-1).date_from, '2026-10-02')
    assert.equal(requests.at(-1).date_to, '2026-10-04')
    assert.match(await panel.locator('.invitee-person').first().innerText(), /被邀请用户4/)
    assert.ok(await panel.getByText('暂无有效订单').count() > 0)

    // A slower older request must not overwrite the newer date range.
    holdNext = true
    await panel.getByRole('button', { name: '刷新', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.invitation-panel').getAttribute('aria-busy') === 'true')
    await filter('2026-10-05', '2026-10-06')
    await assertTotal(11)
    assert.ok(releaseHeld, 'old request is held')
    releaseHeld()
    await heldDone
    await page.waitForTimeout(150)
    await assertTotal(11)
    assert.match(await panel.locator('.invitation-total').innerText(), /2026-10-05 至 2026-10-06/)

    failNext = true
    await panel.getByRole('button', { name: '刷新', exact: true }).click()
    await panel.getByRole('alert').waitFor()
    assert.equal(await panel.locator('.invitation-total').count(), 0, 'failure must not masquerade as zero orders')
    await panel.getByRole('button', { name: '重试', exact: true }).click()
    await assertTotal(11)
    await panel.locator('.el-date-editor').hover()
    await panel.locator('.el-range__close-icon').click()
    await assertTotal(78)
    assert.equal(requests.at(-1).date_from, undefined)
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 })
      await panel.scrollIntoViewIfNeeded()
      const layout = await panel.evaluate(el => ({ overflow: el.scrollWidth > el.clientWidth, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right }))
      assert.ok(!layout.overflow && layout.left >= 0 && layout.right <= width + 1, `panel fits ${width}: ${JSON.stringify(layout)}`)
      if (process.env.TEST_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.TEST_SCREENSHOT_DIR, { recursive: true })
        await panel.screenshot({ path: path.join(process.env.TEST_SCREENSHOT_DIR, `user-invitations-${width}.png`) })
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 })
    holdNext = true
    await panel.getByRole('button', { name: '刷新', exact: true }).click()
    await page.getByRole('button', { name: '关闭用户详情' }).click()
    await page.getByRole('button', { name: '查看详情', exact: true }).click()
    await assertTotal(78)
    await panel.getByRole('button', { name: '上级邀请人', exact: true }).click()
    await page.locator('.identity-heading h3').getByText('上级邀请人', { exact: true }).waitFor()
    await panel.getByText('无邀请人', { exact: true }).waitFor()
    await panel.getByText('暂无直接邀请用户', { exact: true }).waitFor()
    releaseHeld()
    await heldDone
    await page.waitForTimeout(150)
    await assertTotal(0)
    assert.deepEqual(errors, [])
    console.log('PASS: dates, timezone, ordering, zero rows, cross-page total, reset, retry, stale responses, linked inviter and responsive layout; mocked APIs only')
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
