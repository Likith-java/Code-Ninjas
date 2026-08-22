# Frontend — Dayflow HRMS (React)

The interactive app is a **React 18 + Vite SPA** in `src/`, styled with **Tailwind CSS 3** using the Azure Horizon design tokens consolidated in `tailwind.config.js`.

## App Structure

```
frontend/
├── index.html              # React entry
├── vite.config.js          # dev server on :5173, proxies /api → :4000
├── tailwind.config.js      # design tokens (Azure Horizon M3 palette + typography)
├── src/
│   ├── main.jsx            # router + auth provider bootstrap
│   ├── App.jsx             # routes: /login, / (dashboard), /employees
│   ├── api/client.js       # fetch wrapper (httpOnly cookie sessions)
│   ├── auth/AuthContext.jsx# session state, login/logout, role helpers
│   ├── components/         # Layout (sidebar+topbar shell), Avatar
│   ├── pages/              # Login, Dashboard, Employees (search/filter/CRUD modal)
│   └── utils/employees.js  # department chip colors, initials helper
```

## Pages

1. **`/login`** — sign-in screen wired to `POST /api/auth/login`; demo accounts listed on the page. All other routes redirect here when signed out.
2. **`/`** — dashboard: workforce stats from the API, payroll summary card, top employees, project cards.
3. **`/employees`** — employee directory: live search, department filter chips, add/edit/delete via modal (HR/Admin only; Employee role is read-only).

## Running Locally

Recommended (backend serves the built app):

```bash
cd backend && npm run seed && npm run dev   # API on http://localhost:4000
cd ../frontend && npm install && npm run build
# open http://localhost:4000
```

Development with hot reload:

```bash
npm install && npm run dev                  # http://localhost:5173 (API must run on :4000)
```
