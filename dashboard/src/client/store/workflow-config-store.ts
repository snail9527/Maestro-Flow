import { create } from 'zustand';

// ---------------------------------------------------------------------------
// WorkflowConfigStore — data-driven draft editing for .workflow/config.json
//
// Schema is fully dynamic: whatever keys the API returns get rendered.
// No hardcoded interfaces — the UI auto-detects field types.
// ---------------------------------------------------------------------------

/** Recursive JSON-compatible value */
export type ConfigValue = string | number | boolean | null | ConfigObject;
export type ConfigObject = { [key: string]: ConfigValue };

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export interface WorkflowConfigStore {
  open: boolean;
  config: ConfigObject | null;
  draft: ConfigObject | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  setOpen: (open: boolean) => void;
  loadConfig: () => Promise<void>;
  /** Update a top-level key in draft */
  updateDraft: (key: string, value: ConfigValue) => void;
  save: () => Promise<void>;
  discard: () => void;
  isDirty: () => boolean;
}

export const useWorkflowConfigStore = create<WorkflowConfigStore>((set, get) => ({
  open: false,
  config: null,
  draft: null,
  loading: false,
  saving: false,
  error: null,

  setOpen: (open) => {
    set({ open });
    if (open && !get().config) {
      void get().loadConfig();
    }
  },

  loadConfig: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/workflow-config');
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const data = (await res.json()) as ConfigObject;
      set({ config: data, draft: deepClone(data), loading: false });
    } catch (err) {
      set({ config: null, draft: null, loading: false, error: String(err) });
    }
  },

  updateDraft: (key, value) => {
    const { draft } = get();
    if (!draft) return;
    set({ draft: { ...draft, [key]: value } });
  },

  save: async () => {
    const { draft } = get();
    if (!draft) return;
    set({ saving: true, error: null });
    try {
      const res = await fetch('/api/workflow-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`Failed to save: ${res.status}`);
      set({ config: deepClone(draft), saving: false });
    } catch (err) {
      set({ saving: false, error: String(err) });
    }
  },

  discard: () => {
    const { config } = get();
    if (!config) return;
    set({ draft: deepClone(config) });
  },

  isDirty: () => {
    const { config, draft } = get();
    if (!config || !draft) return false;
    return JSON.stringify(config) !== JSON.stringify(draft);
  },
}));
