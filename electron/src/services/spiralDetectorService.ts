import type { AppCategory } from "./workStyleAnalyzer.js";

const WINDOW_MS   = 10 * 60 * 1000; // 10-minute sliding window
const THRESHOLD   = 3;               // switches needed to trigger
const COOLDOWN_MS = 15 * 60 * 1000; // 15-minute cooldown before re-alerting

const UNPRODUCTIVE_CATEGORIES: ReadonlySet<AppCategory> = new Set(["communication", "media"]);

export interface SpiralEvent {
  triggeredAt: string;
  appSequence: string[];
}

interface SpiralDetectorOptions {
  onSpiralDetected: (event: SpiralEvent) => void;
  extraUnproductiveBundleIds?: string[];
}

export interface SpiralDetectorService {
  recordSwitch(bundleId: string, category: AppCategory): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

export function createSpiralDetectorService(options: SpiralDetectorOptions): SpiralDetectorService {
  const extraSet = new Set(options.extraUnproductiveBundleIds ?? []);
  const switchLog: Array<{ ts: number; bundleId: string }> = [];
  let paused = false;
  let disposed = false;
  let lastAlertAt = 0;

  function isUnproductive(bundleId: string, category: AppCategory): boolean {
    return UNPRODUCTIVE_CATEGORIES.has(category) || extraSet.has(bundleId);
  }

  function pruneWindow(now: number): void {
    const cutoff = now - WINDOW_MS;
    while (switchLog.length > 0 && switchLog[0]!.ts < cutoff) {
      switchLog.shift();
    }
  }

  function recordSwitch(bundleId: string, category: AppCategory): void {
    if (disposed || paused) return;
    if (!isUnproductive(bundleId, category)) return;

    const now = Date.now();
    pruneWindow(now);
    switchLog.push({ ts: now, bundleId });

    if (switchLog.length < THRESHOLD) return;
    if (now - lastAlertAt < COOLDOWN_MS) return;

    lastAlertAt = now;
    options.onSpiralDetected({
      triggeredAt: new Date(now).toISOString(),
      appSequence: switchLog.map((s) => s.bundleId),
    });
  }

  function setPaused(value: boolean): void {
    paused = value;
    if (value) switchLog.length = 0;
  }

  function dispose(): void {
    disposed = true;
    switchLog.length = 0;
  }

  return { recordSwitch, setPaused, dispose };
}
