<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'

import { adminApi } from '../../services/api'
import type { ActivityReportStatus, AdminActivityReport, AdminActivityReportSummary } from '../../types'

const props = defineProps<{ preview: boolean; canManage: boolean }>()
const rows = ref<AdminActivityReport[]>([])
const summary = ref<AdminActivityReportSummary>({ total: 0, pending: 0, processing: 0, resolved: 0 })
const search = ref('')
const statusFilter = ref<ActivityReportStatus | ''>('')
const cityFilter = ref('')
const loading = ref(false)
const saving = ref(false)
const selected = ref<AdminActivityReport | null>(null)
const drawerVisible = ref(false)
const cityOptions = [{ label: '邯郸市', value: '130400' }, { label: '北京市', value: '110100' }]
function demo(id: number, status: ActivityReportStatus, reason: string): AdminActivityReport { return { case_no: `ARP20260829${String(id).padStart(6,'0')}`, activity_id: 20+id, activity_title: id===1?'周五晚桌球新手友好局':'城市推理夜 · 欢乐剧本局', activity_status:'recruiting', city_code:'130400', city_name:'邯郸市', organizer_name:id===1?'晓晓':'周末玩家', reporter_name:id===1?'小雨':'阿哲', reporter_phone_masked:`186****12${id}0`, reason:id===1?'safety_risk':'false_information', reason_label:reason, description:id===1?'集合地点与页面描述不一致，希望平台核实。':'活动费用说明不清晰。', status, status_label:status==='pending'?'待处理':status==='processing'?'处理中':status==='resolved'?'已处理':'不予受理', result_note:status==='resolved'?'已联系发起人完成信息整改。':'', reviewed_by_name:status==='resolved'?'运营管理员':null, reviewed_at:status==='resolved'?new Date().toISOString():null, created_at:new Date(Date.now()-id*3600000).toISOString(), updated_at:new Date().toISOString() } }
const demoRows = ref([demo(1,'pending','存在安全风险'),demo(2,'processing','信息不实'),demo(3,'resolved','内容不当')])
const cards = computed(()=>[{key:'',label:'全部举报',value:summary.value.total},{key:'pending',label:'待处理',value:summary.value.pending},{key:'processing',label:'处理中',value:summary.value.processing},{key:'resolved',label:'已处理',value:summary.value.resolved}])
function filteredDemo(){const keyword=search.value.trim();return demoRows.value.filter(item=>(!statusFilter.value||item.status===statusFilter.value)&&(!cityFilter.value||item.city_code===cityFilter.value)&&(!keyword||`${item.case_no}${item.activity_title}${item.reporter_name}`.includes(keyword)))}
function demoSummary(){return{total:demoRows.value.length,pending:demoRows.value.filter(i=>i.status==='pending').length,processing:demoRows.value.filter(i=>i.status==='processing').length,resolved:demoRows.value.filter(i=>i.status==='resolved').length}}
async function load(){loading.value=true;try{if(props.preview){rows.value=filteredDemo();summary.value=demoSummary();return}const data=await adminApi.activityReports({search:search.value.trim(),status:statusFilter.value,city_code:cityFilter.value,page_size:50});rows.value=data.items;summary.value=data.summary}catch(error){ElMessage.error(error instanceof Error?error.message:'举报数据加载失败')}finally{loading.value=false}}
function selectStatus(key:string){statusFilter.value=key as ActivityReportStatus|'';load()}
function open(item:AdminActivityReport){selected.value=item;drawerVisible.value=true}
async function action(type:'start_review'|'resolve'|'reject'){
  if(!selected.value||!props.canManage)return
  let note=''
  if(type!=='start_review'){try{const result=await ElMessageBox.prompt(type==='resolve'?'填写处理措施及结果，提交后举报将完结。':'填写不予受理原因。',type==='resolve'?'完成处理':'不予受理',{inputPlaceholder:'请输入处理结论',inputValidator:value=>value.trim().length>=2||'至少填写2个字'});note=result.value.trim()}catch(error){if(error==='cancel'||error==='close')return;throw error}}
  saving.value=true
  try{if(props.preview){const item=demoRows.value.find(row=>row.case_no===selected.value?.case_no);if(item){item.status=type==='start_review'?'processing':type==='resolve'?'resolved':'rejected';item.status_label=type==='start_review'?'处理中':type==='resolve'?'已处理':'不予受理';item.result_note=note;item.reviewed_by_name='运营管理员';item.reviewed_at=new Date().toISOString();selected.value={...item}}}else selected.value=await adminApi.reviewActivityReport(selected.value.case_no,type,note);ElMessage.success(type==='start_review'?'已开始处理':'举报处理结果已保存');await load()}catch(error){ElMessage.error(error instanceof Error?error.message:'处理失败')}finally{saving.value=false}
}
function format(value:string|null){return value?new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—'}
function tag(status:ActivityReportStatus){return status==='pending'?'warning':status==='processing'?'primary':status==='resolved'?'success':'info'}
onMounted(load)
</script>
<template>
  <section class="reports-wrap">
    <div class="report-head"><div><strong>举报与异常处置</strong><span>核查活动内容、发起人行为与线下安全问题</span></div><el-button :icon="Refresh" @click="load">刷新</el-button></div>
    <div class="summary"><button v-for="card in cards" :key="card.key" :class="{active:statusFilter===card.key}" @click="selectStatus(card.key)"><span>{{card.label}}</span><strong>{{card.value}}</strong></button></div>
    <div class="filters"><el-input v-model="search" clearable :prefix-icon="Search" placeholder="搜索举报单、活动或举报人" @keyup.enter="load"/><el-select v-model="cityFilter" clearable placeholder="全部城市" @change="load"><el-option v-for="city in cityOptions" :key="city.value" :label="city.label" :value="city.value"/></el-select><el-select v-model="statusFilter" clearable placeholder="全部状态" @change="load"><el-option label="待处理" value="pending"/><el-option label="处理中" value="processing"/><el-option label="已处理" value="resolved"/><el-option label="不予受理" value="rejected"/></el-select><el-button type="primary" @click="load">查询</el-button></div>
    <el-table v-loading="loading" :data="rows" height="calc(100vh - 394px)" empty-text="暂无活动举报">
      <el-table-column label="举报单" min-width="180"><template #default="{row}"><div class="case"><strong>{{row.case_no}}</strong><small>{{format(row.created_at)}}</small></div></template></el-table-column>
      <el-table-column label="关联活动" min-width="230"><template #default="{row}"><div class="case"><strong>{{row.activity_title}}</strong><small>#{{row.activity_id}} · {{row.city_name}} · 发起人 {{row.organizer_name}}</small></div></template></el-table-column>
      <el-table-column label="举报人" width="130"><template #default="{row}"><div class="case"><strong>{{row.reporter_name}}</strong><small>{{row.reporter_phone_masked}}</small></div></template></el-table-column>
      <el-table-column label="原因" min-width="130" prop="reason_label"/><el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="tag(row.status)">{{row.status_label}}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="90" fixed="right"><template #default="{row}"><el-button link type="primary" @click="open(row)">处理</el-button></template></el-table-column>
    </el-table>
    <el-drawer v-model="drawerVisible" size="560px"><template #header><div class="drawer-title"><span>举报详情</span><el-tag v-if="selected" :type="tag(selected.status)">{{selected.status_label}}</el-tag></div></template><div v-if="selected" class="detail"><section><small>举报单号</small><strong>{{selected.case_no}}</strong><p>{{format(selected.created_at)}}</p></section><section><h3>{{selected.activity_title}}</h3><p>活动 #{{selected.activity_id}} · {{selected.city_name}}</p><p>发起人：{{selected.organizer_name}}</p></section><section><small>举报人</small><strong>{{selected.reporter_name}}　{{selected.reporter_phone_masked}}</strong></section><section class="reason"><small>{{selected.reason_label}}</small><p>{{selected.description||'用户未填写补充说明'}}</p></section><section v-if="selected.result_note" class="result"><small>处理结论</small><p>{{selected.result_note}}</p><span>{{selected.reviewed_by_name}} · {{format(selected.reviewed_at)}}</span></section></div><template #footer><div v-if="selected&&canManage" class="actions"><el-button v-if="selected.status==='pending'" :loading="saving" @click="action('start_review')">开始处理</el-button><template v-if="['pending','processing'].includes(selected.status)"><el-button :disabled="saving" @click="action('reject')">不予受理</el-button><el-button type="primary" :loading="saving" @click="action('resolve')">完成处理</el-button></template></div><el-button v-else @click="drawerVisible=false">关闭</el-button></template></el-drawer>
  </section>
</template>
<style scoped>
.reports-wrap{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.report-head{display:flex;align-items:center;justify-content:space-between;padding:17px 18px;border-bottom:1px solid var(--line)}.report-head>div{display:flex;flex-direction:column;gap:3px}.report-head strong{font-size:15px}.report-head span{color:var(--muted);font-size:11px}.summary{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--line)}.summary button{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border:0;border-right:1px solid var(--line);background:#fafbfc;text-align:left}.summary button:last-child{border-right:0}.summary button.active{color:#078f94;background:#eefafa}.summary span{font-size:11px}.summary strong{font-size:20px}.filters{display:grid;grid-template-columns:minmax(260px,1fr) 130px 130px 68px;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.case{display:flex;flex-direction:column;gap:4px}.case strong{font-size:12px}.case small{color:var(--muted);font-size:10px}.drawer-title{display:flex;align-items:center;gap:9px;font-weight:700}.detail{display:flex;flex-direction:column;gap:12px}.detail section{display:flex;flex-direction:column;gap:7px;padding:16px;border:1px solid var(--line);border-radius:8px}.detail h3,.detail p{margin:0}.detail h3{font-size:16px}.detail p{color:#5e6974;font-size:12px;line-height:1.7}.detail small,.detail span{color:var(--muted);font-size:10px}.reason{border-left:3px solid #e97825!important}.result{border-left:3px solid #08aeb4!important;background:#f5fbfb}.actions{display:flex;justify-content:flex-end;width:100%}
</style>
