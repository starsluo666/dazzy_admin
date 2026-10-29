const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) })
  try {
    const base = process.env.ADMIN_TEST_URL || 'http://127.0.0.1:5196'
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    let manage = false, rejectStale = true
    const writes = [], errors = [], listQueries = []
    const row = { id: 1, public_id: '00000000-0000-0000-0000-000000000001', kind: 'nickname', kind_label: '用户昵称',
      target_id: 12, owner: 'user-1', status: 'manual', status_label: '待人工复核', revision: 1, is_current: true,
      title: '<img src=x onerror="window.unsafeContent=1">', reason: '等待人工内容审核。', machine_suggestion: 'Review',
      created_at: '2026-10-21T06:00:00Z', text: { 昵称: '<img src=x onerror="window.unsafeContent=1">' }, assets: [],
      items: [{ position: 0, kind: 'text', state: 'review', suggestion: 'Review', label: '', score: null, error_code: '', request_id: 'request-1', task_id: '' }],
      events: [{ action: 'submitted', revision: 1, actor: '系统', note: '已提交', created_at: '2026-10-21T06:00:00Z' }],
    }
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (!url.pathname.includes('/api/v1/')) return url.origin === new URL(base).origin ? route.continue() : route.abort()
      let data
      if (url.pathname.endsWith('/auth/refresh/')) data = { access: 'offline-only' }
      else if (url.pathname.endsWith('/admin/me/')) data = { user: { nickname: '内容审核员', phone: '' }, organization: null,
        permissions: ['content.review.view', ...(manage ? ['content.review.manage'] : [])], role_name: '内容审核员', data_scope: 'all', city_codes: [] }
      else if (url.pathname.endsWith('/admin/work/summary/')) data = { total: 0, unread_count: 0, todos: [] }
      else if (url.pathname.endsWith('/admin/content-reviews/')) {
        assert.equal(req.method(), 'GET')
        listQueries.push(url.searchParams.toString())
        assert.equal(url.searchParams.get('page'), '1')
        data = { items: [row], pagination: { page: 1, page_size: 20, total: 1 }, enabled: true, automatic: false }
      } else if (url.pathname.endsWith('/admin/content-reviews/1/')) {
        if (req.method() === 'POST') {
          const body = req.postDataJSON()
          writes.push(body)
          assert.equal(body.revision, row.revision)
          assert.equal(body.reason, '已逐项检查昵称内容')
          if (rejectStale) {
            rejectStale = false
            row.revision++
            return route.fulfill({ status: 400, json: { detail: '内容或检测结果已变化，请刷新后重新核查。' } })
          }
          row.status = body.action === 'approve' ? 'approved' : 'withdrawn'
          row.status_label = body.action === 'approve' ? '内容审核通过' : '已下架'
          row.revision++
        }
        data = row
      } else throw new Error(`Unexpected API: ${req.method()} ${url.pathname}`)
      return route.fulfill({ json: { data } })
    })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/#/content-reviews`)
    await page.getByRole('heading', { name: '内容审核', exact: true }).waitFor()
    await page.getByRole('button', { name: '核查详情', exact: true }).click()
    await page.getByRole('heading', { name: '送审内容', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '核实通过', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: '登记现有内容', exact: true }).count(), 0)
    assert.deepEqual(writes, [])
    assert.equal(await page.evaluate(() => window.unsafeContent), undefined)

    manage = true
    await page.reload()
    await page.getByRole('button', { name: '登记现有内容', exact: true }).waitFor()
    await page.getByRole('button', { name: '核查详情', exact: true }).click()
    const approve = page.getByRole('button', { name: '核实通过', exact: true })
    await approve.waitFor()
    assert.equal(await approve.isDisabled(), true)
    await page.getByRole('textbox', { name: '核查依据', exact: true }).fill('已逐项检查昵称内容')
    await approve.click()
    await page.getByRole('button', { name: '确认', exact: true }).click()
    await page.getByText('内容或检测结果已变化，请刷新后重新核查。', { exact: true }).waitFor()
    assert.equal(await approve.count(), 0)
    await page.getByRole('button', { name: '刷新详情', exact: true }).click()
    await approve.waitFor()
    await page.getByRole('textbox', { name: '核查依据', exact: true }).fill('已逐项检查昵称内容')
    await approve.click()
    await page.getByRole('button', { name: '确认', exact: true }).click()
    await page.getByRole('button', { name: '下架内容', exact: true }).waitFor()
    assert.equal(writes.length, 2)
    assert.equal(writes[0].revision, 1)
    assert.equal(writes[1].revision, 2)
    assert.ok(listQueries.length >= 3)
    assert.deepEqual(errors, [])
    const screenshot = require('node:path').join(require('node:os').tmpdir(), 'dazzy-content-reviews.png')
    await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' })
    console.log(`PASS read-only controls, staged content, escaped text, explicit confirmation, stale fencing and refresh; ${screenshot}`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
