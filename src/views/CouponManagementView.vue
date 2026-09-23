<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '../services/api'
import type { AdminCoupon } from '../types'
import { formatDateTime, formatMoney } from '../utils/format'

const props = defineProps<{ preview: boolean }>()
type UserOption = { public_id: string; nickname: string; phone_masked: string }
const rows = ref<AdminCoupon[]>([])
const users = ref<UserOption[]>([])
const search = ref('')
const selectedUser = ref('')
const loading = ref(false)
const issuing = ref(false)
const statusLabels: Record<string, string> = { available: '可用', reserved: '订单占用中', used: '已使用', expired: '已过期' }
const sourceLabels: Record<string, string> = { report_reward: '举报有奖', customer_service: '客服发放', manual: '人工发放' }

async function load() {
  loading.value = true
  try {
    const data = await adminApi.coupons()
    rows.value = data.items
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '优惠券加载失败')
  } finally { loading.value = false }
}
async function findUsers() {
  const keyword = search.value.trim()
  if (!keyword) { users.value = []; return }
  try {
    const data = await adminApi.couponUsers(keyword)
    users.value = data.users
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '用户查询失败')
  }
}
async function issue() {
  if (!selectedUser.value || issuing.value || props.preview) return
  const userId = selectedUser.value
  const user = users.value.find((item) => item.public_id === userId)
  issuing.value = true
  try {
    try {
      await ElMessageBox.confirm(`确认向 ${user?.nickname || userId} 发放一张当前规则的优惠券？`, '确认发券', { type: 'warning' })
    } catch { return }
    await adminApi.issueCoupon(userId)
    ElMessage.success('优惠券已发放并写入操作审计')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发券失败')
  } finally { issuing.value = false }
}
onMounted(load)
</script>

<template>
  <div class="page coupon-page" v-loading="loading">
    <header class="page-heading"><div><h1>优惠券管理</h1><p>客服指定用户发券，金额、门槛和有效期取平台参数配置。</p></div></header>
    <section class="coupon-panel">
      <h2>向用户发放</h2>
      <div class="issue-form">
        <el-input v-model="search" placeholder="搜索用户昵称或手机号" clearable @keyup.enter="findUsers" />
        <el-button @click="findUsers">搜索</el-button>
        <el-select v-model="selectedUser" filterable placeholder="选择用户" style="width:260px">
          <el-option v-for="user in users" :key="user.public_id" :label="`${user.nickname} · ${user.phone_masked}`" :value="user.public_id" />
        </el-select>
        <el-button type="primary" :loading="issuing" :disabled="!selectedUser || preview" @click="issue">发放优惠券</el-button>
      </div>
      <p v-if="preview" class="hint">预览模式不可发放真实优惠券。</p>
    </section>
    <section class="coupon-panel">
      <h2>发放记录</h2>
      <el-table :data="rows" empty-text="暂无优惠券" style="width:100%">
        <el-table-column prop="user_name" label="用户" min-width="110" />
        <el-table-column label="面额" min-width="90"><template #default="{ row }">{{ formatMoney(row.face_amount) }}</template></el-table-column>
        <el-table-column label="使用门槛" min-width="125"><template #default="{ row }">订单金额大于 {{ formatMoney(row.min_order_amount) }}</template></el-table-column>
        <el-table-column label="状态" min-width="100"><template #default="{ row }">{{ statusLabels[row.status] || row.status }}</template></el-table-column>
        <el-table-column label="来源" min-width="115"><template #default="{ row }">{{ sourceLabels[row.source] || row.source }}</template></el-table-column>
        <el-table-column label="有效期至" min-width="165"><template #default="{ row }">{{ formatDateTime(row.expires_at) }}</template></el-table-column>
        <el-table-column label="发放人" min-width="100"><template #default="{ row }">{{ row.issued_by || '系统' }}</template></el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.coupon-page { padding: 24px; }
.coupon-panel { margin-top: 18px; padding: 22px; border: 1px solid #e0e5ea; border-radius: 8px; background: #fff; }
.coupon-panel h2 { margin: 0 0 16px; font-size: 17px; }
.issue-form { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.issue-form .el-input { width: 250px; }
.hint { margin: 12px 0 0; color: #7a8492; font-size: 12px; }
</style>
