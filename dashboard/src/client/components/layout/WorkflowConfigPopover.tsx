import { useEffect, useRef, useCallback } from 'react';
import { useWorkflowConfigStore } from '@/client/store/workflow-config-store.js';
import type { ConfigValue, ConfigObject } from '@/client/store/workflow-config-store.js';
import { useI18n } from '@/client/i18n/index.js';
import { cn } from '@/client/lib/utils.js';

// ---------------------------------------------------------------------------
// WorkflowConfigPopover — data-driven floating panel
//
// Renders whatever fields exist in config.json dynamically:
//   boolean  → toggle switch
//   number   → number input
//   string   → select (if known options) or text input
//   object   → collapsible section with recursive fields
// ---------------------------------------------------------------------------

/** Known select options for string fields — keyed by field path */
const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  mode: [
    { value: 'interactive', label: 'Interactive' },
    { value: 'auto', label: 'Auto' },
    { value: 'review', label: 'Review' },
  ],
  granularity: [
    { value: 'minimal', label: 'Minimal' },
    { value: 'standard', label: 'Standard' },
    { value: 'detailed', label: 'Detailed' },
  ],
  model_profile: [
    { value: 'fast', label: 'Fast' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'quality', label: 'Quality' },
  ],
  'execution.method': [
    { value: 'agent', label: 'Agent' },
    { value: 'direct', label: 'Direct' },
  ],
  'git.branching': [
    { value: 'none', label: 'None' },
    { value: 'per-milestone', label: 'Per Milestone' },
    { value: 'per-phase', label: 'Per Phase' },
  ],
};

// ---------------------------------------------------------------------------
// Primitive controls
// ---------------------------------------------------------------------------

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-[length:var(--font-size-xs)] text-text-secondary truncate mr-2">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-[var(--duration-fast)]',
          checked ? 'bg-accent-blue' : 'bg-border',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm',
            'transition-transform duration-[var(--duration-fast)]',
            checked ? 'translate-x-[14px]' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}

function MiniSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'px-[var(--spacing-1-5)] py-0.5 rounded-[var(--radius-sm)] text-[length:var(--font-size-xs)]',
        'border border-border bg-bg-primary text-text-primary',
        'focus:outline-none focus:border-accent-blue',
      )}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function MiniNumber({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        'w-16 px-[var(--spacing-1-5)] py-0.5 rounded-[var(--radius-sm)] text-[length:var(--font-size-xs)]',
        'border border-border bg-bg-primary text-text-primary text-right',
        'focus:outline-none focus:border-accent-blue',
      )}
    />
  );
}

function MiniInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-28 px-[var(--spacing-1-5)] py-0.5 rounded-[var(--radius-sm)] text-[length:var(--font-size-xs)]',
        'border border-border bg-bg-primary text-text-primary',
        'focus:outline-none focus:border-accent-blue',
      )}
    />
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-[3px]">
      <span className="text-[length:var(--font-size-xs)] text-text-secondary truncate mr-2">{label}</span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Label resolver — try i18n, fallback to humanized key name
// ---------------------------------------------------------------------------

function useLabel() {
  const { t } = useI18n();
  return (i18nPath: string, fallbackKey: string): string => {
    const translated = t(i18nPath);
    // If t() returns the key itself, it means no translation — humanize the key
    if (translated === i18nPath) {
      return fallbackKey
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return translated;
  };
}

// ---------------------------------------------------------------------------
// Dynamic field renderer — auto-detects value type
// ---------------------------------------------------------------------------

function DynamicField({ fieldKey, value, path, onChange }: {
  fieldKey: string;
  value: ConfigValue;
  path: string; // dot-separated path for SELECT_OPTIONS lookup + i18n
  onChange: (v: ConfigValue) => void;
}) {
  const getLabel = useLabel();
  // Determine i18n key path: workflow_config.<section>.<field>
  const i18nKey = `workflow_config.${path}`;
  const label = getLabel(i18nKey, fieldKey);

  if (typeof value === 'boolean') {
    return <ToggleRow label={label} checked={value} onChange={onChange} />;
  }

  if (typeof value === 'number') {
    return (
      <FieldRow label={label}>
        <MiniNumber value={value} onChange={(v) => onChange(v)} />
      </FieldRow>
    );
  }

  if (typeof value === 'string') {
    const options = SELECT_OPTIONS[path];
    if (options) {
      return (
        <FieldRow label={label}>
          <MiniSelect value={value} onChange={onChange} options={options} />
        </FieldRow>
      );
    }
    return (
      <FieldRow label={label}>
        <MiniInput value={value} onChange={onChange} />
      </FieldRow>
    );
  }

  // null or unknown — render as text
  return (
    <FieldRow label={label}>
      <span className="text-[length:var(--font-size-xs)] text-text-tertiary">
        {String(value)}
      </span>
    </FieldRow>
  );
}

// ---------------------------------------------------------------------------
// Section renderer — renders an object as a titled group
// ---------------------------------------------------------------------------

function SectionGroup({ sectionKey, obj, parentPath, onChange }: {
  sectionKey: string;
  obj: ConfigObject;
  parentPath: string;
  onChange: (updated: ConfigObject) => void;
}) {
  const getLabel = useLabel();
  const i18nTitle = `workflow_config.${parentPath}.title`;
  const title = getLabel(i18nTitle, sectionKey);

  return (
    <div>
      <h4 className="text-[length:var(--font-size-xs)] font-[var(--font-weight-semibold)] text-text-primary mb-[var(--spacing-1)] uppercase tracking-wide">
        {title}
      </h4>
      <div className="flex flex-col">
        {Object.entries(obj).map(([key, val]) => {
          const fieldPath = `${parentPath}.${key}`;
          if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
            // Nested object — recurse
            return (
              <SectionGroup
                key={key}
                sectionKey={key}
                obj={val as ConfigObject}
                parentPath={fieldPath}
                onChange={(updated) => onChange({ ...obj, [key]: updated })}
              />
            );
          }
          return (
            <DynamicField
              key={key}
              fieldKey={key}
              value={val}
              path={fieldPath}
              onChange={(v) => onChange({ ...obj, [key]: v })}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Popover
// ---------------------------------------------------------------------------

export function WorkflowConfigPopover() {
  const { t } = useI18n();
  const open = useWorkflowConfigStore((s) => s.open);
  const setOpen = useWorkflowConfigStore((s) => s.setOpen);
  const draft = useWorkflowConfigStore((s) => s.draft);
  const loading = useWorkflowConfigStore((s) => s.loading);
  const saving = useWorkflowConfigStore((s) => s.saving);
  const isDirty = useWorkflowConfigStore((s) => s.isDirty());
  const updateDraft = useWorkflowConfigStore((s) => s.updateDraft);
  const save = useWorkflowConfigStore((s) => s.save);
  const discard = useWorkflowConfigStore((s) => s.discard);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (target.closest('[data-workflow-config-trigger]')) return;
        setOpen(false);
      }
    },
    [setOpen],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, handleClickOutside]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  const getLabel = useLabel();
  const hasData = draft && Object.keys(draft).length > 0;

  return (
    <div
      ref={panelRef}
      className={cn(
        'absolute top-[calc(var(--size-topbar-height)+4px)] right-[var(--spacing-4)] z-50',
        'w-[340px] max-h-[calc(100vh-var(--size-topbar-height)-40px)]',
        'rounded-[var(--radius-lg)] border border-border bg-bg-primary shadow-[var(--style-modal-shadow)]',
        'flex flex-col overflow-hidden',
        'animate-in fade-in-0 zoom-in-95 duration-150',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--spacing-3)] py-[var(--spacing-2)] border-b border-border shrink-0">
        <h3 className="text-[length:var(--font-size-sm)] font-[var(--font-weight-semibold)] text-text-primary">
          {t('workflow_config.title')}
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-[var(--duration-fast)]"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-[var(--spacing-3)] py-[var(--spacing-2)] space-y-[var(--spacing-3)]">
        {loading && !draft ? (
          <p className="text-[length:var(--font-size-xs)] text-text-secondary text-center py-4">
            {t('workflow_config.loading')}
          </p>
        ) : !hasData ? (
          <p className="text-[length:var(--font-size-xs)] text-text-secondary text-center py-4">
            {t('workflow_config.empty')}
          </p>
        ) : (
          <>
            {/* Render top-level primitives first (mode, granularity, etc.) */}
            {(() => {
              const primitives = Object.entries(draft).filter(
                ([, v]) => v === null || typeof v !== 'object',
              );
              if (primitives.length === 0) return null;
              return (
                <div>
                  <h4 className="text-[length:var(--font-size-xs)] font-[var(--font-weight-semibold)] text-text-primary mb-[var(--spacing-1)] uppercase tracking-wide">
                    {getLabel('workflow_config.top.title', 'Profile')}
                  </h4>
                  <div className="flex flex-col">
                    {primitives.map(([key, val]) => (
                      <DynamicField
                        key={key}
                        fieldKey={key}
                        value={val}
                        path={key}
                        onChange={(v) => updateDraft(key, v)}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Render object sections */}
            {Object.entries(draft)
              .filter(([, v]) => v !== null && typeof v === 'object' && !Array.isArray(v))
              .map(([key, val]) => (
                <SectionGroup
                  key={key}
                  sectionKey={key}
                  obj={val as ConfigObject}
                  parentPath={key}
                  onChange={(updated) => updateDraft(key, updated)}
                />
              ))}
          </>
        )}
      </div>

      {/* Footer save bar */}
      {isDirty && (
        <div className="flex items-center justify-end gap-[var(--spacing-2)] px-[var(--spacing-3)] py-[var(--spacing-2)] border-t border-border shrink-0 bg-bg-secondary/95">
          <button
            type="button"
            onClick={discard}
            disabled={saving}
            className={cn(
              'px-[var(--spacing-2)] py-[var(--spacing-1)] rounded-[var(--radius-sm)]',
              'text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)]',
              'border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover',
              'transition-colors duration-[var(--duration-fast)]',
              'disabled:opacity-50',
            )}
          >
            {t('workflow_config.discard')}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={cn(
              'px-[var(--spacing-2)] py-[var(--spacing-1)] rounded-[var(--radius-sm)]',
              'text-[length:var(--font-size-xs)] font-[var(--font-weight-medium)]',
              'bg-accent-blue text-white hover:opacity-90',
              'transition-colors duration-[var(--duration-fast)]',
              'disabled:opacity-50',
            )}
          >
            {saving ? t('workflow_config.saving') : t('workflow_config.save')}
          </button>
        </div>
      )}
    </div>
  );
}
