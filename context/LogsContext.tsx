import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { timeline as seedLogs, type TimelineEntry } from '../data/mockData';

type NewLog = {
  type: TimelineEntry['type'];
  icon: string;
  label: string;
  /** @deprecated Display strings are derived from `timestamp` at render (D5). Ignored. */
  sub?: string;
  timestamp?: number;
};

type LogsContextValue = {
  logs: TimelineEntry[];
  addLog: (petId: string, log: NewLog) => void;
  removeLog: (id: string) => void;
  removeLogsForPet: (petId: string) => void;
  updateLog: (id: string, patch: Partial<Omit<TimelineEntry, 'id' | 'petId'>>) => void;
  getLogsForPet: (petId: string) => TimelineEntry[];
};

const LogsContext = createContext<LogsContextValue | null>(null);

const EMPTY_LOGS: TimelineEntry[] = [];

export function LogsProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<TimelineEntry[]>(seedLogs);

  const addLog = useCallback((petId: string, log: NewLog) => {
    const timestamp = log.timestamp ?? Date.now();
    const entry: TimelineEntry = {
      id: `${log.type}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
      petId,
      type: log.type,
      icon: log.icon,
      label: log.label,
      timestamp,
    };
    setLogs((prev) => [entry, ...prev]);
  }, []);

  const removeLog = useCallback((id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // Bulk removal for the pet-delete cascade (D10) — one state update instead of
  // the UI looping removeLog per entry.
  const removeLogsForPet = useCallback((petId: string) => {
    setLogs((prev) => prev.filter((l) => l.petId !== petId));
  }, []);

  const updateLog = useCallback((id: string, patch: Partial<Omit<TimelineEntry, 'id' | 'petId'>>) => {
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  // Memoized per-pet index so getLogsForPet returns stable arrays between log changes (D28).
  const logsByPet = useMemo(() => {
    const byPet = new Map<string, TimelineEntry[]>();
    for (const log of logs) {
      const list = byPet.get(log.petId);
      if (list) list.push(log);
      else byPet.set(log.petId, [log]);
    }
    for (const list of byPet.values()) list.sort((a, b) => b.timestamp - a.timestamp);
    return byPet;
  }, [logs]);

  const getLogsForPet = useCallback(
    (petId: string) => logsByPet.get(petId) ?? EMPTY_LOGS,
    [logsByPet],
  );

  const value = useMemo(
    () => ({ logs, addLog, removeLog, removeLogsForPet, updateLog, getLogsForPet }),
    [logs, addLog, removeLog, removeLogsForPet, updateLog, getLogsForPet],
  );

  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>;
}

export function useLogs() {
  const ctx = useContext(LogsContext);
  if (!ctx) throw new Error('useLogs must be used within a LogsProvider');
  return ctx;
}
