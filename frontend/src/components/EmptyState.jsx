export default function EmptyState({ icon = 'inbox', title, message }) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-12 text-center">
      <span className="material-symbols-outlined mb-2 block text-3xl text-on-surface-variant/60">
        {icon}
      </span>
      {title && <p className="font-headline-md font-bold text-on-surface">{title}</p>}
      {message && (
        <p className="font-body-md mt-1 text-on-surface-variant">{message}</p>
      )}
    </div>
  );
}
