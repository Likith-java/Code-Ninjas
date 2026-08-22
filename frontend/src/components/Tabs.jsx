export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-outline-variant/30">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            active === tab.key
              ? 'border-primary text-primary'
              : 'border-transparent text-on-surface-variant hover:text-primary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
