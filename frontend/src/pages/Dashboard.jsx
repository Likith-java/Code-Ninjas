import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import { departmentChipClass } from '../utils/employees.js';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/employees?limit=100')
      .then((res) => setEmployees(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = employees.length;
  const onLeave = employees.filter((e) => e.status === 'on_leave').length;
  const departments = [...new Set(employees.map((e) => e.department))];
  const topEmployees = employees.slice(0, 4);

  return (
    <div className="mx-auto flex max-w-container-max-width flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-headline-lg text-primary">
            Hi {user?.email?.split('@')[0]?.split(/[._-]+/)[0] ?? 'there'}!
          </h2>
          <p className="font-body-lg mt-1 text-on-surface-variant">
            Good day — here's what's happening today.
          </p>
        </div>
        <Link
          to="/employees"
          className="font-label-md flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-label-md text-on-primary shadow-sm transition-colors hover:bg-primary/90"
        >
          <span className="material-symbols-outlined text-[18px]">badge</span>
          Open Directory
        </Link>
      </div>

      <div className="grid grid-cols-12 gap-gutter">
        <div className="col-span-12 lg:col-span-8">
          <div className="relative flex items-center justify-between overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card">
            <div className="z-10 max-w-md">
              <h3 className="font-headline-md mb-2 text-primary">Workforce Overview</h3>
              <p className="font-body-md mb-6 leading-relaxed text-on-surface-variant">
                Manage your workforce efficiently. Review your team, track availability, and keep
                the directory up to date.
              </p>
              <Link
                to="/employees"
                className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-5 py-2 font-semibold text-label-md text-white transition-colors hover:bg-primary"
              >
                <span className="material-symbols-outlined text-[18px]">groups</span>
                View all employees
              </Link>
            </div>
            <div className="absolute -right-6 -top-6 h-40 w-40 rounded-full bg-secondary-fixed opacity-60 blur-2xl"></div>
          </div>
        </div>

        <div className="relative col-span-12 overflow-hidden rounded-xl bg-primary p-card-padding shadow-payroll lg:col-span-4">
          <div className="absolute -top-1/2 right-0 h-32 w-32 translate-x-1/3 rounded-full bg-white/5 blur-2xl"></div>
          <div>
            <div className="font-label-md mb-4 flex items-center gap-2 uppercase tracking-wider text-primary-fixed-dim">
              <span className="material-symbols-outlined">payments</span>
              Payroll Summary
            </div>
            <p className="font-body-md mb-1 text-primary-fixed">Next Payout (Oct 15)</p>
            <h3 className="font-display-lg text-on-primary">$45,200.00</h3>
          </div>
          <button className="font-label-md mt-6 w-full rounded-lg border border-white/20 bg-white/10 py-3 text-label-md text-on-primary backdrop-blur-sm transition-colors hover:bg-white/20">
            View Details
          </button>
        </div>

        <div className="col-span-12 grid grid-cols-3 gap-gutter lg:col-span-8">
          <StatCard
            icon="groups"
            label="Total Employees"
            value={loading ? '…' : String(total)}
          />
          <StatCard
            icon="apartment"
            label="Departments"
            value={loading ? '…' : String(departments.length)}
          />
          <StatCard icon="event_busy" label="On Leave" value={loading ? '…' : String(onLeave)} />
        </div>

        <div className="col-span-12 flex flex-col rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card lg:col-span-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-headline-md text-[18px] text-primary">Top Employees</h3>
            <Link to="/employees" className="font-label-md hover:underline text-primary-container">
              View All
            </Link>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            {topEmployees.map((employee) => (
              <div
                key={employee.id}
                className="flex items-center justify-between rounded-lg border border-transparent p-2 transition-colors hover:border-outline-variant/20 hover:bg-surface-container-low"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={employee.full_name} url={employee.avatar_url} size="sm" />
                  <div className="min-w-0">
                    <h5 className="truncate text-sm font-bold text-on-surface">{employee.full_name}</h5>
                    <p className="font-body-md truncate text-on-surface-variant">{employee.position}</p>
                  </div>
                </div>
                <span
                  className={`ml-2 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${departmentChipClass(
                    employee.department
                  )}`}
                >
                  {employee.department.split(' ')[0]}
                </span>
              </div>
            ))}
            {!loading && topEmployees.length === 0 && (
              <p className="font-body-md text-on-surface-variant">
                No employees yet{isAdmin ? ' — add some in the directory' : ''}.
              </p>
            )}
          </div>
        </div>

        <div className="col-span-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          <ProjectCard
            icon="smartphone"
            badge="In Progress"
            title="Mobile App Redesign"
            subtitle="HR Employee Self-Service App"
            progress={65}
          />
          <ProjectCard
            icon="analytics"
            badge="Planning"
            badgeClass="bg-surface-variant text-on-surface-variant"
            title="Q4 Performance Dashboard"
            subtitle="Analytics integration for management"
            progress={15}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-secondary-container text-primary-container">
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <p className="font-label-md uppercase tracking-wider text-on-surface-variant">{label}</p>
      <p className="font-display-lg mt-1 text-[32px] leading-tight text-primary">{value}</p>
    </div>
  );
}

function ProjectCard({ icon, badge, badgeClass = 'bg-secondary-container text-primary-container', title, subtitle, progress }) {
  return (
    <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary-container text-primary-container">
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${badgeClass}`}>{badge}</span>
      </div>
      <h4 className="mb-1 text-base font-bold text-on-surface">{title}</h4>
      <p className="font-body-md mb-5 text-on-surface-variant">{subtitle}</p>
      <div className="mb-2 flex justify-between text-[11px] font-semibold text-on-surface-variant">
        <span>Progress</span>
        <span>{progress}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }}></div>
      </div>
    </div>
  );
}
