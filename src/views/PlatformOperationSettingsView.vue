<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  Calendar,
  Check,
  Clock,
  EditPen,
  Flag,
  Lock,
  Money,
  Promotion,
  Refresh,
  User,
  UserFilled,
  Wallet,
  Warning,
} from '@element-plus/icons-vue'
import FlowRuleCard from '../components/operation-settings/FlowRuleCard.vue'
import { adminApi } from '../services/api'
import type { AdminAuditLog, PlatformOperationSetting } from '../types'
import { formatDateTime } from '../utils/format'

type FieldKey = Exclude<keyof PlatformOperationSetting, 'updated_at'>
type GroupKey = 'all' | 'provider' | 'activity' | 'settlement'
type ViewMode = 'flow' | 'list'

interface RuleDefinition {
  key: FieldKey
  group: Exclude<GroupKey, 'all'>
  label: string
  unit: string
  min: number
  max: number
  step: number
  help: string
  impact: string
  scope: string
  risk: string
}

const defaults: Record<FieldKey, number> = {
  provider_order_payment_timeout_minutes: 15,
  provider_order_confirmation_timeout_days: 3,
  provider_order_settlement_freeze_days: 1,
  activity_payment_timeout_minutes: 30,
  activity_minimum_advance_hours: 48,
  activity_maximum_advance_days: 30,
  activity_settlement_confirmation_hours: 24,
  activity_settlement_risk_freeze_days: 7,
}

const rules: RuleDefinition[] = [
  {
    key: 'provider_order_payment_timeout_minutes',
    group: 'provider',
    label: '待支付保留时间',
    unit: '分钟',
    min: 5,
    max: 60,
    step: 5,
    help: '超时未支付，订单自动取消并释放达人档期',
    impact: '达人订单、达人档期',
    scope: '新创建的待支付订单',
    risk: '缩短时限可能降低支付转化，延长时限会占用达人档期。',
  },
  {
    key: 'provider_order_confirmation_timeout_days',
    group: 'provider',
    label: '用户确认超时标准',
    unit: '天',
    min: 1,
    max: 15,
    step: 1,
    help: '超时未确认，订单进入后台异常识别',
    impact: '待确认达人订单',
    scope: '当前及后续待确认订单',
    risk: '缩短时限会更早标记异常订单，需确保客服处理能力匹配。',
  },
  {
    key: 'provider_order_settlement_freeze_days',
    group: 'provider',
    label: '订单资金冻结期',
    unit: '天',
    min: 0,
    max: 30,
    step: 1,
    help: '确认完成后冻结，到期自动结算',
    impact: '达人收入、平台抽成',
    scope: '新生成的达人订单结算单',
    risk: '冻结期过短会压缩退款售后的风险处理窗口。',
  },
  {
    key: 'activity_minimum_advance_hours',
    group: 'activity',
    label: '最少提前发布',
    unit: '小时',
    min: 2,
    max: 168,
    step: 2,
    help: '活动开始时间不能早于该值',
    impact: '活动发布人、新建活动',
    scope: '新提交的活动',
    risk: '过短的准备期可能影响审核、招募和成局效率。',
  },
  {
    key: 'activity_maximum_advance_days',
    group: 'activity',
    label: '最远可发布',
    unit: '天',
    min: 2,
    max: 90,
    step: 1,
    help: '活动开始时间不能超过该值',
    impact: '活动发布人、新建活动',
    scope: '新提交的活动',
    risk: '过长的发布周期会增加场地、人员与时间变动风险。',
  },
  {
    key: 'activity_payment_timeout_minutes',
    group: 'activity',
    label: '报名支付时限',
    unit: '分钟',
    min: 5,
    max: 60,
    step: 5,
    help: '超时未支付，自动释放活动名额',
    impact: '活动参与者、活动名额',
    scope: '新创建的报名支付单',
    risk: '缩短时限可能降低报名转化，延长时限会占用活动名额。',
  },
  {
    key: 'activity_settlement_confirmation_hours',
    group: 'settlement',
    label: '履约确认期',
    unit: '小时',
    min: 1,
    max: 168,
    step: 1,
    help: '活动结束后进入履约确认',
    impact: '活动结算单、活动发起人',
    scope: '新生成的活动结算单',
    risk: '缩短确认期可能压缩参与者反馈和售后申请时间。',
  },
  {
    key: 'activity_settlement_risk_freeze_days',
    group: 'settlement',
    label: '风险冻结期',
    unit: '天',
    min: 1,
    max: 30,
    step: 1,
    help: '确认期结束后冻结资金至可结算',
    impact: '活动结算单',
    scope: '新生成的活动结算单',
    risk: '缩短冻结期可能增加售后资金风险。',
  },
]

const emit = defineEmits<{ 'open-audit': [] }>()
const loading = ref(false)
const saving = ref(false)
const updatedAt = ref('')
const viewMode = ref<ViewMode>('flow')
const activeGroup = ref<GroupKey>('all')
const selectedRuleKey = ref<FieldKey>('activity_settlement_risk_freeze_days')
const recentAudits = ref<AdminAuditLog[]>([])
const form = reactive<Record<FieldKey, number>>({ ...defaults })
const savedSnapshot = reactive<Record<FieldKey, number>>({ ...defaults })

const selectedRule = computed(() => rules.find((rule) => rule.key === selectedRuleKey.value) || rules[0]!)
const filteredRules = computed(() => activeGroup.value === 'all'
  ? rules
  : rules.filter((rule) => rule.group === activeGroup.value))
const isDirty = computed(() => rules.some((rule) => form[rule.key] !== savedSnapshot[rule.key]))
const showProvider = computed(() => activeGroup.value === 'all' || activeGroup.value === 'provider')
const showActivity = computed(() => activeGroup.value === 'all' || activeGroup.value === 'activity')
const showSettlement = computed(() => activeGroup.value === 'all' || activeGroup.value === 'settlement')

function formatDate(value: string) {
  return formatDateTime(value, '尚未保存')
}

function selectRule(key: FieldKey) {
  selectedRuleKey.value = key
}

function selectGroup(group: GroupKey) {
  activeGroup.value = group
  if (group !== 'all') {
    const firstRule = rules.find((rule) => rule.group === group)
    if (firstRule) selectedRuleKey.value = firstRule.key
  }
}

function updateRule(key: FieldKey, value: number) {
  form[key] = value
  selectRule(key)
}

function restoreDefaults() {
  Object.assign(form, defaults)
  ElMessage.success('已恢复推荐默认值，发布后生效')
}

function cancelChanges() {
  Object.assign(form, savedSnapshot)
  ElMessage.info('已撤销本次未发布修改')
}

function auditDescription(log: AdminAuditLog) {
  const rule = rules.find((item) => log.before?.[item.key] !== log.after?.[item.key])
  if (!rule) return '更新平台参数'
  return `修改 ${rule.label}：${log.before?.[rule.key]}${rule.unit} → ${log.after?.[rule.key]}${rule.unit}`
}

async function loadRecentAudits() {
  try {
    const data = await adminApi.auditLogs({
      action: 'operations.platform.update',
      target_type: 'operation_setting',
      page: 1,
      page_size: 3,
    })
    recentAudits.value = data.items
  } catch {
    recentAudits.value = []
  }
}

async function load() {
  loading.value = true
  try {
    const data = await adminApi.platformOperationSetting()
    for (const rule of rules) {
      form[rule.key] = data[rule.key]
      savedSnapshot[rule.key] = data[rule.key]
    }
    updatedAt.value = data.updated_at
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '平台参数加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const data = await adminApi.updatePlatformOperationSetting({ ...form })
    for (const rule of rules) {
      form[rule.key] = data[rule.key]
      savedSnapshot[rule.key] = data[rule.key]
    }
    updatedAt.value = data.updated_at
    await loadRecentAudits()
    ElMessage.success('平台参数已发布并写入审计日志')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '平台参数发布失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  load()
  loadRecentAudits()
})
</script>

<template>
  <div class="page settings-page" v-loading="loading">
    <header class="page-heading settings-heading">
      <div class="heading-copy">
        <h1>平台参数</h1>
        <p>沿业务流程配置平台核心时限，清楚看到每项规则的影响节点</p>
      </div>
      <el-button type="primary" :loading="saving" @click="save">发布配置</el-button>
    </header>

    <nav class="view-switch" aria-label="参数视图">
      <button :class="{ active: viewMode === 'flow' }" @click="viewMode = 'flow'">流程视图</button>
      <button :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">列表视图</button>
    </nav>

    <div class="workbench-layout">
      <section class="workbench-core">
        <aside class="parameter-directory">
          <header>
            <strong>参数目录</strong>
            <span>按业务场景筛选</span>
          </header>
          <nav>
            <button :class="{ active: activeGroup === 'all' }" @click="selectGroup('all')">
              <span><el-icon><Flag /></el-icon>全部参数</span><b>7 项</b>
            </button>
            <button :class="{ active: activeGroup === 'provider' }" @click="selectGroup('provider')">
              <span><el-icon><UserFilled /></el-icon>达人订单</span><b>2 项</b>
            </button>
            <button :class="{ active: activeGroup === 'activity' }" @click="selectGroup('activity')">
              <span><el-icon><Calendar /></el-icon>活动发布</span><b>3 项</b>
            </button>
            <button :class="{ active: activeGroup === 'settlement' }" @click="selectGroup('settlement')">
              <span><el-icon><Wallet /></el-icon>活动结算</span><b>2 项</b>
            </button>
          </nav>
          <div class="save-state" :class="{ dirty: isDirty }">
            <span><i></i>{{ isDirty ? '存在未发布修改' : '全部配置已发布' }}</span>
            <small>{{ isDirty ? '发布后规则才会生效' : '配置状态正常' }}</small>
          </div>
        </aside>

        <div class="editor-column">
          <div v-if="viewMode === 'flow'" class="flow-canvas">
            <section v-if="showProvider" class="flow-lane">
              <header class="lane-heading">
                <span>01</span>
                <div><strong>达人订单生命周期</strong><small>下单 · 支付 · 履约 · 确认</small></div>
              </header>
              <div class="flow-track provider-track">
                <div class="stage-node"><el-icon><User /></el-icon><strong>创建订单</strong><small>用户提交需求</small></div>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <FlowRuleCard
                  label="待支付保留时间"
                  :model-value="form.provider_order_payment_timeout_minutes"
                  unit="分钟"
                  :min="5"
                  :max="60"
                  :step="5"
                  help="超时取消并释放档期"
                  :icon="Clock"
                  :selected="selectedRuleKey === 'provider_order_payment_timeout_minutes'"
                  @update:model-value="updateRule('provider_order_payment_timeout_minutes', $event)"
                  @select="selectRule('provider_order_payment_timeout_minutes')"
                />
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <div class="stage-node"><el-icon><Promotion /></el-icon><strong>达人接单</strong><small>服务履约</small></div>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <FlowRuleCard
                  label="用户确认超时标准"
                  :model-value="form.provider_order_confirmation_timeout_days"
                  unit="天"
                  :min="1"
                  :max="15"
                  help="超时进入异常识别"
                  :icon="Check"
                  :selected="selectedRuleKey === 'provider_order_confirmation_timeout_days'"
                  @update:model-value="updateRule('provider_order_confirmation_timeout_days', $event)"
                  @select="selectRule('provider_order_confirmation_timeout_days')"
                />
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <FlowRuleCard
                  label="订单资金冻结期"
                  :model-value="form.provider_order_settlement_freeze_days"
                  unit="天"
                  :min="0"
                  :max="30"
                  help="到期自动结算"
                  :icon="Lock"
                  :selected="selectedRuleKey === 'provider_order_settlement_freeze_days'"
                  @update:model-value="updateRule('provider_order_settlement_freeze_days', $event)"
                  @select="selectRule('provider_order_settlement_freeze_days')"
                />
              </div>
            </section>

            <section v-if="showActivity" class="flow-lane">
              <header class="lane-heading">
                <span>02</span>
                <div><strong>活动发布与报名</strong><small>发布 · 招募 · 报名 · 支付</small></div>
              </header>
              <div class="flow-track activity-track">
                <div class="stage-node"><el-icon><Calendar /></el-icon><strong>发布活动</strong><small>提交活动信息</small></div>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <article
                  class="dual-rule-card"
                  :class="{ selected: selectedRuleKey === 'activity_minimum_advance_hours' || selectedRuleKey === 'activity_maximum_advance_days' }"
                >
                  <strong><el-icon><Clock /></el-icon>发布时间窗口</strong>
                  <label @click="selectRule('activity_minimum_advance_hours')">
                    <span>最少提前</span>
                    <el-input-number
                      :model-value="form.activity_minimum_advance_hours"
                      :min="2"
                      :max="168"
                      :step="2"
                      @update:model-value="updateRule('activity_minimum_advance_hours', Number($event))"
                      @focus="selectRule('activity_minimum_advance_hours')"
                    />
                    <em>小时</em>
                  </label>
                  <label @click="selectRule('activity_maximum_advance_days')">
                    <span>最远可发</span>
                    <el-input-number
                      :model-value="form.activity_maximum_advance_days"
                      :min="2"
                      :max="90"
                      @update:model-value="updateRule('activity_maximum_advance_days', Number($event))"
                      @focus="selectRule('activity_maximum_advance_days')"
                    />
                    <em>天</em>
                  </label>
                </article>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <div class="stage-node"><el-icon><UserFilled /></el-icon><strong>用户报名</strong><small>锁定活动名额</small></div>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <FlowRuleCard
                  label="报名支付时限"
                  :model-value="form.activity_payment_timeout_minutes"
                  unit="分钟"
                  :min="5"
                  :max="60"
                  :step="5"
                  help="超时自动释放活动名额"
                  :icon="Money"
                  :selected="selectedRuleKey === 'activity_payment_timeout_minutes'"
                  @update:model-value="updateRule('activity_payment_timeout_minutes', $event)"
                  @select="selectRule('activity_payment_timeout_minutes')"
                />
              </div>
            </section>

            <section v-if="showSettlement" class="flow-lane settlement-lane">
              <header class="lane-heading">
                <span>03</span>
                <div><strong>活动结算生命周期</strong><small>结束 · 确认 · 风险冻结 · 结算</small></div>
              </header>
              <div class="flow-track settlement-track">
                <div class="stage-node"><el-icon><Flag /></el-icon><strong>活动结束</strong><small>生成结算单</small></div>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <FlowRuleCard
                  label="履约确认期"
                  :model-value="form.activity_settlement_confirmation_hours"
                  unit="小时"
                  :min="1"
                  :max="168"
                  help="活动结束后进入确认"
                  :icon="Check"
                  :selected="selectedRuleKey === 'activity_settlement_confirmation_hours'"
                  @update:model-value="updateRule('activity_settlement_confirmation_hours', $event)"
                  @select="selectRule('activity_settlement_confirmation_hours')"
                />
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <FlowRuleCard
                  label="风险冻结期"
                  :model-value="form.activity_settlement_risk_freeze_days"
                  unit="天"
                  :min="1"
                  :max="30"
                  help="确认后冻结资金至可结算"
                  :icon="Warning"
                  :selected="selectedRuleKey === 'activity_settlement_risk_freeze_days'"
                  risk
                  @update:model-value="updateRule('activity_settlement_risk_freeze_days', $event)"
                  @select="selectRule('activity_settlement_risk_freeze_days')"
                />
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <div class="stage-node complete"><el-icon><Wallet /></el-icon><strong>可结算</strong><small>进入可用余额</small></div>
              </div>
            </section>
          </div>

          <div v-else class="rule-list-view">
            <header><div><strong>参数列表</strong><small>集中查看和编辑当前目录下的全部规则</small></div><span>{{ filteredRules.length }} 项配置</span></header>
            <div class="rule-table-head"><span>参数名称</span><span>业务分组</span><span>当前值</span><span>生效范围</span></div>
            <article
              v-for="rule in filteredRules"
              :key="rule.key"
              class="rule-table-row"
              :class="{ selected: selectedRuleKey === rule.key }"
              role="button"
              tabindex="0"
              @click="selectRule(rule.key)"
              @keydown.enter="selectRule(rule.key)"
              @keydown.space.prevent="selectRule(rule.key)"
            >
              <span class="rule-name"><strong>{{ rule.label }}</strong><small>{{ rule.help }}</small></span>
              <span><el-tag effect="plain" size="small">{{ rule.group === 'provider' ? '达人订单' : rule.group === 'activity' ? '活动发布' : '活动结算' }}</el-tag></span>
              <span class="inline-editor" @click.stop="selectRule(rule.key)">
                <el-input-number
                  :model-value="form[rule.key]"
                  :min="rule.min"
                  :max="rule.max"
                  :step="rule.step"
                  @update:model-value="updateRule(rule.key, Number($event))"
                  @focus="selectRule(rule.key)"
                />
                <em>{{ rule.unit }}</em>
              </span>
              <span class="scope-copy">{{ rule.scope }}<el-icon><ArrowRight /></el-icon></span>
            </article>
          </div>

          <footer class="editor-actions">
            <button class="text-action" @click="restoreDefaults">恢复默认</button>
            <span>最后更新：{{ formatDate(updatedAt) }}</span>
            <el-button :disabled="!isDirty" @click="cancelChanges">取消</el-button>
            <el-button type="primary" :loading="saving" @click="save">发布配置</el-button>
          </footer>
        </div>
      </section>

      <aside class="rule-inspector">
        <header><div><strong>规则影响</strong><span>当前选中参数</span></div><button title="刷新审计记录" @click="loadRecentAudits"><el-icon><Refresh /></el-icon></button></header>
        <section class="selected-rule">
          <div class="selected-title">
            <i :class="{ risk: selectedRule.group === 'settlement' }"><el-icon><component :is="selectedRule.group === 'settlement' ? Lock : EditPen" /></el-icon></i>
            <div><small>{{ selectedRule.group === 'provider' ? '达人订单' : selectedRule.group === 'activity' ? '活动发布' : '活动结算' }}</small><strong>{{ selectedRule.label }}</strong></div>
            <b>{{ form[selectedRule.key] }} {{ selectedRule.unit }}</b>
          </div>
          <dl>
            <div><dt>影响对象</dt><dd>{{ selectedRule.impact }}</dd></div>
            <div><dt>生效范围</dt><dd>{{ selectedRule.scope }}</dd></div>
            <div class="risk-note"><dt><el-icon><Warning /></el-icon>变更提醒</dt><dd>{{ selectedRule.risk }}</dd></div>
          </dl>
        </section>
        <section class="recent-audits">
          <header><strong>最近变更</strong><span>最多显示 3 条</span></header>
          <div v-if="recentAudits.length" class="audit-timeline">
            <article v-for="audit in recentAudits" :key="audit.id">
              <i></i>
              <div><strong>{{ auditDescription(audit) }}</strong><p>{{ audit.actor_name }} · {{ formatDate(audit.created_at) }}</p></div>
            </article>
          </div>
          <div v-else class="empty-audits">暂无平台参数变更记录</div>
          <button class="audit-link" @click="emit('open-audit')">查看全部记录 <el-icon><ArrowRight /></el-icon></button>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  --settings-accent: #08b5ba;
  --settings-ink: #192231;
  --settings-muted: #7a8492;
  --settings-line: #e0e5ea;
  padding: 20px 24px 24px;
  background: #f6f8fa;
}
.settings-heading { height: 54px; }
.heading-copy { display: flex; align-items: baseline; gap: 18px; }
.settings-heading h1 { font-size: 23px; }
.settings-heading p { margin: 0; font-size: 13px; }
.settings-heading .el-button { width: 116px; height: 40px; border-radius: 5px; }
.view-switch {
  display: flex;
  align-items: end;
  gap: 36px;
  height: 54px;
  padding: 0 4px;
  border-bottom: 1px solid var(--settings-line);
}
.view-switch button {
  position: relative;
  height: 50px;
  padding: 0 5px;
  border: 0;
  color: #6d7683;
  background: transparent;
  font-size: 14px;
}
.view-switch button.active { color: var(--settings-accent); font-weight: 650; }
.view-switch button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: var(--settings-accent);
  content: '';
}
.workbench-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 286px;
  gap: 9px;
  min-height: calc(100vh - 228px);
  padding-top: 10px;
}
.workbench-core {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--settings-line);
  border-radius: 7px;
  background: #fff;
}
.parameter-directory {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  border-right: 1px solid var(--settings-line);
  background: #fbfcfd;
}
.parameter-directory > header { padding: 19px 18px 14px; }
.parameter-directory header strong { display: block; font-size: 15px; }
.parameter-directory header span { display: block; margin-top: 5px; color: var(--settings-muted); font-size: 11px; }
.parameter-directory nav { padding: 0 9px; }
.parameter-directory nav button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 45px;
  margin-bottom: 4px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  color: #596371;
  background: transparent;
  text-align: left;
}
.parameter-directory nav button > span { display: flex; align-items: center; gap: 9px; }
.parameter-directory nav button .el-icon { font-size: 16px; }
.parameter-directory nav button b { color: #9aa2ad; font-size: 11px; font-weight: 500; }
.parameter-directory nav button:hover { background: #f0f8f8; }
.parameter-directory nav button.active { color: #087f84; background: #e8f8f8; font-weight: 650; }
.parameter-directory nav button.active b { color: #079ca1; }
.save-state {
  margin: auto 13px 16px;
  padding: 12px;
  border: 1px solid #dce8e8;
  border-radius: 6px;
  background: #f6fbfb;
}
.save-state span { display: flex; align-items: center; gap: 7px; color: #367577; font-size: 11px; font-weight: 650; }
.save-state i { width: 7px; height: 7px; border-radius: 50%; background: #20b983; }
.save-state small { display: block; margin: 6px 0 0 14px; color: #899397; font-size: 10px; }
.save-state.dirty { border-color: #f1d7b1; background: #fff9f1; }
.save-state.dirty span { color: #a66a12; }
.save-state.dirty i { background: #ee9d20; }
.editor-column { display: flex; flex-direction: column; min-width: 0; }
.flow-canvas { flex: 1; padding: 3px 17px 10px; overflow-x: auto; }
.flow-lane { padding: 15px 0 16px; border-bottom: 1px solid #edf0f3; }
.flow-lane:last-child { border-bottom: 0; }
.lane-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 11px; }
.lane-heading > span {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  color: #fff;
  background: var(--settings-accent);
  font-size: 10px;
  font-weight: 700;
}
.lane-heading div { display: flex; align-items: baseline; gap: 11px; }
.lane-heading strong { color: var(--settings-ink); font-size: 14px; }
.lane-heading small { color: #9aa2ad; font-size: 10px; }
.flow-track { display: flex; align-items: center; min-width: 690px; }
.stage-node {
  display: flex;
  flex: 0 0 91px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 92px;
  text-align: center;
}
.stage-node .el-icon {
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  margin-bottom: 8px;
  border-radius: 50%;
  color: #078e93;
  background: #e7f8f8;
  font-size: 19px;
}
.stage-node strong { font-size: 12px; }
.stage-node small { margin-top: 5px; color: #9aa2ad; font-size: 9px; }
.stage-node.complete .el-icon { color: #238b5d; background: #e7f7ef; }
.flow-arrow { flex: 0 0 21px; margin: 0 2px; color: #b7c0c8; font-size: 17px; }
.flow-track :deep(.flow-rule-card) { flex: 0 0 180px; width: 180px; min-height: 116px; padding: 13px; }
.flow-track :deep(.flow-rule-card .rule-title) { gap: 7px; font-size: 12px; }
.flow-track :deep(.flow-rule-card .rule-title .el-icon) { font-size: 17px; }
.flow-track :deep(.flow-rule-card .rule-value) { gap: 7px; margin-top: 9px; }
.flow-track :deep(.flow-rule-card .rule-value .el-input-number) { width: 118px; }
.flow-track :deep(.flow-rule-card small) { margin-top: 8px; font-size: 9px; }
.dual-rule-card {
  box-sizing: border-box;
  flex: 0 0 236px;
  min-height: 126px;
  padding: 12px 13px;
  border: 1px solid var(--settings-accent);
  border-radius: 8px;
  background: #fff;
}
.dual-rule-card.selected { background: #f6fdfd; box-shadow: 0 7px 18px rgb(8 184 189 / 8%); }
.dual-rule-card > strong { display: flex; align-items: center; gap: 7px; font-size: 12px; }
.dual-rule-card > strong .el-icon { color: #08aeb4; font-size: 17px; }
.dual-rule-card label { display: grid; grid-template-columns: 48px 118px 24px; align-items: center; gap: 5px; margin-top: 8px; color: #656f7c; font-size: 9px; cursor: pointer; }
.dual-rule-card :deep(.el-input-number) { width: 118px; }
.dual-rule-card :deep(.el-input__inner) { font-size: 14px; }
.dual-rule-card em { color: #434d59; font-style: normal; }
.rule-list-view { flex: 1; padding: 18px; }
.rule-list-view > header { display: flex; align-items: center; justify-content: space-between; min-height: 46px; }
.rule-list-view > header div { display: flex; flex-direction: column; }
.rule-list-view > header strong { font-size: 15px; }
.rule-list-view > header small { margin-top: 5px; color: var(--settings-muted); font-size: 11px; }
.rule-list-view > header > span { color: var(--settings-muted); font-size: 11px; }
.rule-table-head,
.rule-table-row { display: grid; grid-template-columns: minmax(190px, 1.35fr) .65fr 165px minmax(165px, 1fr); align-items: center; column-gap: 12px; }
.rule-table-head { height: 38px; padding: 0 13px; color: #8b949f; background: #f6f8fa; font-size: 11px; }
.rule-table-row {
  width: 100%;
  min-height: 66px;
  padding: 9px 13px;
  border: 0;
  border-bottom: 1px solid #edf0f3;
  color: #3d4653;
  background: #fff;
  cursor: pointer;
  text-align: left;
}
.rule-table-row:hover,
.rule-table-row.selected { background: #f7fcfc; }
.rule-table-row:focus-visible { outline: 2px solid rgb(8 181 186 / 25%); outline-offset: -2px; }
.rule-name { display: flex; flex-direction: column; }
.rule-name strong { color: #25303d; font-size: 12px; }
.rule-name small { margin-top: 5px; color: #929aa5; font-size: 10px; }
.inline-editor { display: flex; align-items: center; gap: 7px; }
.inline-editor :deep(.el-input-number) { width: 118px; }
.inline-editor em { color: #66707c; font-size: 11px; font-style: normal; }
.scope-copy { display: flex; align-items: center; justify-content: space-between; color: #697380; font-size: 11px; }
.scope-copy .el-icon { color: #abb3bd; }
.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 62px;
  padding: 0 17px;
  border-top: 1px solid var(--settings-line);
  background: #fff;
}
.editor-actions .text-action { padding: 0; border: 0; color: var(--settings-accent); background: transparent; font-size: 12px; }
.editor-actions > span { margin-right: auto; color: #9aa2ad; font-size: 10px; }
.editor-actions .el-button { min-width: 78px; }
.rule-inspector {
  overflow: hidden;
  border: 1px solid var(--settings-line);
  border-radius: 7px;
  background: #fff;
}
.rule-inspector > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 58px;
  padding: 0 17px;
  border-bottom: 1px solid var(--settings-line);
}
.rule-inspector > header div { display: flex; flex-direction: column; }
.rule-inspector > header strong { font-size: 15px; }
.rule-inspector > header span { margin-top: 4px; color: #9aa2ad; font-size: 10px; }
.rule-inspector > header button { display: grid; place-items: center; width: 28px; height: 28px; border: 0; color: #7b8591; background: transparent; }
.selected-rule { padding: 17px; border-bottom: 1px solid var(--settings-line); }
.selected-title { display: grid; grid-template-columns: 37px minmax(0, 1fr) auto; align-items: center; gap: 9px; }
.selected-title > i { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 7px; color: #078f94; background: #e7f8f8; font-style: normal; }
.selected-title > i.risk { color: #db8b12; background: #fff4e3; }
.selected-title > div { display: flex; flex-direction: column; }
.selected-title small { color: #9aa2ad; font-size: 9px; }
.selected-title strong { margin-top: 3px; font-size: 13px; }
.selected-title b { color: var(--settings-accent); font-size: 13px; white-space: nowrap; }
.selected-rule dl { margin: 16px 0 0; }
.selected-rule dl > div { padding: 10px 0; border-top: 1px solid #eef1f3; }
.selected-rule dt { color: #929aa4; font-size: 10px; }
.selected-rule dd { margin: 5px 0 0; color: #3d4652; font-size: 11px; line-height: 1.55; }
.selected-rule .risk-note { margin-top: 4px; padding: 10px; border: 0; border-radius: 5px; background: #fff8ed; }
.risk-note dt { display: flex; align-items: center; gap: 5px; color: #bd7611; }
.risk-note dd { color: #896326; }
.recent-audits { padding: 16px 17px; }
.recent-audits > header { display: flex; justify-content: space-between; align-items: baseline; }
.recent-audits > header strong { font-size: 13px; }
.recent-audits > header span { color: #a0a8b1; font-size: 9px; }
.audit-timeline { margin-top: 14px; }
.audit-timeline article { position: relative; display: grid; grid-template-columns: 15px minmax(0, 1fr); gap: 7px; min-height: 56px; }
.audit-timeline article:not(:last-child)::before { position: absolute; top: 9px; bottom: -2px; left: 4px; width: 1px; background: #d9dfe4; content: ''; }
.audit-timeline article > i { position: relative; z-index: 1; width: 9px; height: 9px; margin-top: 3px; border: 2px solid #fff; border-radius: 50%; background: var(--settings-accent); box-shadow: 0 0 0 1px var(--settings-accent); }
.audit-timeline article strong { display: block; overflow: hidden; color: #4c5662; font-size: 10px; font-weight: 550; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.audit-timeline article p { margin: 5px 0 0; color: #9ba3ad; font-size: 9px; }
.empty-audits { display: grid; place-items: center; height: 92px; color: #a0a8b1; font-size: 11px; }
.audit-link { display: flex; align-items: center; gap: 5px; margin: 4px auto 0; border: 0; color: var(--settings-accent); background: transparent; font-size: 11px; }
@media (max-width: 1400px) {
  .workbench-layout { grid-template-columns: 1fr; }
  .rule-inspector { display: grid; grid-template-columns: 190px minmax(300px, 1fr) minmax(360px, 1.2fr); }
  .rule-inspector > header { height: auto; border-right: 1px solid var(--settings-line); border-bottom: 0; }
  .selected-rule { border-right: 1px solid var(--settings-line); border-bottom: 0; }
  .recent-audits { padding-top: 14px; }
  .audit-timeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .audit-timeline article { min-height: 42px; }
  .audit-timeline article:not(:last-child)::before { display: none; }
}
@media (max-width: 1180px) {
  .settings-page { padding-right: 18px; padding-left: 18px; }
  .workbench-core { grid-template-columns: 160px minmax(0, 1fr); }
  .rule-inspector { grid-template-columns: 160px minmax(290px, 1fr) minmax(320px, 1fr); }
}
</style>
