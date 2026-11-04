# Complaints MIS — Demo Guide

This document is designed to guide professors and evaluators through a complete demonstration of the **Complaints Management Information System (MIS)** graduation project.

## 1. AI Setup Note (Optional but Recommended)

To evaluate the Phase 4 AI Assistant (Knowledge Base RAG pipeline), you must configure the OpenAI API key before starting the environment.
1. Copy `.env.example` to `.env`
2. Set `AI_ENABLED=true`
3. Set `OPENAI_API_KEY=your_key_here`
4. Run `docker compose -p complaints_mis up -d --build`

If the AI features are disabled, the system will gracefully hide or disable the AI chat and suggestion buttons, but all core MIS features will still function 100%.

## 2. Roles Explanation

The system implements strict Role-Based Access Control (RBAC) with 4 primary roles:

| Role | Email | Password | Responsibilities |
|------|-------|----------|------------------|
| **Admin** | `admin@demo.com` | `DemoPass123!` | System configuration, user management, Knowledge Base document indexing, and full visibility of all complaints. |
| **Manager** | `it.manager@demo.com` | `DemoPass123!` | Oversees a specific department (e.g., IT). Can re-assign complaints, change SLA priorities, and view department-level reports. |
| **Agent** | `it.agent@demo.com` | `DemoPass123!` | Handles complaints assigned to them. Can add internal notes, respond to users, and resolve tickets. |
| **Requester** | `requester@demo.com` | `DemoPass123!` | Submits complaints, views own complaint history, and provides CSAT (Customer Satisfaction) feedback upon resolution. |

## 3. Dashboard Scope Explanation

The Dashboard automatically filters data to match the user's role and authorization level. This is a core feature of the MIS:

- **Admin Dashboard:** Shows system-wide aggregates (`scope="all"`).
- **Manager Dashboard:** Shows only complaints belonging to their assigned department (`scope="department"`).
- **Agent Dashboard:** Shows only complaints assigned directly to them (`scope="assigned"`).
- **Requester Dashboard:** Shows only complaints they have submitted (`scope="my"`).

> **Note on Empty States:** If a specific user has no complaints matching their scope in the selected time period (e.g., "Last 30 Days"), the dashboard will display a clear English message indicating that no data is available for their specific role. You can change the filter to **"All Time"** to see historical data.

## 4. Professor Demo Flow

We recommend following this exact flow during your evaluation to see the full lifecycle of the system:

### Step A: The Requester Experience
1. **Login** as `requester@demo.com`.
2. Navigate to **New Complaint** (`/app/complaints/new`).
3. Fill in the subject and description (e.g., "Need a new laptop charger").
4. *(If AI enabled)*: Click **"Suggest Classification and Priority"** to let the AI auto-select the IT department, Hardware category, and priority.
5. Submit the complaint. Notice the system redirects you to your complaint list.
6. **Logout**.

### Step B: The Agent Experience
1. **Login** as `it.agent@demo.com`.
2. Notice the **Dashboard** only shows complaints assigned to you.
3. Go to **Complaints** and find the newly created complaint (it will be unassigned by default, or assigned by a manager).
4. Open the complaint. Change the status to `IN_PROGRESS`.
5. Add an **Internal Note** (visible only to staff) and a public comment for the requester.
6. Change the status to `RESOLVED`.
7. **Logout**.

### Step C: The CSAT Loop (Requester)
1. **Login** as `requester@demo.com`.
2. Open the resolved complaint.
3. Submit a CSAT Rating (1-5 stars) and close the complaint.
4. **Logout**.

### Step D: The Manager/Admin Experience
1. **Login** as `admin@demo.com`.
2. View the **Dashboard**. Select **"All Time"** to see the full 31 demo complaints and their SLA compliance metrics.
3. Navigate to **Reports** to see system-wide performance.
4. Try to create a new complaint. Notice the system correctly forbids you (returning an error message), as Admins are not Requesters.

## 5. Known Limitations

- **File Uploads:** Attachments are stored locally in Docker volumes (`/data/uploads`). In a production environment, this should be migrated to AWS S3 or a similar object storage service.
- **Email Notifications:** Email dispatching (SMTP) is not yet implemented. All updates must be checked manually via the dashboard.
- **Language:** The UI is English and left-to-right. Backend API error messages are also returned in English for the translated flows.
