# Dayflow HRMS

A full-stack Human Resource Management System (HRMS) built with a modern React frontend and a secure Express API, backed by SQLite.

## Features

- **Employee directory** — searchable, paginated listing with derived account status
- **Role-based access control** — Admin, HR, and Employee roles with viewer-aware profile responses
- **Employee profiles** — personal details, about, job information, skills, and certifications
- **Resume support** — text or PDF upload and download
- **Account management** — provisioning, password resets, enable/disable accounts
- **Secure authentication** — JWT sessions via httpOnly cookies, bcrypt password hashing
- **Automatic schema migrations** — in-place, non-destructive upgrades on startup

## Tech Stack

| Layer    | Technologies                                                                 |
| -------- | ---------------------------------------------------------------------------- |
| Frontend | React 18, Vite, React Router 6, Tailwind CSS 3, Vitest                       |
| Backend  | Node.js, Express 4, better-sqlite3, JWT, bcryptjs                            |
| Database | SQLite (`backend/data/dayflow.db`)                                           |

> Legacy static HTML + Tailwind (CDN) design mockups are kept as `.html` files in `frontend/`.

## Project Structure

```
code-ninjas/
├── frontend/        # React app (src/) + legacy static mockups (.html)
├── backend/         # Express API: auth + employee management
│   ├── data/        # SQLite database
│   └── tests/       # Backend test suite
└── package.json
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Likith-java/Code-Ninjas.git
   cd Code-Ninjas
   ```

2. Install dependencies for both apps:

   ```bash
   npm install --prefix frontend
   npm install --prefix backend
   ```

3. Seed demo data (employees + accounts):

   ```bash
   npm run seed --prefix backend
   ```

4. *(Optional)* Configure the backend via environment variables:

   ```bash
   cp backend/.env.example backend/.env
   ```

### Running the Application

Start the backend and frontend in development mode (separate terminals):

```bash
npm run dev --prefix backend     # API      → http://localhost:4000
npm run dev --prefix frontend    # React app → http://localhost:5173
```

The Vite dev server proxies `/api` requests to the backend. For a production build, run `npm run build --prefix frontend` — the backend then serves the built app from `frontend/dist` at http://localhost:4000.

> The API defaults to port **4000** to avoid clashing with VS Code Live Preview (port 3000).

### Demo Accounts

The login form accepts either the email address or login ID.

| Role     | Login ID       | Email                | Password       |
| -------- | -------------- | -------------------- | -------------- |
| Admin    | ADUS20200001   | admin@dayflow.com    | Admin@123      |
| HR       | SACO20230001   | hr@dayflow.com       | Hr@123456      |
| Employee | MIDO20220001   | employee@dayflow.com | Employee@123   |

HR/Admin can create, edit, and delete employees; the Employee role is read-only.

### NPM Scripts

| Command                          | Description                        |
| -------------------------------- | ---------------------------------- |
| `npm run dev --prefix backend`   | Start API with watch mode          |
| `npm test --prefix backend`      | Run backend test suite             |
| `npm run seed --prefix backend`  | Seed demo employees and accounts   |
| `npm run dev --prefix frontend`  | Start React app with HMR           |
| `npm run build --prefix frontend`| Production build to `frontend/dist`|
| `npm test --prefix frontend`     | Run frontend test suite            |

## Architecture Notes

### Database & Migrations

The backend uses SQLite with a schema baseline defined in `backend/src/db/schema.sql`.
Incremental changes are plain JavaScript migrations in `backend/src/db/migrations.js`,
executed automatically on every backend start (and before seeding) and tracked in a
`schema_migrations` table:

- Fresh databases receive the full baseline schema; pending migrations are recorded.
- Existing databases are upgraded **in place** — migrations only add columns/indexes,
  never drop or reset data.
- To add a migration, append an entry to the `MIGRATIONS` array in
  `backend/src/db/migrations.js`. Keep each step idempotent so fresh and migrated
  databases converge on the same shape.

Current employee-domain model: `employees` (job fields incl. company/location/self-referencing manager, identifiers employee_code/PAN/UAN), `users` (login/auth state), `employee_profiles` (personal details, about, resume), plus normalized `skills` and `certifications` tables.

### Derived Employee Status

Directory status (`GET /api/employees`, `GET /api/employees/:id`) is a **derived value**
computed by a swappable status provider (`backend/src/services/directory/status.service.js`)
— never a manually maintained duplicate flag:

| Status      | Meaning                                    |
| ----------- | ------------------------------------------ |
| `disabled`  | Linked user account is disabled            |
| `on_leave`  | Legacy manual employment flag (temporary)  |
| `active`    | Default state                              |

The canonical future source will be the attendance/time-off domain. When implemented,
satisfy the same `EmployeeStatusProvider` contract against its tables and swap the
provider at the single wiring point in `getEmployeeStatusProvider()` — routes, services,
and filters require no further changes. See the INTEGRATION POINT notes in that file.

## API Reference

All protected endpoints authenticate via the httpOnly cookie set at login. Employee detail
responses are **viewer-aware**: employees viewing another employee receive a read-only public
profile, while the employee themselves and managers receive private fields and edit access
where permitted.

### Authentication

| Method | Endpoint                  | Auth    | Description                                            |
| ------ | ------------------------- | ------- | ------------------------------------------------------ |
| POST   | `/api/auth/login`         | Public  | Sign in with email or login ID; sets session cookie    |
| GET    | `/api/auth/me`            | Required| Current user and password-change state                 |
| POST   | `/api/auth/change-password` | Required | Change the current password                         |
| POST   | `/api/auth/logout`        | Public  | Clear session cookie                                   |

### Employees

| Method | Endpoint                                        | Auth              | Description |
| ------ | ----------------------------------------------- | ----------------- | ----------- |
| GET    | `/api/employees`                                | Required          | List employees (`?q=&department=&status=&page=&limit=`); returns directory cards only (id, name, photo, position, department, derived status) |
| GET    | `/api/employees/meta`                           | Required          | List departments and directory metadata |
| GET    | `/api/employees/:id`                            | Required          | Viewer-aware employee profile |
| POST   | `/api/employees`                                | Admin, HR         | Create employee and provision account |
| PUT    | `/api/employees/:id`                            | Self, Admin, HR   | Update permitted employee fields |
| DELETE | `/api/employees/:id`                            | Admin, HR         | Delete employee |
| PATCH  | `/api/employees/:id/status`                     | Admin, HR         | Enable or disable an account |

### Profiles, Skills & Certifications

| Method | Endpoint                                        | Auth              | Description |
| ------ | ----------------------------------------------- | ----------------- | ----------- |
| GET    | `/api/employees/:id/profile`                    | Required          | Profile API — DTO narrows by caller (own / other-employee read-only / admin with security block) |
| PUT    | `/api/employees/:id/profile`                    | Self, Admin, HR   | Update Private Info tab + About (personal fields for self; job details, work email, bank details, identifiers for admin) |
| POST   | `/api/employees/:id/skills`                     | Self, Admin, HR   | Add one skill (deduped, max 50) |
| DELETE | `/api/employees/:id/skills/:skillId`            | Self, Admin, HR   | Remove one skill |
| PUT    | `/api/employees/:id/skills`                     | Self, Admin, HR   | Replace skills |
| POST   | `/api/employees/:id/certifications`             | Self, Admin, HR   | Add one certification (max 50) |
| DELETE | `/api/employees/:id/certifications/:certId`     | Self, Admin, HR   | Remove one certification |
| PUT    | `/api/employees/:id/certifications`             | Self, Admin, HR   | Replace certifications |

### Resume & Account Security

| Method | Endpoint                                        | Auth              | Description |
| ------ | ----------------------------------------------- | ----------------- | ----------- |
| PUT    | `/api/employees/:id/resume`                     | Self, Admin, HR   | Update resume text or PDF |
| GET    | `/api/employees/:id/resume.pdf`                 | Self, Admin, HR   | Download resume PDF |
| GET    | `/api/employees/:id/security`                   | Admin, HR         | View account security details |
| POST   | `/api/employees/:id/reset-password`             | Admin, HR         | Generate a one-time temporary password |

## Testing

```bash
npm test --prefix backend
```

The suite covers auth, RBAC, provisioning, profile/resume flows, the employee directory
(search scoped to non-sensitive fields, pagination, derived status, field-exposure
guarantees), and the database foundation (schema shape, unique constraints, manager
hierarchy, and in-place migration upgrades).

```bash
npm test --prefix frontend
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Author

**Likith V Shetty** — [Likith-java](https://github.com/Likith-java)
