import { getTodayEvents, type CalendarEvent } from "./calendarService.js";

const DEFAULT_LEAD_MINS  = 45;
const POLL_INTERVAL_MS   = 5 * 60 * 1000; // 5 minutes

interface PrepModeOptions {
  leadMinutes?: number;
  onPrepTriggered: (event: CalendarEvent, minsUntil: number) => void;
}

export interface PrepModeService {
  start(): void;
  stop(): void;
}

export function createPrepModeService(options: PrepModeOptions): PrepModeService {
  const leadMs = (options.leadMinutes ?? DEFAULT_LEAD_MINS) * 60 * 1000;
  const alerted = new Set<string>();
  let timer: NodeJS.Timeout | null = null;

  async function check(): Promise<void> {
    try {
      const events = await getTodayEvents();
      const now = Date.now();
      for (const event of events) {
        if (alerted.has(event.id)) continue;
        const startMs = new Date(event.startAt).getTime();
        const diff = startMs - now;
        if (diff > 0 && diff <= leadMs) {
          alerted.add(event.id);
          options.onPrepTriggered(event, Math.round(diff / 60000));
        }
      }
    } catch {
      // Calendar access failed silently
    }
  }

  function start(): void {
    void check();
    timer = setInterval(() => { void check(); }, POLL_INTERVAL_MS);
  }

  function stop(): void {
    if (timer) { clearInterval(timer); timer = null; }
    alerted.clear();
  }

  return { start, stop };
}
