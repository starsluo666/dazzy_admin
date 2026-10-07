import { useRoute } from 'vue-router'

export function useWorkRoute() {
  const route = useRoute()
  const text = (key: string) => typeof route.query[key] === 'string' ? route.query[key] as string : ''
  return { initialSearch: text('search'), recordType: text('record_type'),
    query: () => text('todo') ? { todo: text('todo'), work_id: text('work_id') } : {} }
}
