export default function FormField({ label, error, children }) {
  return (
    <label className="block">
      <span className="font-label-md mb-1 block uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-error">{error}</span>}
    </label>
  );
}
