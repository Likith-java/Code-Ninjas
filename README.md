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
   npm run install:all
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

Start both the frontend and backend in development mode:

```bash
npm run dev
```

- **React app (Vite, HMR):** http://localhost:5173 — proxies `/api` to the backend
- **App + API (production build):** `npm run build --prefix frontend`, then open http://localhost:4000

The backend serves the built React app from `frontend/dist` when it exists.

> Note: the API runs on port 4000 by default to avoid clashing with VS Code Live Preview (port 3000).

### Demo Accounts

| Role     | Email                | Password      |
| -------- | -------------------- | ------------- |
| Admin    | admin@dayflow.com    | Admin@123     |
| HR       | hr@dayflow.com       | Hr@123456     |
| Employee | employee@dayflow.com | Employee@123  |

HR/Admin can create, edit, and delete employees; Employee role is read-only.

### API Overview

| Method | Endpoint              | Auth        | Description                          |
| ------ | --------------------- | ----------- | ------------------------------------ |
| POST   | /api/auth/login       | public      | Sign in, sets httpOnly session cookie |
| GET    | /api/auth/me          | required    | Current user                         |
| POST   | /api/auth/logout      | public      | Clears session cookie                |
| GET    | /api/employees        | required    | List (`?q=&department=&page=&limit=`)|
| GET    | /api/employees/:id    | required    | Single employee                      |
| POST   | /api/employees        | admin, hr   | Create employee                      |
| PUT    | /api/employees/:id    | admin, hr   | Update employee                      |
| DELETE | /api/employees/:id    | admin, hr   | Delete employee                      |

### Tests

```bash
npm test --prefix backend
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Author

- **Likith V Shetty** — [Likith-java](https://github.com/Likith-java)
