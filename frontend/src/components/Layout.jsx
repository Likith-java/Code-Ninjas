import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/', icon: 'dashboard', label: 'Dashboard' },
  { to: '/employees', icon: 'badge', label: 'Employee Directory' },
  { to: '/salary-calculator', icon: 'calculate', label: 'Salary Calculator' },
  { to: '/payroll-generator', icon: 'receipt_long', label: 'Payroll Generator' },
  { to: '/payroll-reports', icon: 'analytics', label: 'Payroll Reports' },
  { to: '/employees/me', icon: 'person', label: 'My Profile' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      {/* Top App Header */}
      <header className="z-30 flex h-16 items-center justify-between border-b border-outline-variant/20 bg-surface-bright/80 px-4 shadow-sm backdrop-blur-md md:px-margin-desktop">
        <div className="flex items-center gap-3">
          {/* Mobile 3-Lines Hamburger Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high md:hidden"
            title="Toggle Navigation Menu"
            aria-label="Toggle navigation menu"
          >
            <span className="material-symbols-outlined text-[24px]">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>

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

      {/* Main Workspace Body */}
      <div className="flex min-h-0 flex-1 relative">
        {/* Desktop Sidebar Navigation */}
        <nav className="hidden w-64 flex-col border-r border-outline-variant/30 bg-surface px-4 py-6 shadow-sm md:flex">
          <ul className="flex flex-col gap-1.5">
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

        {/* Mobile Slide-Out Drawer (when 3 lines menu is clicked) */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <div className="relative flex w-72 flex-col bg-surface p-6 shadow-2xl z-10 border-r border-outline-variant/30">
              <div className="flex items-center justify-between pb-4 border-b border-outline-variant/20 mb-4">
                <div className="flex items-center gap-2 font-bold text-primary">
                  <span className="material-symbols-outlined text-primary-container">layers</span>
                  <span>Dayflow HRMS</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-on-surface-variant p-1 rounded-lg hover:bg-surface-container-high"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <ul className="flex flex-col gap-1.5 flex-1">
                {NAV_ITEMS.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-secondary-container font-bold text-primary'
                            : 'text-on-surface-variant hover:bg-surface-container-high'
                        }`
                      }
                    >
                      <span className="material-symbols-outlined">{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>

              <button
                onClick={handleLogout}
                className="mt-auto flex items-center gap-3 rounded-lg px-4 py-3 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error text-sm font-semibold"
              >
                <span className="material-symbols-outlined">logout</span>
                <span>Log out</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Routed Content Area */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-background p-4 md:p-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="flex border-t border-outline-variant/20 bg-surface md:hidden">
        {NAV_ITEMS.slice(0, 4).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold tracking-wider ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span className="truncate max-w-[65px]">{item.label.split(' ')[0]}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold tracking-wider text-on-surface-variant hover:text-primary"
        >
          <span className="material-symbols-outlined text-[20px]">more_horiz</span>
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
