<script setup lang="ts">
import type { ProviderWalletSettlementPreparation } from '../types'
import { formatMoney } from '../utils/format'

defineProps<{ preparation: ProviderWalletSettlementPreparation }>()
const amount = (value: number | null) => value == null ? '待核实' : formatMoney(value)
</script>

<template>
  <div class="wallet-preparation" data-testid="wallet-settlement-preparation">
    <h4>余额 / 组合支付资金核对</h4>
    <el-alert :type="preparation.status === 'blocked' ? 'warning' : 'info'" :closable="false"
      :title="preparation.status_label"
      description="本卡仅展示付款来源核对记录；实际付款结果请查看上方渠道结算状态，不代表银行卡已到账。" />
    <dl class="funding-totals">
      <div><dt>余额实付（扣除已退）</dt><dd>{{ amount(preparation.wallet_remaining_amount) }}</dd></div>
      <div><dt>外部实付（扣除已退）</dt><dd>{{ amount(preparation.external_remaining_amount) }}</dd></div>
      <div><dt>余额中记录可追溯金额</dt><dd>{{ amount(preparation.traceable_wallet_amount) }}</dd></div>
      <div><dt>余额中来源待核实金额</dt><dd>{{ amount(preparation.untraced_wallet_amount) }}</dd></div>
    </dl>
    <p>以上为用户付款来源，不是向达人的划款金额。达人应收以本单结算分配为准，实际费用以渠道结算记录为准。</p>
    <ul v-if="preparation.source_issues.length" class="source-issues">
      <li v-for="issue in preparation.source_issues" :key="issue.code">{{ issue.message }}</li>
    </ul>
    <details class="source-details">
      <summary>充值来源明细（{{ preparation.sources.length }} 条{{ preparation.sources_truncated ? '，未完整展示' : '' }}）</summary>
      <el-table :data="preparation.sources" size="small" max-height="280" empty-text="暂无可追溯充值批次">
        <el-table-column label="充值来源" min-width="160"><template #default="{ row }">
          <span class="source-reference">{{ row.recharge_no || '待核实' }}</span>
          <span class="source-state">{{ row.record_complete ? '记录完整' : '待核对' }}</span>
        </template></el-table-column>
        <el-table-column label="本单扣款" width="90"><template #default="{ row }">{{ amount(row.debited_amount) }}</template></el-table-column>
        <el-table-column label="本单退回" width="90"><template #default="{ row }">{{ amount(row.restored_amount) }}</template></el-table-column>
      </el-table>
      <p>记录完整仅表示本地保存的充值及查询记录一致，不证明这笔资金目前仍在渠道账户内。</p>
    </details>
    <p v-if="preparation.external_payment">组合支付外部记录：{{ preparation.external_payment.payment_no || '待核实' }} · {{ preparation.external_payment.record_complete ? '记录完整' : '待核对' }}</p>
    <p v-for="issue in preparation.business_blockers.filter(item => item.code === 'refunded_order')" :key="issue.code" class="source-issues">{{ issue.message }}</p>
    <details v-if="preparation.pending_confirmations.length" class="channel-details">
      <summary>接通渠道前还需确认</summary>
      <ul><li v-for="item in preparation.pending_confirmations" :key="item">{{ item }}</li></ul>
    </details>
  </div>
</template>

<style scoped>
.wallet-preparation{margin-top:20px;padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--surface,#fff)}
h4{margin:0 0 12px;font-size:14px}
.funding-totals{margin:12px 0;border:0}
.funding-totals>div{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--line)}
dt{color:var(--muted);font-size:13px}dd{margin:0;font-weight:600;white-space:nowrap}
p,li,summary{font-size:12px;line-height:1.7}p{color:var(--muted)}ul{padding-left:20px}
.source-issues{color:var(--el-color-warning-dark-2,#946400)}summary{cursor:pointer;padding:8px 0;font-weight:600}
.channel-details{margin-top:8px}.source-details :deep(.el-table){margin-top:8px}
.source-reference{display:block;overflow-wrap:anywhere}.source-state{display:block;color:var(--muted);font-size:11px}
</style>
