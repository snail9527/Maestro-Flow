import { create } from 'zustand';

import type {
  MaestroSessionListItem,
  RalphStatusJson,
  MaestroStatusJson,
  CoordinateWalkerState,
  MaestroSessionUpdatedPayload,
} from '@/shared/maestro-session-types.js';

// ---------------------------------------------------------------------------
// Maestro Coordinate Store — session state for MaestroCoordinatePage
// ---------------------------------------------------------------------------

export type SessionDetail =
  | { source: 'ralph'; data: RalphStatusJson }
  | { source: 'maestro'; data: MaestroStatusJson }
  | { source: 'coordinate'; data: CoordinateWalkerState };

export interface MaestroCoordinateStore {
  // State
  sessions: MaestroSessionListItem[];
  selectedDir: string | null;
  sessionDetail: SessionDetail | null;
  isLoading: boolean;
  error: string | null;

  // REST action dispatchers
  fetchSessions: () => Promise<void>;
  fetchSessionDetail: (dirName: string) => Promise<void>;
  selectSession: (dirName: string | null) => void;

  // WS event handler
  onSessionUpdated: (payload: MaestroSessionUpdatedPayload) => void;

  // UI actions
  clearError: () => void;
}

export const useMaestroCoordinateStore = create<MaestroCoordinateStore>(
  (set, get) => ({
    // Initial state
    sessions: [],
    selectedDir: null,
    sessionDetail: null,
    isLoading: false,
    error: null,

    // -------------------------------------------------------------------------
    // REST action dispatchers
    // -------------------------------------------------------------------------

    fetchSessions: async () => {
      set({ isLoading: true, error: null });
      try {
        const res = await fetch('/api/maestro-coordinate/sessions');
        if (!res.ok) {
          set({
            error: `Failed to fetch sessions: ${res.status}`,
            isLoading: false,
          });
          return;
        }
        const data: unknown = await res.json();
        const sessions = Array.isArray(data)
          ? (data as MaestroSessionListItem[])
          : [];
        set({ sessions, isLoading: false, error: null });
      } catch (err) {
        set({
          error: `Failed to fetch sessions: ${err instanceof Error ? err.message : String(err)}`,
          isLoading: false,
        });
      }
    },

    fetchSessionDetail: async (dirName: string) => {
      try {
        const res = await fetch(
          `/api/maestro-coordinate/sessions/${encodeURIComponent(dirName)}`,
        );
        if (!res.ok) {
          set({
            error: `Failed to fetch session detail: ${res.status}`,
          });
          return;
        }
        const data: unknown = await res.json();
        if (
          data &&
          typeof data === 'object' &&
          'source' in data &&
          'data' in data
        ) {
          set({
            sessionDetail: data as SessionDetail,
            selectedDir: dirName,
            error: null,
          });
        }
      } catch (err) {
        set({
          error: `Failed to fetch session detail: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    },

    selectSession: (dirName) => {
      if (dirName === null) {
        set({ selectedDir: null, sessionDetail: null });
        return;
      }
      const prev = get().selectedDir;
      set({ selectedDir: dirName });
      // Always fetch detail when switching to a different session
      if (prev !== dirName) {
        void get().fetchSessionDetail(dirName);
      }
    },

    // -------------------------------------------------------------------------
    // WS event handler
    // -------------------------------------------------------------------------

    onSessionUpdated: (payload) =>
      set((state) => {
        const updated = payload.session;
        const exists = state.sessions.findIndex(
          (s) => s.dirName === updated.dirName,
        );

        let sessions: MaestroSessionListItem[];
        if (exists >= 0) {
          // Update existing session in-place
          sessions = [...state.sessions];
          sessions[exists] = updated;
        } else {
          // Add new session at top
          sessions = [updated, ...state.sessions];
        }

        // Re-sort by updatedAt desc
        sessions.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() -
            new Date(a.updatedAt).getTime(),
        );

        // If the updated session is currently selected, refresh its detail
        if (state.selectedDir === updated.dirName) {
          // Trigger detail refresh in background
          void get().fetchSessionDetail(updated.dirName);
        }

        return { sessions };
      }),

    // -------------------------------------------------------------------------
    // UI actions
    // -------------------------------------------------------------------------

    clearError: () => set({ error: null }),
  }),
);
