import Avatar from './Avatar.jsx';
import StatusBadge from './StatusBadge.jsx';
import { departmentChipClass } from '../utils/employees.js';

export default function EmployeeCard({ employee, onClick, action }) {
  return (
    <div
      onClick={onClick}
      className={`group relative flex items-center justify-between gap-4 rounded-2xl border border-outline-variant/30 bg-white p-5 shadow-xs transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-card-hover ${
        onClick ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <div className="relative shrink-0">
          <Avatar name={employee.full_name} url={employee.avatar_url} />
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
              employee.status === 'active'
                ? 'bg-emerald-500'
                : employee.status === 'on_leave'
                ? 'bg-amber-500'
                : 'bg-red-500'
            }`}
          ></span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
            {employee.full_name}
          </p>
          <p className="truncate text-xs text-on-surface-variant">{employee.position}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${departmentChipClass(
                employee.department
              )}`}
            >
              {employee.department}
            </span>
            <StatusBadge status={employee.status} />
          </div>
        </div>
      </div>
      {action && (
        <div className="shrink-0 pl-1" onClick={(e) => e.stopPropagation()}>
          {action}
        </div>
      )}
    </div>
  );
}
