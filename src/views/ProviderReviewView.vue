<script setup lang="ts">
import ProviderGallery from '../components/ProviderGallery.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { adminApi } from '../services/api'
import type {
  Gender,
  AdminServiceCategory,
  ProviderApplication,
  ProviderApplicationStatus,
  ProviderChangeReview,
  ProviderChangeReviewKind,
} from '../types'

const props = defineProps<{ preview: boolean }>()

const rows = ref<ProviderApplication[]>([])
const selected = ref<ProviderApplication | null>(null)
const statusFilter = ref<ProviderApplicationStatus>('pending')
const cityFilter = ref('')
const search = ref('')
const page = ref(1)
const pageSize = 10
const total = ref(0)
const loading = ref(false)
const reviewing = ref(false)
const reviewMode = ref<'application' | ProviderChangeReviewKind>('application')
const changeStatusFilter = ref<'pending' | 'approved' | 'rejected'>('pending')
const changeRows = ref<ProviderChangeReview[]>([])
const selectedChange = ref<ProviderChangeReview | null>(null)
const categoryOptions = ref<AdminServiceCategory[]>([])
const allowedCategoryIds = ref<number[]>([])

const statusTabs: Array<{ value: ProviderApplicationStatus; label: string }> = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'suspended', label: '已暂停' },
]

const statusLabels: Record<ProviderApplicationStatus, string> = {
  draft: '草稿',
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  suspended: '已暂停',
}

const genderLabels: Record<Gender, string> = {
  unspecified: '保密',
  male: '男',
  female: '女',
}

const selectedAge = computed(() => {
  if (!selected.value?.birth_date) return null
  const birth = new Date(`${selected.value.birth_date}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (
    today.getMonth() < birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age -= 1
  return age
})
function demoRows(): ProviderApplication[] {
  const names = ['林晓晓', '陈宇航', '王一然', '张子墨', '李思思', '赵天宇', '刘雨桐', '孙佳怡']
  return names.map((nickname, index) => ({
    id: index + 1,
    public_id: String(index),
    nickname,
    application_real_name: nickname,
    phone: `1380000${String(6688 + index).slice(-4)}`,
    gender: index % 2 ? 'male' : 'female',
    birth_date: index % 2 ? '1998-06-18' : '2000-03-12',
    status: 'pending',
    lifestyle_photo_url: null,
    service_city_code: '130400',
    service_city_name: '邯郸市',
    bio: '热爱旅行与摄影，熟悉本地城市路线。性格开朗、有耐心，喜欢结交新朋友。',
    max_service_radius_km: 20,
    service_names: [],
    allowed_categories: [],
    onboarding_status: 'incomplete',
    onboarding_submitted_at: null,
    submitted_at: '2026-08-22T10:26:00+08:00',
    reviewed_at: null,
    rejection_reason: '',
  }))
}

async function load() {
  loading.value = true
  try {
    if (reviewMode.value !== 'application') {
      if (props.preview) {
        changeRows.value = []
        selectedChange.value = null
        total.value = 0
        return
      }
      const data = await adminApi.providerChangeReviews(
        reviewMode.value,
        changeStatusFilter.value,
        page.value,
      )
      changeRows.value = data.items
      total.value = data.pagination.total
      if (!selectedChange.value || !changeRows.value.some(item => item.id === selectedChange.value?.id)) {
        selectedChange.value = changeRows.value[0] || null
      }
      return
    }
    if (props.preview) {
      const items = statusFilter.value === 'pending' ? demoRows() : []
      rows.value = items
      total.value = items.length
      selected.value = items[0] || null
      return
    }
    const data = await adminApi.providers({
      status: statusFilter.value,
      city_code: cityFilter.value,
      search: search.value.trim(),
      page: page.value,
      page_size: pageSize,
    })
    rows.value = data.items
    total.value = data.pagination.total
    if (!selected.value || !rows.value.some((item) => item.id === selected.value?.id)) {
      selected.value = rows.value[0] || null
    }
  } catch (error) {
    rows.value = []
    changeRows.value = []
    total.value = 0
    selected.value = null
    selectedChange.value = null
    ElMessage.error(error instanceof Error ? error.message : '达人申请加载失败')
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  if (props.preview) return
  try {
    const data = await adminApi.serviceCategories({ status: 'active', page: 1, page_size: 50 })
    categoryOptions.value = data.items
  } catch {
    categoryOptions.value = []
  }
}

function switchReviewMode(mode: string | number | boolean | undefined) {
  reviewMode.value = String(mode) as 'application' | ProviderChangeReviewKind
  page.value = 1
  selected.value = null
  selectedChange.value = null
  load()
}

function changeReviewStatus(value: string) {
  changeStatusFilter.value = value as 'pending' | 'approved' | 'rejected'
  page.value = 1
  selectedChange.value = null
  load()
}

function changeStatus(value: ProviderApplicationStatus) {
  statusFilter.value = value
  page.value = 1
  selected.value = null
  load()
}

function resetFilters() {
  search.value = ''
  cityFilter.value = ''
  page.value = 1
  load()
}

async function review(decision: 'approve' | 'reject') {
  if (!selected.value || reviewing.value) return
  let reason = ''
  if (decision === 'reject') {
    try {
      const result = await ElMessageBox.prompt(
        '请填写明确的驳回原因，申请人将看到该说明。',
        '驳回申请',
        { inputValidator: (value) => Boolean(value.trim()) || '必须填写驳回原因' },
      )
      reason = result.value.trim()
    } catch {
      return
    }
  } else {
    if (!allowedCategoryIds.value.length) {
      ElMessage.warning('请至少选择一个达人可经营的服务分类')
      return
    }
    try {
      await ElMessageBox.confirm('确认通过这条达人申请吗？', '通过申请', {
        confirmButtonText: '确认通过',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return
    }
  }

  reviewing.value = true
  try {
    if (!props.preview) {
      await adminApi.reviewProvider(
        selected.value.id,
        decision,
        reason,
        decision === 'approve' ? allowedCategoryIds.value : [],
      )
    }
    ElMessage.success(decision === 'approve' ? '已通过审核' : '已驳回申请')
    selected.value = null
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '审核操作失败')
  } finally {
    reviewing.value = false
  }
}

async function reviewChange(decision: 'approve' | 'reject') {
  if (!selectedChange.value || reviewing.value || reviewMode.value === 'application') return
  let reason = ''
  if (decision === 'reject') {
    try {
      const result = await ElMessageBox.prompt('请填写明确的驳回原因。', '驳回审核', {
        inputValidator: value => Boolean(value.trim()) || '必须填写驳回原因',
      })
      reason = result.value.trim()
    } catch { return }
  } else {
    try {
      await ElMessageBox.confirm('确认通过本次审核吗？通过后内容将正式生效。', '通过审核', { type: 'warning' })
    } catch { return }
  }
  reviewing.value = true
  try {
    if (!props.preview) await adminApi.reviewProviderChange(reviewMode.value, selectedChange.value.id, decision, reason)
    ElMessage.success(decision === 'approve' ? '审核已通过' : '审核已驳回')
    selectedChange.value = null
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '审核操作失败')
  } finally {
    reviewing.value = false
  }
}

watch(selected, value => {
  allowedCategoryIds.value = value?.allowed_categories.map(item => item.id) || []
})

onMounted(() => { load(); loadCategories() })
</script>

<template>
  <div class="review-page">
    <section class="review-list">
      <div class="review-heading">
        <p>达人管理　/　<strong>达人审核</strong></p>
        <h1>达人审核</h1>
        <span>审核达人入驻意向；通过后申请人进入达人端完成实名与正式资料</span>
      </div>

      <div class="review-kind-tabs">
        <el-radio-group :model-value="reviewMode" @change="switchReviewMode">
          <el-radio-button value="application">入驻初审</el-radio-button>
          <el-radio-button value="onboarding">开通审核</el-radio-button>
          <el-radio-button value="profile">资料变更</el-radio-button>
          <el-radio-button value="service">服务变更</el-radio-button>
        </el-radio-group>
      </div>

      <template v-if="reviewMode === 'application'">
      <div class="review-tabs">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          :class="{ active: statusFilter === tab.value }"
          @click="changeStatus(tab.value)"
        >
          {{ tab.label }} <b v-if="statusFilter === tab.value">{{ total }}</b>
        </button>
      </div>

      <div class="filters">
        <el-input v-model="search" clearable placeholder="手机号 / 昵称" @keyup.enter="load" />
        <el-select v-model="cityFilter" placeholder="服务城市">
          <el-option label="全部城市" value="" />
          <el-option label="邯郸市" value="130400" />
          <el-option label="北京市" value="110100" />
          <el-option label="上海市" value="310100" />
        </el-select>
        <el-button @click="resetFilters">重置</el-button>
        <el-button type="primary" @click="page = 1; load()">查询</el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        height="570"
        highlight-current-row
        empty-text="当前筛选条件下没有达人申请"
        @current-change="selected = $event"
      >
        <el-table-column label="申请人" min-width="130">
          <template #default="scope">
            <div class="applicant">
              <el-avatar :size="36">{{ scope.row.nickname.slice(0, 1) }}</el-avatar>
              <span>{{ scope.row.nickname }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="手机号" width="125">
          <template #default="scope">
            {{ scope.row.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') }}
          </template>
        </el-table-column>
        <el-table-column prop="service_city_name" label="服务城市" width="90" />
        <el-table-column label="服务配置" min-width="150">
          <template #default="scope">
            {{ scope.row.service_names.join(' / ') || '审核通过后配置' }}
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="150">
          <template #default="scope">
            {{ scope.row.submitted_at?.slice(0, 16).replace('T', ' ') || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="70">
          <template #default="scope">
            <el-button link type="primary" @click="selected = scope.row">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <footer class="table-footer">
        共 {{ total }} 条
        <el-pagination
          v-model:current-page="page"
          layout="prev, pager, next"
          :total="total"
          :page-size="pageSize"
          @current-change="load"
        />
      </footer>
      </template>

      <template v-else>
        <div class="review-tabs">
          <button v-for="tab in [{ value: 'pending', label: '待审核' }, { value: 'approved', label: '已通过' }, { value: 'rejected', label: '已驳回' }]" :key="tab.value" :class="{ active: changeStatusFilter === tab.value }" @click="changeReviewStatus(tab.value)">
            {{ tab.label }} <b v-if="changeStatusFilter === tab.value">{{ total }}</b>
          </button>
        </div>
        <el-table v-loading="loading" :data="changeRows" height="630" highlight-current-row empty-text="当前没有审核任务" @current-change="selectedChange = $event">
          <el-table-column prop="application_real_name" label="真实姓名" min-width="110" />
          <el-table-column prop="provider_name" label="达人名" min-width="120" />
          <el-table-column label="手机号" width="125"><template #default="scope">{{ scope.row.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') }}</template></el-table-column>
          <el-table-column prop="service_city_name" label="服务城市" width="100" />
          <el-table-column label="审核内容" min-width="120"><template #default>{{ reviewMode === 'onboarding' ? '综合开通' : reviewMode === 'profile' ? '资料变更' : '服务变更' }}</template></el-table-column>
          <el-table-column label="提交时间" width="160"><template #default="scope">{{ scope.row.submitted_at?.slice(0, 16).replace('T', ' ') || '—' }}</template></el-table-column>
          <el-table-column label="操作" width="70"><template #default="scope"><el-button link type="primary" @click="selectedChange = scope.row">查看</el-button></template></el-table-column>
        </el-table>
        <footer class="table-footer">共 {{ total }} 条<el-pagination v-model:current-page="page" layout="prev, pager, next" :total="total" :page-size="20" @current-change="load" /></footer>
      </template>
    </section>

    <aside v-if="reviewMode === 'application' && selected" class="review-drawer">
      <header>
        <h2>达人申请详情</h2>
        <span>申请编号：PA{{ selected.id.toString().padStart(10, '0') }}</span>
        <button aria-label="关闭" @click="selected = null">×</button>
      </header>

      <div class="identity">
        <el-avatar :size="58">{{ selected.nickname.slice(0, 1) }}</el-avatar>
        <div>
          <strong>{{ selected.application_real_name || selected.nickname }}</strong>
          <span>{{ selectedAge == null ? '生日未填写' : `${selectedAge}岁` }}　·　{{ genderLabels[selected.gender] }}</span>
          <p>{{ selected.phone }}　｜　提交时间：{{ selected.submitted_at?.slice(0, 16).replace('T', ' ') || '—' }}</p>
        </div>
      </div>

      <div class="steps">
        <span>✓<b>提交申请</b></span><i />
        <span :class="{ current: selected.status === 'pending' }">2<b>平台审核</b></span><i />
        <span :class="{ current: selected.status !== 'pending' }">3<b>{{ statusLabels[selected.status] }}</b></span><i />
        <span>4<b>达人端认证</b></span>
      </div>

      <section>
        <h3>基本资料</h3>
        <div class="info-grid">
          <p>性别：{{ genderLabels[selected.gender] }}</p>
          <p>服务城市：{{ selected.service_city_name }}</p>
          <p>服务半径：{{ selected.max_service_radius_km }}km</p>
        </div>
        <p>达人简介：</p>
        <p class="bio">{{ selected.bio }}</p>
        <el-image v-if="selected.lifestyle_photo_url" class="lifestyle-photo" :src="selected.lifestyle_photo_url" fit="cover" :preview-src-list="[selected.lifestyle_photo_url]" />
        <div v-else class="photo-missing">未提交近期生活照</div>
      </section>

      <section>
        <h3>允许经营的服务分类</h3>
        <el-checkbox-group v-model="allowedCategoryIds" :disabled="selected.status !== 'pending'">
          <el-checkbox v-for="category in categoryOptions" :key="category.id" :value="category.id">{{ category.name }}</el-checkbox>
        </el-checkbox-group>
        <p class="muted-copy">初审通过后，达人端只能选择这里授权的分类。</p>
      </section>

      <section>
        <h3>审核检查</h3>
        <div class="check-row">
          <span>入驻意向</span>
          <el-tag type="success" effect="plain">基础资料已提交</el-tag>
        </div>
        <div class="check-row">
          <span>申请资料</span>
          <el-tag type="success" effect="plain">已提交</el-tag>
        </div>
        <div class="check-row"><span>实名认证与生活照</span><el-tag type="info" effect="plain">初审通过后在达人端完成</el-tag></div>
      </section>

      <section v-if="selected.status === 'rejected' && selected.rejection_reason">
        <h3>驳回原因</h3>
        <p class="bio">{{ selected.rejection_reason }}</p>
      </section>

      <footer v-if="selected.status === 'pending'">
        <span>操作将记录至审计日志</span>
        <el-button class="reject" :loading="reviewing" @click="review('reject')">驳回申请</el-button>
        <el-button type="primary" :loading="reviewing" @click="review('approve')">
          通过审核
        </el-button>
      </footer>
    </aside>

    <aside v-if="reviewMode !== 'application' && selectedChange" class="review-drawer">
      <header><h2>{{ reviewMode === 'onboarding' ? '达人开通审核' : reviewMode === 'profile' ? '资料变更审核' : '服务变更审核' }}</h2><span>审核编号：{{ selectedChange.id }}</span><button aria-label="关闭" @click="selectedChange = null">×</button></header>
      <div class="identity"><el-avatar :size="58">{{ selectedChange.provider_name.slice(0, 1) }}</el-avatar><div><strong>{{ selectedChange.provider_name }}</strong><span>真实姓名：{{ selectedChange.application_real_name || '—' }}</span><p>{{ selectedChange.phone }}　｜　{{ selectedChange.service_city_name }}</p></div></div>
      <section v-if="reviewMode === 'onboarding'">
        <h3>实名认证</h3>
        <p :class="{ 'name-warning': !selectedChange.identity_name_matches }">认证姓名：{{ selectedChange.identity_real_name || '—' }} {{ selectedChange.identity_name_matches ? '' : '（与申请姓名不一致）' }}</p>
        <p>证件号：{{ selectedChange.identity?.number_masked || '—' }}</p>
        <div class="identity-photos"><el-image v-if="selectedChange.identity?.front_photo_url" :src="selectedChange.identity.front_photo_url" fit="cover" :preview-src-list="[selectedChange.identity.front_photo_url]" /><el-image v-if="selectedChange.identity?.back_photo_url" :src="selectedChange.identity.back_photo_url" fit="cover" :preview-src-list="[selectedChange.identity.back_photo_url]" /><el-image v-if="selectedChange.identity?.face_photo_url" :src="selectedChange.identity.face_photo_url" fit="cover" :preview-src-list="[selectedChange.identity.face_photo_url]" /></div>
      </section>
      <section v-if="selectedChange.profile_revision"><h3>达人资料</h3><p>达人名：{{ selectedChange.profile_revision.display_name }}</p><p>城市与范围：{{ selectedChange.profile_revision.service_city_name }} · {{ selectedChange.profile_revision.max_service_radius_km }}km</p><p class="bio">{{ selectedChange.profile_revision.bio }}</p><ProviderGallery :media="selectedChange.profile_revision.media" :cover="selectedChange.profile_revision.lifestyle_photo_url" /></section>
      <section v-if="selectedChange.service_revisions.length"><h3>服务配置</h3><div v-for="service in selectedChange.service_revisions" :key="service.id" class="service-review"><strong>{{ service.category_name }} · {{ service.action_label }}</strong><span>{{ service.billing_type_label }} ¥{{ service.price_amount / 100 }}（允许 ¥{{ service.min_price_amount / 100 }}–{{ service.max_price_amount / 100 }}）</span><p>{{ service.description || '无服务说明' }}</p></div></section>
      <section v-if="selectedChange.rejection_reason"><h3>驳回原因</h3><p class="bio">{{ selectedChange.rejection_reason }}</p></section>
      <footer v-if="changeStatusFilter === 'pending'"><span>通过后将正式发布本次内容</span><el-button class="reject" :loading="reviewing" @click="reviewChange('reject')">驳回</el-button><el-button type="primary" :loading="reviewing" :disabled="reviewMode === 'onboarding' && !selectedChange.identity_name_matches" @click="reviewChange('approve')">通过审核</el-button></footer>
    </aside>
  </div>
</template>

<style scoped>
.lifestyle-photo {
  width: 100%;
  height: 240px;
  border-radius: 12px;
  background: #f2f5f6;
}

.photo-missing {
  display: flex;
  height: 120px;
  align-items: center;
  justify-content: center;
  border: 1px dashed #d8dfe2;
  border-radius: 12px;
  color: var(--muted);
  background: #f8fafb;
}

.service-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.muted-copy {
  margin: 0;
  color: var(--muted);
  line-height: 1.7;
}

.check-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  border-bottom: 1px solid #edf0f3;
}

.check-row:last-child {
  border-bottom: 0;
}

.review-kind-tabs { margin-bottom: 14px; }
.identity-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.identity-photos .el-image { height: 108px; border-radius: 8px; background: #f2f5f6; }
.service-review { display: flex; gap: 6px; padding: 12px 0; border-bottom: 1px solid #edf0f3; flex-direction: column; }
.service-review span, .service-review p { margin: 0; color: var(--muted); font-size: 12px; }
.name-warning { color: #d93025; font-weight: 650; }
</style>
