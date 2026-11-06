# NextPlayG Task Board

A responsive task manager built with React, TypeScript, Vite, and Supabase. Tasks are private to each anonymous guest session and are organized into To Do, In Progress, In Review, and Done columns.

## Features

- Create, edit, move, and delete tasks, with an undo action for the most recent deletion.
- Move tasks using drag and drop or the status selector.
- Create custom labels and assign multiple labels to a task.
- Set priority, a due date, and an optional assignee name. Overdue and upcoming tasks are highlighted.
- Search by title and combine filters for priority, assignee, and label.
- Keep tasks private with Supabase row-level security. Assignee names are personal notes and do not grant other users access.

The app reuses an anonymous session in the same browser. Anonymous sessions are not recoverable on another device or after clearing browser data. Real-time collaboration is not implemented.

## Run locally

1. Install Node.js 24 and npm. The project was tested with Node.js 24.13.1.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a Supabase project and enable **anonymous sign-ins** in its authentication settings.
4. Run [`supabase.sql`](supabase.sql) in the project's SQL Editor. If you already have the earlier task table, run [`supabase-features-migration.sql`](supabase-features-migration.sql) to add labels and assignee fields.
5. Copy `.env.example` to `.env` and add your project's URL and publishable key. Never use a service-role key in the frontend or commit `.env`.
6. Start the development server:

   ```bash
   npm run dev
   ```

   Open the local URL printed by Vite. Restart the server after changing `.env`.

## Checks

```bash
npm run build
npm run lint
node --test tests/board-filters.test.mjs tests/task-repository.test.mjs tests/task-storage.test.mjs
```

## Data and privacy

The schema and row-level security policies are documented in [`supabase.sql`](supabase.sql). Each task and label belongs to a Supabase user ID; policies allow a guest to access only their own rows. The application imports tasks from the earlier local-only version once and leaves the original browser backup in place.
