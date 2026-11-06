import type { RemoteTask } from './taskRepository'

export type BoardFilters = {
  query: string
  priority: string
  assignee: string
  label: string
}

export function matchesFilters(task: RemoteTask, filters: BoardFilters): boolean {
  const query = filters.query.trim().toLocaleLowerCase()
  return (!query || task.title.toLocaleLowerCase().includes(query)) &&
    (!filters.priority || task.priority === filters.priority) &&
    (!filters.assignee || (filters.assignee === 'unassigned' ? !task.assignee : task.assignee === filters.assignee.slice('assigned:'.length))) &&
    (!filters.label || task.labels.includes(filters.label))
}

export function dueIndicator(dueDate: string | null, status: string, now = new Date()): 'overdue' | 'today' | 'soon' | 'later' | null {
  if (!dueDate || status === 'done') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate)
  if (!match) return null
  const due = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((due - today) / 86_400_000)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 3) return 'soon'
  return 'later'
}

export function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}
