import { inject, ref, type InjectionKey } from 'vue'
import { adminApi } from '../services/api'
import type { WorkSummary } from '../utils/operationsWork'

export function createOperationsWork() {
  const summary = ref<WorkSummary | null>(null)
  const error = ref('')
  let pending: Promise<void> | undefined
  let generation = 0
  function refresh() {
    if (pending) return pending
    const ownGeneration = generation
    pending = (async () => {
      try {
        const data = await adminApi.workSummary()
        if (generation !== ownGeneration) return
        summary.value = data
        error.value = ''
      } catch {
        if (generation === ownGeneration) error.value = '待办刷新失败，显示上次结果'
      } finally { if (generation === ownGeneration) pending = undefined }
    })()
    return pending
  }
  function clear() { generation++; pending = undefined; summary.value = null; error.value = '' }
  return { summary, error, refresh, clear }
}
export const operationsWorkKey: InjectionKey<ReturnType<typeof createOperationsWork>> = Symbol('operations-work')
export function useOperationsWork() {
  const store = inject(operationsWorkKey)
  if (!store) throw new Error('Operations work provider missing')
  return store
}
