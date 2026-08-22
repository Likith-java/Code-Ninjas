import { initialsOf } from '../utils/employees.js';

export default function Avatar({ name, url, size = 'md' }) {
  const sizes = {
    sm: 'h-10 w-10 text-xs',
    md: 'h-12 w-12 text-sm',
    lg: 'h-14 w-14 text-base',
  };
  if (url) {
    return (
      <img
        alt={name}
        src={url}
        className={`${sizes[size]} shrink-0 rounded-full border border-outline-variant object-cover`}
      />
    );
  }
  return (
    <div
      className={`${sizes[size]} flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-on-primary`}
    >
      {initialsOf(name)}
    </div>
  );
}
