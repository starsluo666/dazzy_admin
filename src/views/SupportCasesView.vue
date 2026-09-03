<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ChatLineRound, CircleCheck, Headset, Refresh, Search, Tickets, Warning } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { adminApi } from '../services/api'
import type { AdminSupportCase, SupportCaseStatus, SupportCaseSummary } from '../types'

const props = defineProps<{ preview?: boolean; canManage: boolean }>()
const rows = ref<AdminSupportCase[]>([])
const selected = ref<AdminSupportCase | null>(null)
const drawerVisible = ref(false)
const loading = ref(false)
const saving = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const summary = ref<SupportCaseSummary>({ total: 0, pending: 0, processing: 0, reviewing: 0, resolved: 0 })
const filters = reactive({ search: '', caseType: '', targetType: '', status: '', statusGroup: '', cityCode: '' })

const summaryCards = computed(() => [
  { key: 'pending', label: '待受理', value: summary.value.pending, icon: Tickets, tone: 'blue' },
  { key: 'processing', label: '处理中', value: summary.value.processing, icon: Headset, tone: 'green' },
  { key: 'reviewing', label: '待复核', value: summary.value.reviewing, icon: Warning, tone: 'orange' },
  { key: 'resolved', label: '已完结', value: summary.value.resolved, icon: CircleCheck, tone: 'cyan' },
])

function iso(hours: number) { return new Date(Date.now() - hours * 3600000).toISOString() }
function demoCase(id: number, patch: Partial<AdminSupportCase> = {}): AdminSupportCase {
  const status = patch.status || (id === 1 ? 'pending' : id === 2 ? 'processing' : id === 3 ? 'reviewing' : 'resolved')
  return {
    public_id: `00000000-0000-0000-0000-0000000000${id}`,
    case_no: `SC20260903${String(id).padStart(4, '0')}`,
    case_type: id % 3 === 0 ? 'report' : id % 2 === 0 ? 'complaint' : 'consultation',
    case_type_label: id % 3 === 0 ? '举报' : id % 2 === 0 ? '投诉' : '咨询',
    target_type: id === 1 ? 'provider_order' : id === 2 ? 'provider' : id === 3 ? 'review' : 'general',
    target_type_label: id === 1 ? '达人订单' : id === 2 ? '达人' : id === 3 ? '用户评价' : '平台服务',
    target_id: id === 1 ? 'DZYQA202609020001' : `TARGET-${id}`,
    target_title: id === 1 ? '城市陪伴 · 晓晓' : id === 2 ? '达人 小雨' : id === 3 ? '匿名用户的评价' : '平台服务',
    target_subtitle: id === 1 ? 'DZYQA202609020001' : '邯郸市',
    reason: id === 3 ? 'inappropriate_content' : id === 2 ? 'safety_risk' : 'service_quality',
    reason_label: id === 3 ? '内容不当' : id === 2 ? '存在安全风险' : '服务体验问题',
    description: id === 1 ? '达人临时调整集合时间，希望平台协助核查订单沟通记录。' : '用户提交了需要平台核查的具体问题和相关说明。',
    attachment_urls: [],
    city_code: '130400', city_name: '邯郸市', status,
    status_label: status === 'pending' ? '待受理' : status === 'processing' ? '处理中' : status === 'reviewing' ? '复核中' : '已处理',
    assignee_name: status === 'pending' ? null : '客服小乐',
    result_note: status === 'resolved' ? '已完成核查并向用户同步处理结果。' : '',
    resolved_at: status === 'resolved' ? iso(1) : null,
    review_requested_at: status === 'reviewing' ? iso(2) : null,
    review_reason: status === 'reviewing' ? '用户补充了新的证据，请再次核查。' : '',
    reporter_name: `测试用户${id}`, reporter_phone: `188****${String(7700 + id)}`,
    records: [
      { id: id * 10, record_type: 'created', record_type_label: '提交工单', actor_name: `测试用户${id}`, content: '已提交问题说明，等待平台受理。', from_status: '', to_status: 'pending', created_at: iso(id + 3) },
      ...(status !== 'pending' ? [{ id: id * 10 + 1, record_type: 'operator_reply' as const, record_type_label: '客服回复', actor_name: '客服小乐', content: '已收到反馈，我们正在核查相关记录。', from_status: 'pending', to_status: 'processing', created_at: iso(id) }] : []),
    ],
    created_at: iso(id + 3), updated_at: iso(id),
    ...patch,
  }
}
const demoRows = ref([demoCase(1), demoCase(2), demoCase(3), demoCase(4)])

function applyDemoFilters() {
  const keyword = filters.search.trim()
  return demoRows.value.filter((item) =>
    (!filters.status || item.status === filters.status)
    && (!filters.caseType || item.case_type === filters.caseType)
    && (!filters.targetType || item.target_type === filters.targetType)
    && (!filters.cityCode || item.city_code === filters.cityCode)
    && (!keyword || `${item.case_no}${item.reporter_name}${item.target_title}${item.description}`.includes(keyword)),
  )
}
function demoSummary(): SupportCaseSummary {
  return {
    total: demoRows.value.length,
    pending: demoRows.value.filter((item) => item.status === 'pending').length,
    processing: demoRows.value.filter((item) => item.status === 'processing').length,
    reviewing: demoRows.value.filter((item) => item.status === 'reviewing').length,
    resolved: demoRows.value.filter((item) => ['resolved', 'rejected', 'closed'].includes(item.status)).length,
  }
}
async function load() {
  loading.value = true
  try {
    if (props.preview) {
      rows.value = applyDemoFilters()
      total.value = rows.value.length
      summary.value = demoSummary()
      return
    }
    const data = await adminApi.supportCases({
      search: filters.search.trim(),
      case_type: filters.caseType as never,
      target_type: filters.targetType as never,
      status: filters.status as never,
      status_group: filters.statusGroup as 'terminal' | '',
      city_code: filters.cityCode,
      page: page.value,
      page_size: pageSize,
    })
    rows.value = data.items
    total.value = data.pagination.total
    summary.value = data.summary
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '客服工单加载失败')
  } finally { loading.value = false }
}
function query() { page.value = 1; load() }
function reset() {
  Object.assign(filters, { search: '', caseType: '', targetType: '', status: '', statusGroup: '', cityCode: '' })
  page.value = 1
  load()
}
function selectSummary(key: string) {
  filters.status = key === 'resolved' ? '' : key
  filters.statusGroup = key === 'resolved' ? 'terminal' : ''
  page.value = 1
  load()
}
async function open(row: AdminSupportCase) {
  drawerVisible.value = true
  selected.value = row
  if (props.preview) return
  try { selected.value = await adminApi.supportCase(row.case_no) }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : '工单详情加载失败') }
}
function statusTag(status: SupportCaseStatus) {
  if (status === 'pending' || status === 'reviewing') return 'warning'
  if (status === 'processing') return 'primary'
  if (status === 'resolved' || status === 'closed') return 'success'
  return 'info'
}
function format(value: string | null) {
  if (!value) return '--'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(value))
}
async function runAction(action: 'start_review' | 'resolve' | 'reject' | 'close') {
  if (!selected.value || saving.value) return
  let note = ''
  if (action === 'start_review') {
    try { await ElMessageBox.confirm('领取后工单将进入处理中，并记录当前处理人。', '开始处理', { confirmButtonText: '确认领取' }) }
    catch { return }
  } else {
    const title = action === 'resolve' ? '完成处理' : action === 'reject' ? '不予受理' : '关闭工单'
    try {
      const result = await ElMessageBox.prompt('处理结论会同步给用户并写入操作审计。', title, {
        inputPlaceholder: '请输入不少于5个字的处理结论',
        inputValidator: (value) => value.trim().length >= 5 || '处理结论至少填写5个字',
      })
      note = result.value.trim()
    } catch { return }
  }
  saving.value = true
  try {
    if (props.preview) {
      const target = demoRows.value.find((item) => item.case_no === selected.value?.case_no)
      if (target) {
        target.status = action === 'start_review' ? 'processing' : action === 'resolve' ? 'resolved' : action === 'reject' ? 'rejected' : 'closed'
        target.status_label = action === 'start_review' ? '处理中' : action === 'resolve' ? '已处理' : action === 'reject' ? '不予受理' : '已关闭'
        target.assignee_name = '运营管理员'
        target.result_note = note
        selected.value = { ...target }
      }
    } else selected.value = await adminApi.reviewSupportCase(selected.value.case_no, action, note)
    ElMessage.success(action === 'start_review' ? '工单已领取' : '处理结果已保存')
    await load()
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '操作失败') }
  finally { saving.value = false }
}
async function reply() {
  if (!selected.value || saving.value) return
  let content = ''
  try {
    const result = await ElMessageBox.prompt('回复内容将展示在用户工单时间线中。', '回复用户', {
      inputType: 'textarea', inputPlaceholder: '请输入客服回复',
      inputValidator: (value) => value.trim().length >= 2 || '回复至少填写2个字',
    })
    content = result.value.trim()
  } catch { return }
  saving.value = true
  try {
    if (props.preview) {
      selected.value.records.push({ id: Date.now(), record_type: 'operator_reply', record_type_label: '客服回复', actor_name: '运营管理员', content, from_status: '', to_status: '', created_at: new Date().toISOString() })
      selected.value.status = 'processing'; selected.value.status_label = '处理中'; selected.value.assignee_name = '运营管理员'
    } else selected.value = await adminApi.replySupportCase(selected.value.case_no, content)
    ElMessage.success('回复已发送')
    await load()
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : '回复失败') }
  finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <section class="support-page">
    <div class="page-heading"><div><h1>客服工单</h1><p>统一受理咨询、投诉与举报，完整记录处理过程</p></div><el-button :icon="Refresh" @click="load">刷新</el-button></div>
    <div class="summary-grid">
      <button v-for="item in summaryCards" :key="item.key" :class="{ active: item.key === 'resolved' ? filters.statusGroup === 'terminal' : filters.status === item.key }" @click="selectSummary(item.key)">
        <el-icon :class="item.tone"><component :is="item.icon" /></el-icon><span>{{ item.label }}</span><strong>{{ item.value }}</strong><small>查看工单</small>
      </button>
    </div>
    <section class="work-panel">
      <div class="filters">
        <el-input v-model="filters.search" clearable :prefix-icon="Search" placeholder="搜索工单号、用户或关联对象" @keyup.enter="query" />
        <el-select v-model="filters.caseType" clearable placeholder="工单类型"><el-option label="咨询" value="consultation"/><el-option label="投诉" value="complaint"/><el-option label="举报" value="report"/></el-select>
        <el-select v-model="filters.targetType" clearable placeholder="关联对象"><el-option label="平台服务" value="general"/><el-option label="达人" value="provider"/><el-option label="达人订单" value="provider_order"/><el-option label="活动" value="activity"/><el-option label="用户评价" value="review"/></el-select>
        <el-select v-model="filters.status" clearable placeholder="处理状态" @change="filters.statusGroup = ''"><el-option label="待受理" value="pending"/><el-option label="处理中" value="processing"/><el-option label="复核中" value="reviewing"/><el-option label="已处理" value="resolved"/><el-option label="不予受理" value="rejected"/><el-option label="已关闭" value="closed"/></el-select>
        <el-select v-model="filters.cityCode" clearable placeholder="全部城市"><el-option label="邯郸市" value="130400"/><el-option label="北京市" value="110100"/></el-select>
        <el-button type="primary" @click="query">查询</el-button><el-button @click="reset">重置</el-button>
      </div>
      <el-table v-loading="loading" :data="rows" height="calc(100vh - 403px)" empty-text="暂无客服工单" @row-click="open">
        <el-table-column label="工单 / 时间" min-width="188"><template #default="{ row }"><div class="identity"><strong>{{ row.case_no }}</strong><span>{{ format(row.created_at) }}</span></div></template></el-table-column>
        <el-table-column label="类型" width="86"><template #default="{ row }"><el-tag effect="plain" :type="row.case_type === 'report' ? 'danger' : row.case_type === 'complaint' ? 'warning' : 'primary'">{{ row.case_type_label }}</el-tag></template></el-table-column>
        <el-table-column label="关联对象" min-width="185"><template #default="{ row }"><div class="identity"><strong>{{ row.target_title }}</strong><span>{{ row.target_type_label }} · {{ row.target_subtitle || '--' }}</span></div></template></el-table-column>
        <el-table-column label="提交用户" width="136"><template #default="{ row }"><div class="identity"><strong>{{ row.reporter_name || '用户' }}</strong><span>{{ row.reporter_phone }}</span></div></template></el-table-column>
        <el-table-column prop="city_name" label="城市" width="95"/>
        <el-table-column prop="reason_label" label="问题分类" min-width="120"/>
        <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="statusTag(row.status)">{{ row.status_label }}</el-tag></template></el-table-column>
        <el-table-column label="处理人" width="105"><template #default="{ row }">{{ row.assignee_name || '--' }}</template></el-table-column>
        <el-table-column label="操作" width="72" fixed="right"><template #default="{ row }"><el-button link type="primary" @click.stop="open(row)">查看</el-button></template></el-table-column>
      </el-table>
      <div class="pagination"><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" @current-change="load"/></div>
    </section>

    <el-drawer v-model="drawerVisible" size="600px" :with-header="false">
      <div v-if="selected" class="case-drawer">
        <header><div><h2>{{ selected.case_no }}</h2><p>{{ selected.case_type_label }} · {{ selected.reason_label }}</p></div><el-tag :type="statusTag(selected.status)">{{ selected.status_label }}</el-tag><button aria-label="关闭" @click="drawerVisible=false">×</button></header>
        <el-scrollbar class="drawer-scroll">
          <section class="case-section overview"><h3><el-icon><Tickets/></el-icon> 工单概览</h3><div class="info-grid"><div><span>提交用户</span><strong>{{ selected.reporter_name }}　{{ selected.reporter_phone }}</strong></div><div><span>提交时间</span><strong>{{ format(selected.created_at) }}</strong></div><div><span>来源城市</span><strong>{{ selected.city_name || '未关联城市' }}</strong></div><div><span>当前处理人</span><strong>{{ selected.assignee_name || '待领取' }}</strong></div></div></section>
          <section class="case-section"><h3><el-icon><Warning/></el-icon> 关联对象</h3><div class="target-card"><strong>{{ selected.target_title }}</strong><span>{{ selected.target_type_label }} · {{ selected.target_subtitle || selected.target_id || '--' }}</span></div></section>
          <section class="case-section"><h3><el-icon><ChatLineRound/></el-icon> 用户描述</h3><p class="description">{{ selected.description }}</p><div v-if="selected.attachment_urls.length" class="evidence"><el-image v-for="url in selected.attachment_urls" :key="url" :src="url" fit="cover" :preview-src-list="selected.attachment_urls" preview-teleported/></div><el-empty v-else :image-size="50" description="用户未上传证据图片"/></section>
          <section class="case-section timeline"><h3><el-icon><Refresh/></el-icon> 处理时间线</h3><div v-for="record in selected.records" :key="record.id" class="timeline-row"><i/><div><strong>{{ record.record_type_label }}</strong><span>{{ record.actor_name }} · {{ format(record.created_at) }}</span><p v-if="record.content">{{ record.content }}</p></div></div></section>
          <section v-if="selected.review_reason" class="case-section review-reason"><h3>用户复核原因</h3><p>{{ selected.review_reason }}</p></section>
          <section v-if="selected.result_note" class="case-section result"><h3>处理结论</h3><p>{{ selected.result_note }}</p></section>
        </el-scrollbar>
        <footer v-if="canManage">
          <el-button v-if="['pending','reviewing'].includes(selected.status)" :loading="saving" @click="runAction('start_review')">开始处理</el-button>
          <template v-if="['pending','processing','reviewing'].includes(selected.status)"><el-button :disabled="saving" @click="reply">回复用户</el-button><el-button :disabled="saving" @click="runAction('reject')">不予受理</el-button><el-button type="primary" :loading="saving" @click="runAction('resolve')">完成处理</el-button></template>
          <el-button v-else-if="['resolved','rejected'].includes(selected.status)" :loading="saving" @click="runAction('close')">关闭归档</el-button>
        </footer>
      </div>
    </el-drawer>
  </section>
</template>

<style scoped>
.support-page{min-height:calc(100vh - 76px)}.page-heading{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px}.page-heading h1{margin:0;color:#172033;font-size:23px}.page-heading p{margin:7px 0 0;color:#7c8792;font-size:13px}.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:14px}.summary-grid button{position:relative;display:grid;grid-template-columns:52px 1fr;grid-template-rows:auto auto;align-items:center;min-height:90px;padding:15px 17px;border:1px solid var(--line);border-radius:8px;color:#172033;background:#fff;text-align:left;transition:border-color .18s ease,box-shadow .18s ease}.summary-grid button:hover,.summary-grid button.active{border-color:#83d8da;box-shadow:0 8px 22px rgba(24,90,98,.08)}.summary-grid .el-icon{grid-row:1/3;width:43px;height:43px;border-radius:12px;font-size:23px}.summary-grid .blue{color:#2679e9;background:#eaf2ff}.summary-grid .green{color:#37a35c;background:#eaf8ee}.summary-grid .orange{color:#e77a22;background:#fff3e6}.summary-grid .cyan{color:#0aa9ad;background:#e7f8f8}.summary-grid span{color:#7c8792;font-size:13px}.summary-grid strong{font-size:26px}.summary-grid small{position:absolute;right:16px;bottom:15px;color:#a0a8b0}.work-panel{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.filters{display:grid;grid-template-columns:minmax(240px,1.5fr) 115px 130px 120px 110px 66px 66px;gap:9px;padding:14px 15px;border-bottom:1px solid var(--line)}.identity{display:flex;flex-direction:column;gap:5px}.identity strong{overflow:hidden;color:#27313f;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.identity span{overflow:hidden;color:#8a949e;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.pagination{display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 17px;color:#7c8792;font-size:13px}.case-drawer{position:relative;min-height:100%;padding-bottom:76px;background:#f6f8fa}.case-drawer>header{position:sticky;z-index:4;top:0;display:flex;align-items:center;gap:12px;height:75px;padding:0 22px;border-bottom:1px solid var(--line);background:#fff}.case-drawer>header>div{margin-right:auto}.case-drawer h2{margin:0;font-size:18px}.case-drawer header p{margin:5px 0 0;color:#7c8792;font-size:12px}.case-drawer header button{width:38px;height:38px;border:0;border-radius:7px;background:transparent;font-size:24px}.drawer-scroll{height:calc(100vh - 75px)}.case-section{margin:14px 18px 0;padding:17px;border:1px solid var(--line);border-radius:8px;background:#fff}.case-section h3{display:flex;align-items:center;gap:7px;margin:0 0 14px;font-size:14px}.case-section h3 .el-icon{color:#0aa9ad;font-size:17px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.info-grid div{display:flex;flex-direction:column;gap:5px}.info-grid span{color:#8a949e;font-size:11px}.info-grid strong{font-size:13px}.target-card{display:flex;flex-direction:column;gap:7px;padding:13px;border:1px solid #e7ecee;border-radius:7px;background:#fafcfc}.target-card strong{font-size:14px}.target-card span{color:#7c8792;font-size:12px}.description,.review-reason p,.result p{margin:0;color:#46515e;font-size:13px;line-height:1.75;white-space:pre-wrap}.evidence{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:14px}.evidence .el-image{width:100%;height:105px;border-radius:7px}.timeline-row{position:relative;display:grid;grid-template-columns:16px 1fr;gap:10px;padding-bottom:19px}.timeline-row::before{position:absolute;left:6px;top:14px;bottom:0;width:2px;background:#d8ecec;content:''}.timeline-row:last-child::before{display:none}.timeline-row>i{z-index:1;width:12px;height:12px;margin-top:3px;border:3px solid #d6f5f5;border-radius:50%;background:#14bfc1;box-sizing:border-box}.timeline-row>div{display:flex;flex-direction:column;gap:4px}.timeline-row strong{font-size:13px}.timeline-row span{color:#8a949e;font-size:11px}.timeline-row p{margin:4px 0 0;padding:10px;border-radius:6px;color:#55606c;background:#f6f8fa;font-size:12px;line-height:1.6}.review-reason{border-color:#f1d7bd;background:#fffaf4}.result{border-color:#cceadc;background:#f4fbf7}.case-drawer>footer{position:fixed;right:0;bottom:0;display:flex;align-items:center;justify-content:flex-end;gap:9px;width:600px;padding:13px 18px;border-top:1px solid var(--line);background:#fff;box-shadow:0 -7px 20px rgba(31,49,59,.06);box-sizing:border-box}:deep(.el-drawer__body){padding:0}:deep(.el-table__row){cursor:pointer}:deep(.el-table__row:hover td){background:#f1fbfb!important}@media(max-width:1280px){.filters{grid-template-columns:minmax(210px,1.3fr) 105px 120px 110px 100px 62px 62px}.summary-grid button{padding:13px}.summary-grid small{display:none}}@media(prefers-reduced-motion:reduce){.summary-grid button{transition:none}}
</style>
