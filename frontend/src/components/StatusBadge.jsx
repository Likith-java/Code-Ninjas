const STATUS_MAP = {
  active: { label: 'Active', className: 'text-green-600' },
  on_leave: { label: 'On leave', className: 'text-error' },
  disabled: { label: 'Disabled', className: 'text-error' },
};

export default function StatusBadge({ status }) {
  const item = STATUS_MAP[status] ?? { label: status, className: 'text-on-surface-variant' };
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wider ${item.className}`}
    >
      {item.label}
    </span>
  );
}
