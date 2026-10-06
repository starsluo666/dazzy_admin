const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')

// Exercise the component's actual refresh function with deferred list requests.
const source = fs.readFileSync(path.join(__dirname, '../src/components/CouponBatchPanel.vue'), 'utf8')
const start = source.indexOf('async function refresh(')
const end = source.indexOf('async function previewBatch()', start)
assert.ok(start >= 0 && end > start)
const script = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

async function checkRefreshRace(failFirst) {
  const pending = [], errors = []
  const state = {
    rows: { value: [] }, loading: { value: false }, refreshAgain: false,
    adminApi: { couponBatches: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
    ElMessage: { error: message => errors.push(message) },
  }
  vm.createContext(state)
  vm.runInContext(script, state)
  const initial = state.refresh()
  await state.refresh() // A batch confirmation finishes while the list is loading.
  await state.refresh() // Coalesce additional triggers into one follow-up request.
  assert.equal(pending.length, 1)
  if (failFirst) pending[0].reject('simulated list failure')
  else pending[0].resolve({ items: [] })
  await initial
  assert.equal(pending.length, 2, 'a skipped refresh must be retried after the old response')
  assert.equal(state.loading.value, true)
  pending[1].resolve({ items: [{ public_id: 'confirmed-batch', status: 'queued' }] })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.rows.value[0].status, 'queued')
  assert.equal(state.loading.value, false)
  assert.equal(errors.length, failFirst ? 1 : 0)
}

async function main() {
  await checkRefreshRace(false)
  await checkRefreshRace(true)
  console.log('PASS coupon batch confirmation refresh survives an in-flight or failed older list request')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
