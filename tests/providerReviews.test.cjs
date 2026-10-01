const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../src/utils/providerReviews.ts'), 'utf8')
const exportsObject = {}
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject })
const { parseProviderReviewMode, parseProviderReviewStatus, providerReviewModeForTodo, firstPendingProviderReview, providerReviewNotice } = exportsObject

const queues = {
  provider_application_review: 'application',
  provider_onboarding_review: 'onboarding',
  provider_profile_review: 'profile',
  provider_service_review: 'service',
}
for (const [key, mode] of Object.entries(queues)) {
  assert.equal(providerReviewModeForTodo(key), mode)
  assert.equal(parseProviderReviewMode(mode), mode)
  assert.equal(parseProviderReviewStatus('approved', mode), 'approved')
  assert.equal(parseProviderReviewStatus('rejected', mode), 'rejected')
  assert.equal(parseProviderReviewStatus(undefined, mode), 'pending')
  assert.equal(parseProviderReviewStatus('suspended', mode), mode === 'application' ? 'suspended' : 'pending')
}
for (const value of [undefined, null, '', 'unknown', ['onboarding']]) {
  assert.equal(parseProviderReviewMode(value), 'application')
  assert.equal(parseProviderReviewStatus(value, 'onboarding'), 'pending')
}
assert.equal(providerReviewModeForTodo('activity_review'), null)
assert.equal(providerReviewModeForTodo('provider_review'), 'application')

const empty = { applications: 0, onboarding: 0, profile_changes: 0, service_changes: 0, total: 0 }
for (const [field, mode] of Object.entries({ applications: 'application', onboarding: 'onboarding', profile_changes: 'profile', service_changes: 'service' })) {
  const summary = { ...empty, [field]: 2, total: 2 }
  assert.equal(firstPendingProviderReview(summary), mode)
  assert.equal(providerReviewNotice(summary, null).mode, mode)
  assert.equal(providerReviewNotice(summary, summary), null)
  assert.equal(providerReviewNotice(empty, summary), null)
}
// Processing an initial application and receiving onboarding work may leave total unchanged.
const initial = { ...empty, applications: 1, total: 1 }
const onboarding = { ...empty, onboarding: 1, total: 1 }
assert.equal(providerReviewNotice(onboarding, initial).mode, 'onboarding')
assert.match(providerReviewNotice(onboarding, initial).message, /开通审核 1 条/)
assert.equal(providerReviewNotice(empty, null), null)
console.log('PASS: review queue mapping, URL validation, status routing, and per-queue notifications')
