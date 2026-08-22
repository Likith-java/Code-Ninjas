# Frontend - Human Resource Management System (HRMS)

This directory contains the responsive UI screens and dashboard views for the Human Resource Management System:

## Available Pages

1. **`index.html`** / **`azure-horizon-desktop.html`**
   - Main Azure Horizon Desktop Dashboard (Light Mode)
   - Features quick access bar, sidebar navigation, top app bar with search, welcome banner, payroll summary card, ongoing projects bento grid, and top employees list.

2. **`azure-horizon-dark.html`**
   - Azure Horizon Desktop Dashboard (Dark Mode)
   - Features dark palette tokens, JetBrains Mono accents, and full bento layout.

3. **`azure-horizon-dashboard.html`**
   - Unified Azure Horizon dashboard with responsive container queries.

4. **`insightlancer.html`**
   - Insightlancer HR Dashboard
   - Features mobile top bar, desktop drawer, ongoing projects cards with custom progress indicators, and mobile floating action button (FAB) + bottom navigation.

5. **`design-system.html`**
   - HR Management System Dashboard (Design System view)
   - Includes employee profile stats card (Richard A. Bachmann: 75k followers, 16k followings, 600 projects), folder document manager, project cards, and team directory list.

6. **`hrms-overview.html`**
   - Mobile-first HRMS Overview screen
   - Features sticky navigation, schedule card, dark & light theme project cards, employee directory preview, and mobile bottom navigation with central action button.

7. **`employee-directory.html`**
   - Dedicated Employee Directory screen
   - Includes search bar, filter action, categorized employee cards with department tags (Design, Product, Engineering, HR, Marketing), and FAB.

8. **`payroll-management.html`**
   - Dedicated Payroll Management screen
   - Includes total payroll overview ($124,500), pending payments ($12,300), completed payouts (42 employees), and detailed payment transaction records.

9. **`join-room.html`**
   - Join Room & Invitation Screen
   - HR meeting guest room access with invitation details and guest entry form.

## Running Locally

To serve the frontend:

```bash
cd frontend
npx -y serve .
# or
npm install && npm run dev
```
