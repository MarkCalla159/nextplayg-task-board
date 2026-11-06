export type Status =
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done';

export type Priority = 'low' | 'normal' | 'high';

export type Task = {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  created_at: string;
  user_id: string;
};