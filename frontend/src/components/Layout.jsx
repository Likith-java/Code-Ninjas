import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const NAV_SECTIONS = [
  {
    title: 'Workspace',
    items: [
      { to: '/', icon: 'dashboard', label: 'Dashboard' },
      { to: '/attendance', icon: 'fact_check', label: 'Attendance' },
      { to: '/time-off', icon: 'event_available', label: 'Time Off' },
      { to: '/employees', icon: 'badge', label: 'Employee Directory' },
    ],
  },
  {
    title: 'Finance & Payroll',
    items: [
      { to: '/salary-calculator', icon: 'calculate', label: 'Salary Calculator' },
      { to: '/payroll-generator', icon: 'receipt_long', label: 'Payroll Generator' },
      { to: '/payroll-reports', icon: 'analytics', label: 'Payroll Reports' },
    ],
  },
  {
    title: 'Personal',
    items: [
      { to: '/employees/me', icon: 'person', label: 'My Profile' },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isItemActive = (itemTo) => {
    if (itemTo === '/') return location.pathname === '/';
    if (itemTo === '/employees/me') {
      return (
        location.pathname === '/employees/me' ||
        (Boolean(user?.employee_id) && location.pathname === `/employees/${user.employee_id}`)
      );
    }
    if (itemTo === '/employees') {
      return location.pathname === '/employees';
    }
    return location.pathname === itemTo || location.pathname.startsWith(`${itemTo}/`);
  };

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
  const roleBadgeColor =
    user?.role === 'admin'
      ? 'bg-primary-container text-white'
      : user?.role === 'hr'
      ? 'bg-primary text-white'
      : 'bg-secondary text-white';

  const userInitial = displayName ? displayName.charAt(0).toUpperCase() : 'U';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-on-surface">
      {/* Top App Header with Frosted Glassmorphism */}
      <header className="z-30 flex h-16 shrink-0 items-center justify-between border-b border-outline-variant/30 bg-white/90 pl-2.5 pr-4 shadow-xs backdrop-blur-md sm:pl-3 sm:pr-6 md:pl-3.5 md:pr-8">
        <div className="flex items-center gap-3">
          {/* 3-Bars Hamburger Toggle Button - Anchored at the corner */}
          <button
            onClick={() => {
              setSidebarOpen((prev) => !prev);
              setMobileMenuOpen((prev) => !prev);
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-outline-variant/40 bg-white text-primary shadow-xs transition-all hover:border-primary hover:bg-primary hover:text-white active:scale-95 cursor-pointer"
            title="Toggle Sidebar Navigation"
            aria-label="Toggle navigation menu"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-primary-container text-white shadow-sm ring-2 ring-primary/10">
              <span className="material-symbols-outlined text-[22px]">corporate_fare</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-headline-md text-[18px] font-bold tracking-tight text-primary">Dayflow</span>
              <span className="rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                HRMS
              </span>
            </div>
          </div>
        </div>

        {/* Header Right Tools & Profile Pill */}
        <div className="flex items-center gap-3 sm:gap-5">

          {/* User Profile Pill - Clickable link to profile */}
          <Link
            to="/employees/me"
            title="View My Profile"
            className="flex items-center gap-3 rounded-full border border-outline-variant/25 bg-surface/80 py-1 pl-1.5 pr-3 shadow-2xs transition-all hover:bg-white hover:border-outline-variant/50 cursor-pointer"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-container font-bold text-xs text-white shadow-xs">
              {userInitial}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-bold leading-tight text-primary">{displayName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${roleBadgeColor}`}>
                  {roleLabel}
                </span>
              </div>
            </div>
          </Link>

          {/* Logout Icon Button */}
          <button
            onClick={handleLogout}
            title={`Log out ${user?.email ?? ''}`}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-on-surface-variant transition-all hover:bg-red-50 hover:text-error"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex min-h-0 flex-1 relative">
        {/* Desktop Sidebar Navigation with Matching Deep Blue Background */}
        {sidebarOpen && (
          <nav className="hidden w-64 shrink-0 flex-col justify-between bg-[#002556] border-r border-[#0d3b7a]/40 px-3 py-5 text-white shadow-xl transition-all duration-300 md:flex">
            <div className="flex flex-col gap-6 overflow-y-auto pr-1 no-scrollbar">
              {NAV_SECTIONS.map((section) => (
                <div key={section.title} className="flex flex-col gap-1.5">
                  <p className="px-3 text-[11px] font-bold uppercase tracking-widest text-white/60">
                    {section.title}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {section.items.map((item) => {
                      const active = isItemActive(item.to);
                      return (
                        <li key={item.to}>
                          <Link
                            to={item.to}
                            className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-150 ${
                              active
                                ? 'bg-white text-primary font-bold shadow-md'
                                : 'text-white/80 hover:bg-white/10 hover:text-white hover:translate-x-0.5'
                            }`}
                          >
                            <span
                              className={`material-symbols-outlined text-[20px] transition-transform group-hover:scale-105 ${
                                active ? 'text-primary' : 'text-white/80 group-hover:text-white'
                              }`}
                            >
                              {item.icon}
                            </span>
                            <span className="flex-1 truncate">{item.label}</span>
                            {active && (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary opacity-80"></span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            {/* Sidebar Footer Card */}
            <div className="mt-4 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="truncate">
                  <p className="truncate text-xs font-bold text-white">{user?.email}</p>
                  <p className="text-[10px] text-white/70 capitalize">{user?.role} account</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Log out"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/20 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">power_settings_new</span>
                </button>
              </div>
            </div>
          </nav>
        )}

        {/* Mobile Slide-Out Drawer with Matching Deep Blue Background */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-primary/50 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <div className="relative flex w-72 flex-col bg-[#002556] text-white p-5 shadow-2xl z-10 border-r border-[#0d3b7a]/40">
              <div className="flex items-center justify-between pb-4 border-b border-white/15 mb-4">
                <div className="flex items-center gap-2.5 font-bold text-white">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
                    <span className="material-symbols-outlined text-[18px]">corporate_fare</span>
                  </div>
                  <span className="font-bold text-lg">Dayflow HRMS</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-white/80 p-1 rounded-lg hover:bg-white/10"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="flex flex-col gap-5 overflow-y-auto flex-1 no-scrollbar">
                {NAV_SECTIONS.map((section) => (
                  <div key={section.title} className="flex flex-col gap-1">
                    <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-white/60">
                      {section.title}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {section.items.map((item) => {
                        const active = isItemActive(item.to);
                        return (
                          <li key={item.to}>
                            <Link
                              to={item.to}
                              onClick={() => setMobileMenuOpen(false)}
                              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all ${
                                active
                                  ? 'bg-white text-primary font-bold shadow-sm'
                                  : 'text-white/80 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              <span
                                className={`material-symbols-outlined text-[20px] ${
                                  active ? 'text-primary' : 'text-white/80'
                                }`}
                              >
                                {item.icon}
                              </span>
                              <span>{item.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              <button
                onClick={handleLogout}
                className="mt-4 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-white bg-red-500/20 hover:bg-red-500/30 transition-colors text-sm font-bold border border-red-400/30"
              >
                <span className="material-symbols-outlined text-[20px]">logout</span>
                <span>Log out</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Routed Content Area */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-background p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="flex border-t border-outline-variant/30 bg-white/95 backdrop-blur-md md:hidden">
        {NAV_SECTIONS[0].items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-bold tracking-tight transition-colors ${
                isActive ? 'text-primary' : 'text-on-surface-variant/70 hover:text-primary'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span className="truncate max-w-[65px]">{item.label.split(' ')[0]}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-bold tracking-tight text-on-surface-variant/70 hover:text-primary"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}
