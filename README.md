# Code Ninjas

A full-stack HRMS web application ("Dayflow HRMS") with a separated frontend and backend architecture.

## Project Structure

```
code-ninjas/
├── frontend/   # Static HTML + Tailwind (CDN) pages, wired to the API via ES modules
├── backend/    # Express API: authentication + employee management (SQLite)
├── package.json
└── README.md
```

## Tech Stack

- **Frontend:** React 18 + Vite + React Router + Tailwind CSS 3 (`frontend/src`) — legacy design mockups kept as static `.html` files in `frontend/`
- **Backend:** Node.js + Express 4, better-sqlite3, JWT auth (httpOnly cookie), bcryptjs
- **Database:** SQLite (`backend/data/dayflow.db`)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Likith-java/Code-Ninjas.git
   cd Code-Ninjas
   ```

2. Install dependencies for both frontend and backend:

   ```bash
   npm install --prefix frontend
   npm install --prefix backend
   ```

3. Seed demo data (employees + accounts):

   ```bash
   npm run seed --prefix backend
   ```

4. Optional — configure the backend via env vars:

   ```bash
   cp backend/.env.example backend/.env
   ```

### Running the Application

Start the backend and frontend in development mode (in separate terminals):

```bash
npm run dev --prefix backend    # API on http://localhost:4000
npm run dev --prefix frontend   # React app with HMR
```

- **React app (Vite, HMR):** http://localhost:5173 — proxies `/api` to the backend
- **App + API (production build):** `npm run build --prefix frontend`, then open http://localhost:4000

The backend serves the built React app from `frontend/dist` when it exists.

> Note: the API runs on port 4000 by default to avoid clashing with VS Code Live Preview (port 3000).

### Demo Accounts

| Role     | Login ID       | Email             | Password     |
| -------- | -------------- | ----------------- | ------------ |
| Admin    | ADUS20200001   | admin@dayflow.com | Admin@123    |
| HR       | SACO20230001   | hr@dayflow.com    | Hr@123456    |
| Employee | MIDO20220001   | employee@dayflow.com | Employee@123 |

The login form accepts either the email address or login ID.

HR/Admin can create, edit, and delete employees; Employee role is read-only.

### Database & Migrations

The backend uses SQLite (`backend/data/dayflow.db`) with the schema baseline defined in
`backend/src/db/schema.sql`. Incremental schema changes are plain JavaScript migrations in
`backend/src/db/migrations.js` that run automatically on every backend start (and before
seeding), tracked in a `schema_migrations` table:

- Fresh databases get the full baseline schema, then pending migrations are recorded.
- Existing databases are upgraded **in place** — migrations only add columns/indexes, never
  drop or reset data. Deleting the database file after a schema change is no longer necessary.
- To add a new migration, append an entry to the `MIGRATIONS` array in
  `backend/src/db/migrations.js`; keep each step idempotent so fresh and migrated databases
  converge on the same shape.

Current employee-domain model: employees (job fields incl. company/location/self-referencing
manager, identifiers employee_code/PAN/UAN), users (login/auth state), employee_profiles
(personal details, about, resume), plus normalized skills and certifications tables.

### API Overview

All protected endpoints use the httpOnly cookie set by login. Employee detail responses are
viewer-aware: employees viewing another employee receive a read-only public profile, while the
employee themselves and managers receive private fields and edit access where permitted.

| Method | Endpoint | Auth | Description |
| ------ | -------- | ---- | ----------- |
| POST | `/api/auth/login` | public | Sign in with email or login ID; sets session cookie |
| GET | `/api/auth/me` | required | Current user and password-change state |
| POST | `/api/auth/change-password` | required | Change the current password |
| POST | `/api/auth/logout` | public | Clear session cookie |
| GET | `/api/employees` | required | List employees (`?q=&department=&page=&limit=`) |
| GET | `/api/employees/meta` | required | List departments and directory metadata |
| GET | `/api/employees/:id` | required | Viewer-aware employee profile |
| POST | `/api/employees` | admin, hr | Create employee and provision account |
| PUT | `/api/employees/:id` | self, admin, hr | Update permitted employee fields |
| DELETE | `/api/employees/:id` | admin, hr | Delete employee |
| PUT | `/api/employees/:id/skills` | self, admin, hr | Replace skills |
| PUT | `/api/employees/:id/certifications` | self, admin, hr | Replace certifications |
| PUT | `/api/employees/:id/resume` | self, admin, hr | Update resume text or PDF |
| GET | `/api/employees/:id/resume.pdf` | self, admin, hr | Download resume PDF |
| GET | `/api/employees/:id/security` | admin, hr | View account security details |
| POST | `/api/employees/:id/reset-password` | admin, hr | Generate a one-time temporary password |
| PATCH | `/api/employees/:id/status` | admin, hr | Enable or disable an account |

### Tests

```bash
npm test --prefix backend
```

The suite covers auth, RBAC, provisioning, profile/resume flows, and the database foundation
(schema shape, unique constraints, manager hierarchy, and in-place migration upgrades).

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Author

- **Likith V Shetty** — [Likith-java](https://github.com/Likith-java)
