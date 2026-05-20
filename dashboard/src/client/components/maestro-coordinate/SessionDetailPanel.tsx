// ---------------------------------------------------------------------------
// SessionDetailPanel — right panel wrapper with MetaField export
// ---------------------------------------------------------------------------

export function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-widest text-text-placeholder mb-[2px]">
        {label}
      </div>
      <div className="text-[length:var(--font-size-sm)] font-medium text-text-primary">
        {value}
      </div>
    </div>
  );
}
