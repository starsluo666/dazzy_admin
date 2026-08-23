<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { adminApi } from '../services/api'
import type {
  Gender,
  ProviderApplication,
  ProviderApplicationStatus,
  VerificationStatus,
} from '../types'

const props = defineProps<{ preview: boolean }>()

const rows = ref<ProviderApplication[]>([])
const selected = ref<ProviderApplication | null>(null)
const statusFilter = ref<ProviderApplicationStatus>('pending')
const cityFilter = ref('')
const verificationFilter = ref<VerificationStatus | ''>('')
const search = ref('')
const page = ref(1)
const pageSize = 10
const total = ref(0)
const loading = ref(false)
const reviewing = ref(false)

const statusTabs: Array<{ value: ProviderApplicationStatus; label: string }> = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'suspended', label: '已暂停' },
]

const verificationLabels: Record<VerificationStatus, string> = {
  unverified: '未实名',
  pending: '认证中',
  verified: '已实名',
  rejected: '认证未通过',
}

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

const maskedPhone = computed(() =>
  selected.value?.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
)
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
const canApprove = computed(() =>
  selected.value?.verification_status === 'verified'
  && Boolean(props.preview || selected.value?.lifestyle_photo_url),
)

function verificationLabel(value: VerificationStatus) {
  return verificationLabels[value]
}

function demoRows(): ProviderApplication[] {
  const names = ['林晓晓', '陈宇航', '王一然', '张子墨', '李思思', '赵天宇', '刘雨桐', '孙佳怡']
  return names.map((nickname, index) => ({
    id: index + 1,
    public_id: String(index),
    nickname,
    phone: `1380000${String(6688 + index).slice(-4)}`,
    verification_status: index === 4 ? 'unverified' : 'verified',
    gender: index % 2 ? 'male' : 'female',
    birth_date: index % 2 ? '1998-06-18' : '2000-03-12',
    status: 'pending',
    lifestyle_photo_url: null,
    service_city_code: '130400',
    service_city_name: '邯郸市',
    bio: '热爱旅行与摄影，熟悉本地城市路线。性格开朗、有耐心，喜欢结交新朋友。',
    max_service_radius_km: 20,
    service_names: [],
    submitted_at: '2026-08-22T10:26:00+08:00',
    reviewed_at: null,
    rejection_reason: '',
  }))
}

async function load() {
  loading.value = true
  try {
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
      verification_status: verificationFilter.value,
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
    total.value = 0
    selected.value = null
    ElMessage.error(error instanceof Error ? error.message : '达人申请加载失败')
  } finally {
    loading.value = false
  }
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
  verificationFilter.value = ''
  page.value = 1
  load()
}

async function review(decision: 'approve' | 'reject') {
  if (!selected.value || reviewing.value) return
  if (decision === 'approve' && !canApprove.value) {
    ElMessage.warning('请确认实名认证和生活照均已完成')
    return
  }
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
      await adminApi.reviewProvider(selected.value.id, decision, reason)
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

onMounted(load)
</script>

<template>
  <div class="review-page">
    <section class="review-list">
      <div class="review-heading">
        <p>达人管理　/　<strong>达人审核</strong></p>
        <h1>达人审核</h1>
        <span>审核达人身份状态、生活照、服务城市和基础申请资料</span>
      </div>

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
        <el-select v-model="verificationFilter" placeholder="实名认证状态">
          <el-option label="全部状态" value="" />
          <el-option label="已实名" value="verified" />
          <el-option label="认证中" value="pending" />
          <el-option label="未实名" value="unverified" />
          <el-option label="认证未通过" value="rejected" />
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
        <el-table-column label="实名认证" width="105">
          <template #default="scope">
            <el-tag
              :type="scope.row.verification_status === 'verified' ? 'success' : 'warning'"
              effect="plain"
            >
              {{ verificationLabel(scope.row.verification_status) }}
            </el-tag>
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
    </section>

    <aside v-if="selected" class="review-drawer">
      <header>
        <h2>达人申请详情</h2>
        <span>申请编号：PA{{ selected.id.toString().padStart(10, '0') }}</span>
        <button aria-label="关闭" @click="selected = null">×</button>
      </header>

      <div class="identity">
        <el-avatar :size="58">{{ selected.nickname.slice(0, 1) }}</el-avatar>
        <div>
          <strong>{{ selected.nickname }}</strong>
          <span>{{ selectedAge == null ? '生日未填写' : `${selectedAge}岁` }}　·　{{ genderLabels[selected.gender] }}</span>
          <el-tag
            :type="selected.verification_status === 'verified' ? 'success' : 'warning'"
            effect="plain"
          >
            {{ verificationLabel(selected.verification_status) }}
          </el-tag>
          <p>{{ maskedPhone }}　｜　提交时间：{{ selected.submitted_at?.slice(0, 16).replace('T', ' ') || '—' }}</p>
        </div>
      </div>

      <div class="steps">
        <span>✓<b>提交申请</b></span><i />
        <span :class="{ current: selected.status === 'pending' }">2<b>平台审核</b></span><i />
        <span :class="{ current: selected.status !== 'pending' }">3<b>{{ statusLabels[selected.status] }}</b></span>
      </div>

      <section>
        <h3>生活照</h3>
        <el-image
          v-if="selected.lifestyle_photo_url"
          class="lifestyle-photo"
          :src="selected.lifestyle_photo_url"
          :preview-src-list="[selected.lifestyle_photo_url]"
          fit="cover"
          preview-teleported
        />
        <div v-else class="photo-missing">申请人尚未上传生活照</div>
      </section>

      <section>
        <h3>基本资料</h3>
        <div class="info-grid">
          <p>性别：{{ genderLabels[selected.gender] }}</p>
          <p>服务城市：{{ selected.service_city_name }}</p>
          <p>服务半径：{{ selected.max_service_radius_km }}km</p>
        </div>
        <p>达人简介：</p>
        <p class="bio">{{ selected.bio }}</p>
      </section>

      <section>
        <h3>服务配置</h3>
        <div v-if="selected.service_names.length" class="service-tags">
          <el-tag v-for="name in selected.service_names" :key="name" effect="plain">{{ name }}</el-tag>
        </div>
        <p v-else class="muted-copy">申请通过后，达人可在工作台配置服务、价格和档期。</p>
      </section>

      <section>
        <h3>审核检查</h3>
        <div class="check-row">
          <span>实名认证</span>
          <el-tag :type="canApprove ? 'success' : 'danger'" effect="plain">
            {{ canApprove ? '已完成' : '未完成，禁止通过' }}
          </el-tag>
        </div>
        <div class="check-row">
          <span>申请资料</span>
          <el-tag type="success" effect="plain">已提交</el-tag>
        </div>
        <div class="check-row">
          <span>生活照</span>
          <el-tag :type="selected.lifestyle_photo_url || props.preview ? 'success' : 'danger'" effect="plain">
            {{ selected.lifestyle_photo_url || props.preview ? '已上传' : '未上传，禁止通过' }}
          </el-tag>
        </div>
      </section>

      <section v-if="selected.status === 'rejected' && selected.rejection_reason">
        <h3>驳回原因</h3>
        <p class="bio">{{ selected.rejection_reason }}</p>
      </section>

      <footer v-if="selected.status === 'pending'">
        <span>操作将记录至审计日志</span>
        <el-button class="reject" :loading="reviewing" @click="review('reject')">驳回申请</el-button>
        <el-button type="primary" :loading="reviewing" :disabled="!canApprove" @click="review('approve')">
          通过审核
        </el-button>
      </footer>
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
</style>
