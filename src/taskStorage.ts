export type Status = 'todo' | 'in_progress' | 'in_review' | 'done'

export type Task = {
  id: string
  title: string
  status: Status
}

export const STORAGE_KEY = 'nextplayg.tasks.v1'

export const initialTasks: Task[] = [
  { id: 'sample-1', title: 'Design onboarding flow', status: 'todo' },
  { id: 'sample-2', title: 'Review analytics events', status: 'in_progress' },
  { id: 'sample-3', title: 'Prepare launch notes', status: 'in_review' },
  { id: 'sample-4', title: 'Set up design tokens', status: 'done' },
]

type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>
type GetStorage = () => StorageAccess

const getBrowserStorage: GetStorage = () => window.localStorage

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false
  const task = value as Record<string, unknown>
  return typeof task.id === 'string' && task.id.length > 0 &&
    typeof task.title === 'string' && task.title.trim().length > 0 &&
    typeof task.status === 'string' &&
    ['todo', 'in_progress', 'in_review', 'done'].includes(task.status)
}

export function loadTasks(getStorage: GetStorage = getBrowserStorage) {
  try {
    const saved = getStorage().getItem(STORAGE_KEY)
    if (saved === null) return { tasks: initialTasks, canSave: true, error: '' }
    const parsed: unknown = JSON.parse(saved)
    if (!Array.isArray(parsed) || !parsed.every(isTask) ||
      new Set(parsed.map((task) => task.id)).size !== parsed.length) {
      throw new Error('Invalid saved tasks')
    }
    return { tasks: parsed as Task[], canSave: true, error: '' }
  } catch {
    return {
      tasks: initialTasks,
      canSave: false,
      error: 'Saved tasks could not be read. Changes will only last for this session; your existing saved data has not been overwritten.',
    }
  }
}

export function saveTasks(tasks: Task[], getStorage: GetStorage = getBrowserStorage) {
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(tasks))
    return true
  } catch {
    return false
  }
}
