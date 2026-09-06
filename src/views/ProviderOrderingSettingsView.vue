<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Aim,
  ArrowRight,
  Bell,
  Check,
  Clock,
  Connection,
  EditPen,
  Location,
  Money,
  Promotion,
  Refresh,
  Timer,
  UserFilled,
  Warning,
} from '@element-plus/icons-vue'
import FlowRuleCard from '../components/operation-settings/FlowRuleCard.vue'
import { adminApi } from '../services/api'
import type { AdminAuditLog, ProviderOrderingSetting } from '../types'

type FieldKey = Exclude<keyof ProviderOrderingSetting, 'updated_at'>
type GroupKey = 'all' | 'reporting' | 'presence' | 'response'
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
  logic: string
  risk: string
}

const defaults: Record<FieldKey, number> = {
  location_report_interval_seconds: 300,
  location_timeout_minutes: 30,
  max_location_accuracy_m: 200,
  acceptance_timeout_minutes: 30,
}

const rules: RuleDefinition[] = [
  {
    key: 'location_report_interval_seconds',
    group: 'reporting',
    label: '位置上报间隔',
    unit: '秒',
    min: 60,
    max: 900,
    step: 60,
    help: '接单期间按该周期向后端上报实时位置',
    impact: '达人端定位任务、位置刷新频率',
    scope: '所有开启接单的达人',
    logic: '决定达人端后台定位任务的建议执行节奏',
    risk: '间隔过短会增加耗电与请求量，过长会降低距离和在线状态的实时性。',
  },
  {
    key: 'max_location_accuracy_m',
    group: 'reporting',
    label: '最大定位误差',
    unit: '米',
    min: 50,
    max: 200,
    step: 10,
    help: '超过阈值的位置不参与在线与距离判断',
    impact: '达人在线状态、用户端距离排序',
    scope: '达人新上报的实时位置',
    logic: '定位精度小于等于阈值时，位置才被视为有效',
    risk: '阈值过小会让弱定位环境下的达人频繁离线，过大则会降低距离可信度。',
  },
  {
    key: 'location_timeout_minutes',
    group: 'presence',
    label: '定位失效时间',
    unit: '分钟',
    min: 0,
    max: 120,
    step: 10,
    help: '超过该时间未上报定位则离线；设为 0 时不自动离线',
    impact: '达人在线状态、用户端预约能力',
    scope: '所有正在接单的达人',
    logic: '非 0 时按最后有效定位时间判断；0 表示仅手动停止接单才离线',
    risk: '设置为 0 后不会自动剔除长时间未上报的达人，位置可能不够新，请谨慎使用。',
  },
  {
    key: 'acceptance_timeout_minutes',
    group: 'response',
    label: '支付后接单时限',
    unit: '分钟',
    min: 5,
    max: 120,
    step: 5,
    help: '用户支付后，达人需在时限内完成接单',
    impact: '已支付待接单订单、用户等待时间',
    scope: '新进入待达人接单的订单',
    logic: '接单截止时间等于支付完成时间加当前时限',
    risk: '时限过短会降低达人响应成功率，过长会增加用户等待和退款风险。',
  },
]

const emit = defineEmits<{ 'open-audit': [] }>()
const loading = ref(false)
const saving = ref(false)
const updatedAt = ref('')
const viewMode = ref<ViewMode>('flow')
const activeGroup = ref<GroupKey>('all')
const selectedRuleKey = ref<FieldKey>('location_timeout_minutes')
const recentAudits = ref<AdminAuditLog[]>([])
const form = reactive<Record<FieldKey, number>>({ ...defaults })
const savedSnapshot = reactive<Record<FieldKey, number>>({ ...defaults })

const selectedRule = computed(() => rules.find((rule) => rule.key === selectedRuleKey.value) || rules[0]!)
const filteredRules = computed(() => activeGroup.value === 'all'
  ? rules
  : rules.filter((rule) => rule.group === activeGroup.value))
const isDirty = computed(() => rules.some((rule) => form[rule.key] !== savedSnapshot[rule.key]))
const showReporting = computed(() => activeGroup.value === 'all' || activeGroup.value === 'reporting')
const showPresence = computed(() => activeGroup.value === 'all' || activeGroup.value === 'presence')
const showResponse = computed(() => activeGroup.value === 'all' || activeGroup.value === 'response')

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未保存'
}

function groupLabel(group: RuleDefinition['group']) {
  if (group === 'reporting') return '定位上报'
  if (group === 'presence') return '在线状态'
  return '订单响应'
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
  if (!rule) return '更新接单规则'
  return `修改 ${rule.label}：${log.before?.[rule.key]}${rule.unit} → ${log.after?.[rule.key]}${rule.unit}`
}

async function loadRecentAudits() {
  try {
    const data = await adminApi.auditLogs({
      action: 'operations.provider_ordering.update',
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
    const data = await adminApi.providerOrderingSetting()
    for (const rule of rules) {
      form[rule.key] = data[rule.key]
      savedSnapshot[rule.key] = data[rule.key]
    }
    updatedAt.value = data.updated_at
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '接单规则加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const data = await adminApi.updateProviderOrderingSetting({ ...form })
    for (const rule of rules) {
      form[rule.key] = data[rule.key]
      savedSnapshot[rule.key] = data[rule.key]
    }
    updatedAt.value = data.updated_at
    await loadRecentAudits()
    ElMessage.success('接单规则已发布并写入审计日志')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '接单规则发布失败')
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
  <div class="page ordering-settings-page" v-loading="loading">
    <header class="page-heading ordering-heading">
      <div class="heading-copy">
        <h1>接单规则</h1>
        <p>沿达人在线与订单响应链路配置定位有效性和接单时限</p>
      </div>
      <el-button type="primary" :loading="saving" @click="save">发布规则</el-button>
    </header>

    <nav class="view-switch" aria-label="规则视图">
      <button :class="{ active: viewMode === 'flow' }" @click="viewMode = 'flow'">流程视图</button>
      <button :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">列表视图</button>
    </nav>

    <div class="ordering-layout">
      <section class="ordering-core">
        <aside class="rule-directory">
          <header>
            <strong>规则目录</strong>
            <span>按业务环节筛选</span>
          </header>
          <nav>
            <button :class="{ active: activeGroup === 'all' }" @click="selectGroup('all')">
              <span><el-icon><Connection /></el-icon>全部规则</span><b>4 项</b>
            </button>
            <button :class="{ active: activeGroup === 'reporting' }" @click="selectGroup('reporting')">
              <span><el-icon><Location /></el-icon>定位上报</span><b>2 项</b>
            </button>
            <button :class="{ active: activeGroup === 'presence' }" @click="selectGroup('presence')">
              <span><el-icon><UserFilled /></el-icon>在线状态</span><b>1 项</b>
            </button>
            <button :class="{ active: activeGroup === 'response' }" @click="selectGroup('response')">
              <span><el-icon><Bell /></el-icon>订单响应</span><b>1 项</b>
            </button>
          </nav>
          <div class="save-state" :class="{ dirty: isDirty }">
            <span><i></i>{{ isDirty ? '存在未发布修改' : '全部规则已发布' }}</span>
            <small>{{ isDirty ? '发布后规则才会生效' : '规则状态正常' }}</small>
          </div>
        </aside>

        <div class="rule-editor">
          <div v-if="viewMode === 'flow'" class="flow-canvas">
            <section v-if="showReporting" class="flow-lane">
              <header class="lane-heading">
                <span>01</span>
                <div><strong>定位上报与质量校验</strong><small>开启接单 · 周期上报 · 精度校验</small></div>
              </header>
              <div class="flow-track reporting-track">
                <div class="stage-node"><el-icon><Promotion /></el-icon><strong>开启接单</strong><small>获取首次定位</small></div>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <FlowRuleCard
                  label="位置上报间隔"
                  :model-value="form.location_report_interval_seconds"
                  unit="秒"
                  :min="60"
                  :max="900"
                  :step="60"
                  help="决定实时位置刷新频率"
                  :icon="Timer"
                  :selected="selectedRuleKey === 'location_report_interval_seconds'"
                  @update:model-value="updateRule('location_report_interval_seconds', $event)"
                  @select="selectRule('location_report_interval_seconds')"
                />
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <div class="stage-node"><el-icon><Location /></el-icon><strong>上报位置</strong><small>经纬度与精度</small></div>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <FlowRuleCard
                  label="最大定位误差"
                  :model-value="form.max_location_accuracy_m"
                  unit="米"
                  :min="50"
                  :max="200"
                  :step="10"
                  help="超出阈值的位置视为无效"
                  :icon="Aim"
                  :selected="selectedRuleKey === 'max_location_accuracy_m'"
                  @update:model-value="updateRule('max_location_accuracy_m', $event)"
                  @select="selectRule('max_location_accuracy_m')"
                />
              </div>
            </section>

            <section v-if="showPresence" class="flow-lane">
              <header class="lane-heading">
                <span>02</span>
                <div><strong>在线状态判定</strong><small>有效定位 · 时效判断 · 在线展示</small></div>
              </header>
              <div class="flow-track presence-track">
                <div class="stage-node"><el-icon><Check /></el-icon><strong>有效定位</strong><small>精度符合要求</small></div>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <FlowRuleCard
                  label="定位失效时间"
                  :model-value="form.location_timeout_minutes"
                  unit="分钟"
                  :min="0"
                  :max="120"
                  :step="10"
                  help="0 表示不自动离线"
                  :icon="Clock"
                  :selected="selectedRuleKey === 'location_timeout_minutes'"
                  @update:model-value="updateRule('location_timeout_minutes', $event)"
                  @select="selectRule('location_timeout_minutes')"
                />
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <div class="presence-outcome">
                  <span class="online"><i></i><strong>在线</strong><small>用户端可预约</small></span>
                  <span class="offline"><i></i><strong>离线</strong><small>仍展示，不可预约</small></span>
                </div>
              </div>
            </section>

            <section v-if="showResponse" class="flow-lane">
              <header class="lane-heading">
                <span>03</span>
                <div><strong>支付后接单响应</strong><small>用户支付 · 等待接单 · 响应结果</small></div>
              </header>
              <div class="flow-track response-track">
                <div class="stage-node"><el-icon><Money /></el-icon><strong>用户支付</strong><small>生成待接单订单</small></div>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <div class="stage-node emphasis"><el-icon><Bell /></el-icon><strong>等待接单</strong><small>推送给目标达人</small></div>
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <FlowRuleCard
                  label="支付后接单时限"
                  :model-value="form.acceptance_timeout_minutes"
                  unit="分钟"
                  :min="5"
                  :max="120"
                  :step="5"
                  help="超时后达人不可继续接单"
                  :icon="Warning"
                  :selected="selectedRuleKey === 'acceptance_timeout_minutes'"
                  risk
                  @update:model-value="updateRule('acceptance_timeout_minutes', $event)"
                  @select="selectRule('acceptance_timeout_minutes')"
                />
                <el-icon class="flow-arrow"><ArrowRight /></el-icon>
                <div class="response-outcome"><el-icon><Check /></el-icon><div><strong>已接单</strong><small>进入待服务阶段</small></div></div>
              </div>
            </section>
          </div>

          <div v-else class="rule-list-view">
            <header><div><strong>规则列表</strong><small>集中查看和编辑当前业务环节的接单规则</small></div><span>{{ filteredRules.length }} 项规则</span></header>
            <div class="rule-table-head"><span>规则名称</span><span>业务环节</span><span>当前值</span><span>判定逻辑</span></div>
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
              <span><el-tag effect="plain" size="small">{{ groupLabel(rule.group) }}</el-tag></span>
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
              <span class="logic-copy">{{ rule.logic }}<el-icon><ArrowRight /></el-icon></span>
            </article>
          </div>

          <footer class="editor-actions">
            <button class="text-action" @click="restoreDefaults">恢复默认</button>
            <span>最后更新：{{ formatDate(updatedAt) }}</span>
            <el-button :disabled="!isDirty" @click="cancelChanges">取消</el-button>
            <el-button type="primary" :loading="saving" @click="save">发布规则</el-button>
          </footer>
        </div>
      </section>

      <aside class="rule-inspector">
        <header><div><strong>规则影响</strong><span>当前选中规则</span></div><button title="刷新审计记录" @click="loadRecentAudits"><el-icon><Refresh /></el-icon></button></header>
        <section class="selected-rule">
          <div class="selected-title">
            <i :class="{ risk: selectedRule.group === 'response' }"><el-icon><component :is="selectedRule.group === 'response' ? Warning : EditPen" /></el-icon></i>
            <div><small>{{ groupLabel(selectedRule.group) }}</small><strong>{{ selectedRule.label }}</strong></div>
            <b>{{ form[selectedRule.key] }} {{ selectedRule.unit }}</b>
          </div>
          <dl>
            <div><dt>影响对象</dt><dd>{{ selectedRule.impact }}</dd></div>
            <div><dt>生效范围</dt><dd>{{ selectedRule.scope }}</dd></div>
            <div><dt>判定逻辑</dt><dd>{{ selectedRule.logic }}</dd></div>
            <div class="risk-note"><dt><el-icon><Warning /></el-icon>变更提醒</dt><dd>{{ selectedRule.risk }}</dd></div>
          </dl>
        </section>

        <section class="decision-summary">
          <header><strong>当前判定关系</strong><span>实时规则摘要</span></header>
          <div><span>有效位置</span><b>精度 ≤ {{ form.max_location_accuracy_m }} 米</b></div>
          <div><span>在线状态</span><b>{{ form.location_timeout_minutes === 0 ? '不按定位时间自动离线' : `最后定位 ≤ ${form.location_timeout_minutes} 分钟` }}</b></div>
          <div><span>接单截止</span><b>支付后 {{ form.acceptance_timeout_minutes }} 分钟</b></div>
        </section>

        <section class="recent-audits">
          <header><strong>最近变更</strong><span>最多显示 3 条</span></header>
          <div v-if="recentAudits.length" class="audit-timeline">
            <article v-for="audit in recentAudits" :key="audit.id">
              <i></i>
              <div><strong>{{ auditDescription(audit) }}</strong><p>{{ audit.actor_name }} · {{ formatDate(audit.created_at) }}</p></div>
            </article>
          </div>
          <div v-else class="empty-audits">暂无接单规则变更记录</div>
          <button class="audit-link" @click="emit('open-audit')">查看全部记录 <el-icon><ArrowRight /></el-icon></button>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ordering-settings-page {
  --ordering-accent: #08b5ba;
  --ordering-ink: #192231;
  --ordering-muted: #7a8492;
  --ordering-line: #e0e5ea;
  min-height: calc(100vh - 76px);
  padding: 20px 24px 24px;
  background: #f6f8fa;
}
.ordering-heading { height: 54px; }
.heading-copy { display: flex; align-items: baseline; gap: 18px; }
.ordering-heading h1 { font-size: 23px; }
.ordering-heading p { margin: 0; font-size: 13px; }
.ordering-heading .el-button { width: 116px; height: 40px; border-radius: 5px; }
.view-switch {
  display: flex;
  align-items: end;
  gap: 36px;
  height: 54px;
  padding: 0 4px;
  border-bottom: 1px solid var(--ordering-line);
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
.view-switch button.active { color: var(--ordering-accent); font-weight: 650; }
.view-switch button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: var(--ordering-accent);
  content: '';
}
.ordering-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 286px;
  gap: 9px;
  min-height: calc(100vh - 228px);
  padding-top: 10px;
}
.ordering-core {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--ordering-line);
  border-radius: 7px;
  background: #fff;
}
.rule-directory {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  border-right: 1px solid var(--ordering-line);
  background: #fbfcfd;
}
.rule-directory > header { padding: 19px 18px 14px; }
.rule-directory header strong { display: block; font-size: 15px; }
.rule-directory header span { display: block; margin-top: 5px; color: var(--ordering-muted); font-size: 11px; }
.rule-directory nav { padding: 0 9px; }
.rule-directory nav button {
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
.rule-directory nav button > span { display: flex; align-items: center; gap: 9px; }
.rule-directory nav button .el-icon { font-size: 16px; }
.rule-directory nav button b { color: #9aa2ad; font-size: 11px; font-weight: 500; }
.rule-directory nav button:hover { background: #f0f8f8; }
.rule-directory nav button.active { color: #087f84; background: #e8f8f8; font-weight: 650; }
.rule-directory nav button.active b { color: #079ca1; }
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
.rule-editor { display: flex; flex-direction: column; min-width: 0; }
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
  background: var(--ordering-accent);
  font-size: 10px;
  font-weight: 700;
}
.lane-heading div { display: flex; align-items: baseline; gap: 11px; }
.lane-heading strong { color: var(--ordering-ink); font-size: 14px; }
.lane-heading small { color: #9aa2ad; font-size: 10px; }
.flow-track { display: flex; align-items: center; min-width: 675px; }
.stage-node {
  display: flex;
  flex: 0 0 88px;
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
.stage-node.emphasis .el-icon { color: #b97a16; background: #fff5e5; }
.flow-arrow { flex: 0 0 21px; margin: 0 2px; color: #b7c0c8; font-size: 17px; }
.flow-track :deep(.flow-rule-card) { flex: 0 0 195px; width: 195px; min-height: 116px; padding: 13px; }
.flow-track :deep(.flow-rule-card .rule-title) { gap: 7px; font-size: 12px; }
.flow-track :deep(.flow-rule-card .rule-title .el-icon) { font-size: 17px; }
.flow-track :deep(.flow-rule-card .rule-value) { gap: 7px; margin-top: 9px; }
.flow-track :deep(.flow-rule-card .rule-value .el-input-number) { width: 120px; }
.flow-track :deep(.flow-rule-card small) { margin-top: 8px; font-size: 9px; }
.presence-outcome {
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: 0 0 200px;
  gap: 7px;
}
.presence-outcome span {
  display: flex;
  flex-direction: column;
  min-height: 82px;
  padding: 13px 11px;
  border: 1px solid #e4e8ec;
  border-radius: 7px;
  background: #fbfcfd;
}
.presence-outcome i { width: 8px; height: 8px; margin-bottom: 8px; border-radius: 50%; }
.presence-outcome strong { font-size: 12px; }
.presence-outcome small { margin-top: 5px; color: #939ca7; font-size: 9px; line-height: 1.4; }
.presence-outcome .online { border-color: #bde8d5; background: #f4fbf7; }
.presence-outcome .online i { background: #20b983; }
.presence-outcome .offline i { background: #a3acb7; }
.response-outcome {
  display: flex;
  flex: 0 0 128px;
  align-items: center;
  gap: 9px;
  min-height: 70px;
  padding: 12px;
  border: 1px solid #bde8d5;
  border-radius: 7px;
  background: #f4fbf7;
}
.response-outcome > .el-icon { color: #20a36f; font-size: 22px; }
.response-outcome div { display: flex; flex-direction: column; }
.response-outcome strong { font-size: 12px; }
.response-outcome small { margin-top: 4px; color: #7f9388; font-size: 9px; }
.rule-list-view { flex: 1; padding: 18px; }
.rule-list-view > header { display: flex; align-items: center; justify-content: space-between; min-height: 46px; }
.rule-list-view > header div { display: flex; flex-direction: column; }
.rule-list-view > header strong { font-size: 15px; }
.rule-list-view > header small { margin-top: 5px; color: var(--ordering-muted); font-size: 11px; }
.rule-list-view > header > span { color: var(--ordering-muted); font-size: 11px; }
.rule-table-head,
.rule-table-row { display: grid; grid-template-columns: minmax(180px, 1.2fr) .62fr 165px minmax(190px, 1.25fr); align-items: center; column-gap: 12px; }
.rule-table-head { height: 38px; padding: 0 13px; color: #8b949f; background: #f6f8fa; font-size: 11px; }
.rule-table-row {
  width: 100%;
  min-height: 72px;
  padding: 9px 13px;
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
.logic-copy { display: flex; align-items: center; justify-content: space-between; color: #697380; font-size: 10px; line-height: 1.45; }
.logic-copy .el-icon { flex: 0 0 auto; margin-left: 8px; color: #abb3bd; }
.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 62px;
  padding: 0 17px;
  border-top: 1px solid var(--ordering-line);
  background: #fff;
}
.editor-actions .text-action { padding: 0; border: 0; color: var(--ordering-accent); background: transparent; font-size: 12px; }
.editor-actions > span { margin-right: auto; color: #9aa2ad; font-size: 10px; }
.editor-actions .el-button { min-width: 78px; }
.rule-inspector {
  overflow: hidden;
  border: 1px solid var(--ordering-line);
  border-radius: 7px;
  background: #fff;
}
.rule-inspector > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 58px;
  padding: 0 17px;
  border-bottom: 1px solid var(--ordering-line);
}
.rule-inspector > header div { display: flex; flex-direction: column; }
.rule-inspector > header strong { font-size: 15px; }
.rule-inspector > header span { margin-top: 4px; color: #9aa2ad; font-size: 10px; }
.rule-inspector > header button { display: grid; place-items: center; width: 28px; height: 28px; border: 0; color: #7b8591; background: transparent; }
.selected-rule { padding: 17px; border-bottom: 1px solid var(--ordering-line); }
.selected-title { display: grid; grid-template-columns: 37px minmax(0, 1fr) auto; align-items: center; gap: 9px; }
.selected-title > i { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 7px; color: #078f94; background: #e7f8f8; font-style: normal; }
.selected-title > i.risk { color: #db8b12; background: #fff4e3; }
.selected-title > div { display: flex; flex-direction: column; }
.selected-title small { color: #9aa2ad; font-size: 9px; }
.selected-title strong { margin-top: 3px; font-size: 13px; }
.selected-title b { color: var(--ordering-accent); font-size: 13px; white-space: nowrap; }
.selected-rule dl { margin: 16px 0 0; }
.selected-rule dl > div { padding: 9px 0; border-top: 1px solid #eef1f3; }
.selected-rule dt { color: #929aa4; font-size: 10px; }
.selected-rule dd { margin: 5px 0 0; color: #3d4652; font-size: 11px; line-height: 1.5; }
.selected-rule .risk-note { margin-top: 4px; padding: 10px; border: 0; border-radius: 5px; background: #fff8ed; }
.risk-note dt { display: flex; align-items: center; gap: 5px; color: #bd7611; }
.risk-note dd { color: #896326; }
.decision-summary { padding: 14px 17px; border-bottom: 1px solid var(--ordering-line); }
.decision-summary > header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 9px; }
.decision-summary > header strong { font-size: 12px; }
.decision-summary > header span { color: #a0a8b1; font-size: 9px; }
.decision-summary > div { display: flex; align-items: center; justify-content: space-between; min-height: 29px; border-top: 1px solid #f0f2f4; font-size: 10px; }
.decision-summary > div span { color: #8a939e; }
.decision-summary > div b { color: #48515d; font-weight: 550; }
.recent-audits { padding: 14px 17px; }
.recent-audits > header { display: flex; justify-content: space-between; align-items: baseline; }
.recent-audits > header strong { font-size: 13px; }
.recent-audits > header span { color: #a0a8b1; font-size: 9px; }
.audit-timeline { margin-top: 12px; }
.audit-timeline article { position: relative; display: grid; grid-template-columns: 15px minmax(0, 1fr); gap: 7px; min-height: 51px; }
.audit-timeline article:not(:last-child)::before { position: absolute; top: 9px; bottom: -2px; left: 4px; width: 1px; background: #d9dfe4; content: ''; }
.audit-timeline article > i { position: relative; z-index: 1; width: 9px; height: 9px; margin-top: 3px; border: 2px solid #fff; border-radius: 50%; background: var(--ordering-accent); box-shadow: 0 0 0 1px var(--ordering-accent); }
.audit-timeline article strong { display: block; overflow: hidden; color: #4c5662; font-size: 10px; font-weight: 550; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.audit-timeline article p { margin: 5px 0 0; color: #9ba3ad; font-size: 9px; }
.empty-audits { display: grid; place-items: center; height: 75px; color: #a0a8b1; font-size: 11px; }
.audit-link { display: flex; align-items: center; gap: 5px; margin: 2px auto 0; border: 0; color: var(--ordering-accent); background: transparent; font-size: 11px; }
@media (max-width: 1400px) {
  .ordering-layout { grid-template-columns: 1fr; }
  .rule-inspector { display: grid; grid-template-columns: 160px minmax(260px, 1fr) 220px minmax(300px, 1.15fr); }
  .rule-inspector > header { height: auto; border-right: 1px solid var(--ordering-line); border-bottom: 0; }
  .selected-rule,
  .decision-summary { border-right: 1px solid var(--ordering-line); border-bottom: 0; }
  .audit-timeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .audit-timeline article { min-height: 42px; }
  .audit-timeline article:not(:last-child)::before { display: none; }
}
@media (max-width: 1180px) {
  .ordering-settings-page { padding-right: 18px; padding-left: 18px; }
  .ordering-core { grid-template-columns: 160px minmax(0, 1fr); }
  .rule-inspector { grid-template-columns: 150px minmax(270px, 1fr) 220px minmax(310px, 1fr); }
}
</style>
