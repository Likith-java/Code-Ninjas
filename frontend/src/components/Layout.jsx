import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/', icon: 'dashboard', label: 'Dashboard' },
  { to: '/attendance', icon: 'fact_check', label: 'Attendance' },
  { to: '/employees', icon: 'badge', label: 'Employee Directory' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const displayName =
    user?.email
      ?.split('@')[0]
      .split(/[._-]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') ?? '';
  const roleLabel =
    user?.role === 'admin' ? 'Administrator' : user?.role === 'hr' ? 'HR Manager' : 'Employee';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="z-30 flex h-16 items-center justify-between border-b border-outline-variant/20 bg-surface-bright/80 px-4 shadow-sm backdrop-blur-md md:px-margin-desktop">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
            <span className="material-symbols-outlined text-[20px]">layers</span>
          </div>
          <span className="font-headline-md hidden font-bold text-primary sm:block">Dayflow HRMS</span>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative text-on-surface-variant transition-colors hover:text-primary">
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute -top-0.5 right-0 h-2 w-2 rounded-full border border-surface-bright bg-error"></span>
          </button>
          <div className="hidden text-right sm:block">
            <p className="font-label-md text-label-md font-bold text-primary">{displayName}</p>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{roleLabel}</p>
          </div>
          <div className="h-8 w-px bg-outline-variant/40"></div>
          <button
            onClick={handleLogout}
            title={`Log out ${user?.email ?? ''}`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-64 flex-col border-r border-outline-variant/30 bg-surface px-4 py-6 shadow-sm md:flex">
          <ul className="flex flex-col gap-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-4 py-3 transition-all ${
                      isActive
                        ? 'scale-[0.98] bg-secondary-container font-bold text-primary'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`
                  }
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span className="font-label-md text-label-md">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
          <button
            onClick={handleLogout}
            className="mt-auto flex items-center gap-3 rounded-lg px-4 py-3 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="font-label-md text-label-md">Log out</span>
          </button>
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto bg-background p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      <nav className="flex border-t border-outline-variant/20 bg-surface md:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wider ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`
            }
          >
            <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
            {item.label.split(' ')[0]}
          </NavLink>
        ))}
        <button
          onClick={handleLogout}
          className="flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-[22px]">logout</span>
          Logout
        </button>
      </nav>
    </div>
  );
}
