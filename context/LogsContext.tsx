import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { type LogEntry, type LogType } from '../data/mockData';
import { usePersistedCollection } from '../hooks/usePersistedCollection';
import { repos } from '../lib/repo/types';

/** What a call site supplies to log — the repo mints id/household/source/timestamps (Δ4). */
type NewLog = {
  type: LogType;
  /** ISO. Defaults to now inside the repo. */
  occurredAt?: string;
  note?: string | null;
  /** Δ1: which feed-time slot a food log covers. */
  feedTimeId?: string | null;
  /** Which medication dose a medication log records. */
  medicationId?: string | null;
};

type LogsContextValue = {
  logs: LogEntry[];
  /** True once the logs collection has been read from storage (Wave-3 splash gate). */
  hydrated: boolean;
  addLog: (petId: string, log: NewLog) => void;
  removeLog: (id: string) => void;
  removeLogsForPet: (petId: string) => void;
  updateLog: (id: string, patch: Partial<Omit<LogEntry, 'id' | 'petId'>>) => void;
  /**
   * Shift a log's occurredAt by ±minutes. Logs are immutable server-side (the
   * enforce_log_immutability trigger rejects any occurred_at change), so this is a
   * REPLACE: insert a new log at the corrected time, then soft-delete the old one.
   * Insert-before-remove so there is never a transient "no anchor" gap.
   */
  adjustLogTime: (id: string, deltaMinutes: number) => void;
  getLogsForPet: (petId: string) => LogEntry[];
};

const MINUTE_MS = 60 * 1000;

const LogsContext = createContext<LogsContextValue | null>(null);

const EMPTY_LOGS: LogEntry[] = [];

export function LogsProvider({ children }: { children: ReactNode }) {
  // Persisted, storage-backed state (see usePersistedCollection; Pets is the reference).
  const { items: logs, hydrated } = usePersistedCollection(repos.logs);

  // Repo mints id/timestamps and inserts newest-first; usePersistedCollection re-pulls state.
  const addLog = useCallback((petId: string, log: NewLog) => {
    void repos.logs.add(petId, log);
  }, []);

  const removeLog = useCallback((id: string) => {
    void repos.logs.remove(id);
  }, []);

  // Bulk removal for the pet-delete cascade (D10) — one repo op instead of
  // the UI looping removeLog per entry.
  const removeLogsForPet = useCallback((petId: string) => {
    void repos.logs.removeForPet(petId);
  }, []);

  const updateLog = useCallback(
    (id: string, patch: Partial<Omit<LogEntry, 'id' | 'petId'>>) => {
      const existing = logs.find((l) => l.id === id);
      if (!existing) return;
      void repos.logs.upsert({ ...existing, ...patch });
    },
    [logs],
  );

  // Logs are immutable server-side (occurred_at cannot change in place), so a time
  // adjustment is a REPLACE: insert a new log at the corrected time carrying the same
  // domain facts, then soft-delete the old one. Insert BEFORE remove so the prediction
  // anchor never briefly disappears. The repo mints a fresh uuid v4 for the replacement.
  const adjustLogTime = useCallback(
    async (id: string, deltaMinutes: number) => {
      const existing = logs.find((l) => l.id === id);
      if (!existing) return;
      // Match the UI clamp: never move a log past "now".
      const nextMs = Math.min(
        new Date(existing.occurredAt).getTime() + deltaMinutes * MINUTE_MS,
        Date.now(),
      );
      await repos.logs.add(existing.petId, {
        type: existing.type,
        occurredAt: new Date(nextMs).toISOString(),
        note: existing.note,
        feedTimeId: existing.feedTimeId,
        medicationId: existing.medicationId,
      });
      await repos.logs.remove(id);
    },
    [logs],
  );

  // Memoized per-pet index so getLogsForPet returns stable arrays between log changes (D28).
  const logsByPet = useMemo(() => {
    const byPet = new Map<string, LogEntry[]>();
    for (const log of logs) {
      const list = byPet.get(log.petId);
      if (list) list.push(log);
      else byPet.set(log.petId, [log]);
    }
    for (const list of byPet.values()) {
      list.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    }
    return byPet;
  }, [logs]);

  const getLogsForPet = useCallback(
    (petId: string) => logsByPet.get(petId) ?? EMPTY_LOGS,
    [logsByPet],
  );

  const value = useMemo(
    () => ({ logs, hydrated, addLog, removeLog, removeLogsForPet, updateLog, adjustLogTime, getLogsForPet }),
    [logs, hydrated, addLog, removeLog, removeLogsForPet, updateLog, adjustLogTime, getLogsForPet],
  );

  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>;
}

export function useLogs() {
  const ctx = useContext(LogsContext);
  if (!ctx) throw new Error('useLogs must be used within a LogsProvider');
  return ctx;
}
