const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')
const source = fs.readFileSync(path.join(__dirname, '../src/utils/receivingSettings.ts'), 'utf8')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject })
const { emptyReceivingForm, normalizeReceivingForm, receivingFormError, receivingSummary } = exportsObject
const form = { ...emptyReceivingForm(), cash_type: 'T1', out_fee_acct_type: '01', fix_amt: '0' }
assert.ok(receivingFormError(emptyReceivingForm()))
assert.equal(receivingFormError(form), '')
assert.equal(normalizeReceivingForm({ ...form, fee_rate: ' ' }).fee_rate, null)
assert.equal(normalizeReceivingForm(form).fix_amt, '0')
for (const changes of [
  { cash_type: 'D0' }, { out_fee_acct_type: '99' }, { fix_amt: '' }, { fix_amt: '-1' },
  { fix_amt: '0.001' }, { fix_amt: 'NaN' }, { fix_amt: '1e2' }, { fix_amt: '1000' },
  { fee_rate: '100.01' }, { weekday_fix_amt: '0' },
]) assert.ok(receivingFormError({ ...form, ...changes }), JSON.stringify(changes))
const d1 = { ...form, cash_type: 'D1', fee_rate: '0.05', weekday_fix_amt: '0' }
assert.equal(receivingFormError(d1), '')
const summary = receivingSummary(d1)
assert.ok(summary.some((item) => item.value === '0.05%'))
assert.ok(summary.some((item) => item.label.includes('工作日') && item.value === '0.00 元 / 笔'))
assert.ok(summary.some((item) => item.value.includes('未填写，按渠道节假日配置')))
assert.equal(receivingFormError({ ...form, fix_amt: '999.99', fee_rate: '100' }), '')
console.log('PASS: receiving fees, bounds, empty vs zero, D1 fields and percentage display')
