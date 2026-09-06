const STATUS_MAP = {
  active: {
    label: 'Active',
    containerClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    dotClass: 'bg-emerald-500',
  },
  on_leave: {
    label: 'On Leave',
    containerClass: 'bg-amber-50 text-amber-700 border-amber-200/60',
    dotClass: 'bg-amber-500',
  },
  disabled: {
    label: 'Disabled',
    containerClass: 'bg-red-50 text-red-700 border-red-200/60',
    dotClass: 'bg-red-500',
  },
};

export default function StatusBadge({ status }) {
  const item = STATUS_MAP[status] ?? {
    label: status,
    containerClass: 'bg-slate-50 text-slate-700 border-slate-200',
    dotClass: 'bg-slate-400',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.containerClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${item.dotClass}`}></span>
      <span>{item.label}</span>
    </span>
  );
}
