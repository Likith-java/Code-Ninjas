import Avatar from './Avatar.jsx';
import StatusBadge from './StatusBadge.jsx';
import { departmentChipClass } from '../utils/employees.js';

export default function EmployeeCard({ employee, onClick, action }) {
  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-4 rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-card-padding shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/30 ${
        onClick ? 'cursor-pointer' : 'cursor-default'
      }`}
    >
      <Avatar name={employee.full_name} url={employee.avatar_url} />
      <div className="min-w-0 flex-1">
        <p className="font-headline-md truncate text-[16px] font-bold text-on-surface">
          {employee.full_name}
        </p>
        <p className="font-body-md truncate text-on-surface-variant">{employee.position}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${departmentChipClass(
              employee.department
            )}`}
          >
            {employee.department}
          </span>
          <StatusBadge status={employee.status} />
        </div>
      </div>
      {action}
    </div>
  );
}
