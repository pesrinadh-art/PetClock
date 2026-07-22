import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { timeline as seedLogs, type TimelineEntry } from '../data/mockData';
import { formatClock } from '../lib/petSchedule';

type NewLog = {
  type: TimelineEntry['type'];
  icon: string;
  label: string;
  sub: string;
  timestamp?: number;
};

type LogsContextValue = {
  logs: TimelineEntry[];
  addLog: (petId: string, log: NewLog) => void;
  getLogsForPet: (petId: string) => TimelineEntry[];
};

const LogsContext = createContext<LogsContextValue | null>(null);

export function LogsProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<TimelineEntry[]>(seedLogs);

  const addLog = (petId: string, log: NewLog) => {
    const timestamp = log.timestamp ?? Date.now();
    const entry: TimelineEntry = {
      id: `${log.type}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
      petId,
      type: log.type,
      icon: log.icon,
      label: log.label,
      sub: log.sub,
      time: formatClock(new Date(timestamp)),
      timestamp,
    };
    setLogs((prev) => [entry, ...prev]);
  };

  const getLogsForPet = (petId: string) =>
    logs.filter((l) => l.petId === petId).sort((a, b) => b.timestamp - a.timestamp);

  const value = useMemo(() => ({ logs, addLog, getLogsForPet }), [logs]);

  return <LogsContext.Provider value={value}>{children}</LogsContext.Provider>;
}

export function useLogs() {
  const ctx = useContext(LogsContext);
  if (!ctx) throw new Error('useLogs must be used within a LogsProvider');
  return ctx;
}
