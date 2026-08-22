export default function Modal({ title, onClose, wide = false, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`max-h-full w-full ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        } space-y-3 overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl`}
      >
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-headline-md font-bold text-primary">{title}</h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="material-symbols-outlined rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-error"
            >
              close
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
