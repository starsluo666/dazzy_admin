const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: 'numeric',
  day: 'numeric',
})

const TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const MONEY_FORMATTER = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function asDate(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatMoney(cents: number | null | undefined) {
  const value = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0
  return MONEY_FORMATTER.format(value / 100)
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  fallback = '—',
) {
  if (value === null || value === undefined || value === '') return fallback
  const date = asDate(value)
  return date ? DATE_TIME_FORMATTER.format(date).replaceAll('/', '-') : fallback
}

export function formatLongDate(value: string | number | Date) {
  const date = asDate(value)
  return date ? LONG_DATE_FORMATTER.format(date) : '—'
}

export function formatServiceWindow(
  startsAt: string | number | Date,
  endsAt: string | number | Date,
) {
  const start = asDate(startsAt)
  const end = asDate(endsAt)
  if (!start || !end) return '—'
  const startDay = MONTH_DAY_FORMATTER.format(start)
  const endDay = MONTH_DAY_FORMATTER.format(end)
  const startTime = TIME_FORMATTER.format(start)
  const endTime = TIME_FORMATTER.format(end)
  return startDay === endDay
    ? `${startDay} ${startTime}–${endTime}`
    : `${startDay} ${startTime}–${endDay} ${endTime}`
}
