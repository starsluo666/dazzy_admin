import type { ReceivingWithdrawalForm } from '../types'

export const feeFields = ['fix_amt', 'fee_rate', 'weekday_fix_amt', 'weekday_fee_rate'] as const
export const feeLabels: Record<typeof feeFields[number], string> = {
  fix_amt: '每笔固定费用', fee_rate: '按金额收取费率',
  weekday_fix_amt: '工作日每笔固定费用', weekday_fee_rate: '工作日费率',
}
export const accountLabels: Record<string, string> = { '01': '基本户', '02': '现金户', '05': '充值户' }

export function emptyReceivingForm(): ReceivingWithdrawalForm {
  return { cash_type: '', out_fee_acct_type: '', fix_amt: null, fee_rate: null, weekday_fix_amt: null, weekday_fee_rate: null }
}

// Keep empty and zero distinct. Never round an unconfirmed fee silently.
export function normalizeReceivingForm(form: ReceivingWithdrawalForm): ReceivingWithdrawalForm {
  const result = { ...form }
  for (const key of feeFields) {
    const raw = form[key]?.trim() ?? ''
    result[key] = raw === '' ? null : raw
  }
  return result
}

export function receivingFormError(form: ReceivingWithdrawalForm): string {
  const values = normalizeReceivingForm(form)
  if (!['T1', 'D1'].includes(values.cash_type)) return '请选择与汇付确认的到账周期'
  if (!accountLabels[values.out_fee_acct_type]) return '请选择平台承担手续费的账户类型'
  if (values.fix_amt === null && values.fee_rate === null) return '固定费用与费率至少填写一项；免手续费请明确填写 0'
  for (const key of feeFields) {
    const value = values[key]
    if (value === null) continue
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return `${feeLabels[key]}须为非负金额，最多两位小数`
    if (Number(value) > (key.includes('rate') ? 100 : 999.99)) return `${feeLabels[key]}超出允许范围`
    if (key.startsWith('weekday') && values.cash_type !== 'D1') return 'T1 不支持单独设置工作日费用，请清空后保存'
  }
  return ''
}

export function receivingSummary(form: ReceivingWithdrawalForm): Array<{ label: string; value: string }> {
  const values = normalizeReceivingForm(form)
  return [
    { label: '到账周期', value: values.cash_type === 'D1' ? 'D1 · 下一自然日' : values.cash_type === 'T1' ? 'T1 · 下一工作日' : '未配置' },
    { label: '手续费承担方', value: '平台（外扣，不扣达人提现本金）' },
    { label: '平台扣费账户', value: accountLabels[values.out_fee_acct_type] || '未配置' },
    ...feeFields.filter((key) => values.cash_type === 'D1' || !key.startsWith('weekday')).map((key) => ({
      label: (values.cash_type === 'D1' && !key.startsWith('weekday') ? '节假日 · ' : '') + feeLabels[key],
      value: values[key] === null ? (key.startsWith('weekday') ? '未填写，按渠道节假日配置计算' : '未填写') : `${Number(values[key]).toFixed(2)}${key.includes('rate') ? '%' : ' 元 / 笔'}`,
    })),
  ]
}
