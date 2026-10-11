const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const ts = require('typescript')
function compile(source, globals = {}) {
  const context = { exports: {}, ...globals }
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return context.exports
}
const navigation = compile(fs.readFileSync(path.join(__dirname, '../src/navigation.ts'), 'utf8'))
const shellSource = fs.readFileSync(path.join(__dirname, '../src/layouts/AdminShell.vue'), 'utf8')
  .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
const props = { active: 'dashboard', preview: false, session: { permissions: ['dashboard.view', 'operations.manage'] } }
const shell = compile(shellSource + '\nexports.controls = { navigation, toggleGroup, itemVisible };', {
  defineProps: () => props, defineEmits: () => () => {},
  require: key => {
    if (key === 'vue') return {
      computed: fn => ({ get value() { return fn() } }), ref: value => ({ value }),
      watch: (getter, cb, options) => { if (options?.immediate) cb(getter()) },
    }
    if (key === '../navigation') return navigation
    if (key === '@element-plus/icons-vue' || key === '../components/OperationsInbox.vue') return {}
    assert.fail(`Unexpected dependency ${key}`)
  },
}).controls
const campaignMenu = () => shell.navigation.value.find(item => item.key === 'coupon_campaigns')
assert.equal(campaignMenu(), undefined, 'old permission set reproduces the hidden menu')
assert.equal(navigation.canAccessAdminPage('coupon_campaigns', props.session.permissions), false)
props.session.permissions = ['dashboard.view', 'operations.manage', 'coupon_campaign.view', 'coupon_campaign.manage']
assert.ok(campaignMenu(), 'refreshed session after migration exposes the menu')
assert.equal(campaignMenu().parent, 'operations-group')
assert.equal(campaignMenu().enabled, true)
shell.toggleGroup('operations-group')
assert.equal(shell.itemVisible(campaignMenu()), true)
assert.equal(navigation.canAccessAdminPage('coupon_campaigns', props.session.permissions), true)
for (const permissions of [[], ['coupon.view', 'coupon.manage'], ['operations.manage'], ['coupon_campaign.manage']]) {
  props.session.permissions = permissions
  assert.equal(campaignMenu(), undefined)
  assert.equal(navigation.canAccessAdminPage('coupon_campaigns', permissions), false)
}
for (const permissions of [['coupon_campaign.view'], ['*']]) {
  props.session.permissions = permissions
  assert.ok(campaignMenu())
  assert.equal(navigation.canAccessAdminPage('coupon_campaigns', permissions), true)
}
console.log('PASS coupon campaign menu: repaired platform grants, refreshed session, group visibility and independent view permission')
