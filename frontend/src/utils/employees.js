export const DEPARTMENT_CHIP_CLASSES = {
  Design: 'bg-blue-100 text-blue-800',
  Product: 'bg-purple-100 text-purple-800',
  Engineering: 'bg-green-100 text-green-800',
  'Human Resources': 'bg-orange-100 text-orange-800',
  Marketing: 'bg-pink-100 text-pink-800',
  Finance: 'bg-slate-100 text-slate-700',
};

export function departmentChipClass(department) {
  return DEPARTMENT_CHIP_CLASSES[department] || 'bg-slate-100 text-slate-700';
}

export function initialsOf(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
