<script setup lang="ts">
import type { ProviderCommissionOverview } from '../types'
import { formatDateTime, formatMoney } from '../utils/format'
defineProps<{ overview: ProviderCommissionOverview }>()
const periods = { month: '自然月', quarter: '自然季度', year: '自然年', never: '永久累计' }
const source = (value: string) => value === 'provider' ? '达人专属' : '平台规则'
</script>

<template>
  <section class="commission-summary">
    <h3>当前生效分成</h3>
    <p class="muted">适用于当前新建订单，历史订单使用下单时的分成快照。</p>
    <el-table :data="overview.categories" empty-text="尚未授权或配置服务分类" size="small">
      <el-table-column prop="category_name" label="服务分类" min-width="90" />
      <el-table-column label="基础分成" width="88"><template #default="{ row }">{{ row.base_provider_rate }}%</template></el-table-column>
      <el-table-column label="实际加成" width="95"><template #default="{ row }">+{{ row.provider_bonus_rate }} 点</template></el-table-column>
      <el-table-column label="达人分成" width="90"><template #default="{ row }"><strong class="rate">{{ row.provider_rate }}%</strong></template></el-table-column>
      <el-table-column label="平台比例" width="88"><template #default="{ row }">{{ row.platform_commission_rate }}%</template></el-table-column>
    </el-table>
    <div class="turnover"><span>本期累计净服务费</span><strong>{{ formatMoney(overview.provider_bonus_turnover_amount) }}</strong><span v-if="overview.next_tier_remaining_amount !== null">距下一档还差 {{ formatMoney(overview.next_tier_remaining_amount) }}</span></div>
    <p>阶梯来源：{{ source(overview.tiers_source) }} · 周期：{{ periods[overview.provider_bonus_period] }}（{{ source(overview.period_source) }}）</p>
    <el-table v-if="overview.tiers.length" :data="overview.tiers" size="small">
      <el-table-column label="营业额区间" min-width="160"><template #default="{ row, $index }">{{ formatMoney(row.threshold_amount) }} 起<span v-if="overview.tiers[$index + 1]">，低于 {{ formatMoney(overview.tiers[$index + 1]!.threshold_amount) }}</span></template></el-table-column>
      <el-table-column label="配置加成" width="110"><template #default="{ row }">+{{ row.bonus_rate }} 个百分点</template></el-table-column>
      <el-table-column label="档位" width="100"><template #default="{ $index }"><el-tag v-if="$index === overview.current_tier_index" size="small" type="success">当前档位</el-tag></template></el-table-column>
    </el-table>
    <p v-else class="muted">当前未启用阶梯加成，按分类基础比例执行。</p>
    <p class="muted">累计已确认完成订单的净服务费，不含路费；加成最多抵扣该分类的平台抽成，达人最高 100%。平台比例为扣渠道费前的业务比例。更新于 {{ formatDateTime(overview.provider_bonus_snapshot_at) }}。</p>
  </section>
</template>

<style scoped>
.commission-summary{margin-top:20px;padding-top:18px;border-top:1px solid var(--line)}.commission-summary h3{margin:0 0 10px;font-size:15px}.commission-summary p{font-size:12px;line-height:1.7}.muted{color:var(--muted)}.rate{color:var(--primary,#078c92)}.turnover{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:16px;padding:12px;background:#f1fafa;border-radius:8px;font-size:12px}.turnover strong{font-size:18px}
</style>
