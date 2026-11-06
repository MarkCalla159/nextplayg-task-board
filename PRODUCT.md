# Product

## Platform

web

## Users

People managing everyday tasks, including gamers.

## Product Purpose

Help users organize tasks and track their progress through a task board.

## Operating Context

The current board organizes tasks into To Do, In Progress, In Review, and Done.

## Capabilities and Constraints

- The current interface supports adding and deleting tasks and changing their status by dragging or using a status selector.
- Data storage, collaboration, and accessibility are important considerations. Their specific requirements remain to be defined.
- Tasks are stored in Supabase under a browser's anonymous guest session. A local backup from the earlier version is retained after import. Guest sessions are not recoverable across devices or after browser data is cleared; collaboration is not implemented.
- Each user's tasks are private: other users must not be able to read, create, modify, or delete them. Enforce this in the database using the authenticated user's identity.
- Users can organize tasks with private custom labels, priority, and due dates, and filter by title, priority, label, or assignee. Assignee names are personal notes and do not grant access to other users.

## Brand Commitments

The current interface uses the name NEXTPLAYG WORKSPACE.
Use Poppins and Playfair Display for typography.

## Product Principles

- Make organizing and tracking tasks approachable for everyday users, including gamers.
- Keep task progress understandable across the board's workflow.
- Account for data storage, collaboration, and accessibility as their requirements are established.
