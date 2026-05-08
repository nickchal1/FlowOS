import Database from "better-sqlite3";

type DB = InstanceType<typeof Database>;

const LOW_FOCUS_THRESHOLD = 50;
const MIN_ACTIVATIONS = 3;

export interface FrictionRow {
  bundleId: string;
  frictionScore: number;
  totalActivations: number;
  lowFocusActivations: number;
  lastSeen: string;
  lastFocusScore: number;
}

export function recordAppActivation(db: DB, bundleId: string, focusScore: number): void {
  const isLowFocus = focusScore < LOW_FOCUS_THRESHOLD ? 1 : 0;
  db.prepare(`
    INSERT INTO app_behavior (bundle_id, total_activations, low_focus_activations, last_seen, last_focus_score)
    VALUES (?, 1, ?, ?, ?)
    ON CONFLICT(bundle_id) DO UPDATE SET
      total_activations     = total_activations + 1,
      low_focus_activations = low_focus_activations + excluded.low_focus_activations,
      last_seen             = excluded.last_seen,
      last_focus_score      = excluded.last_focus_score
  `).run(bundleId, isLowFocus, new Date().toISOString(), focusScore);
}

export function getFrictionScore(db: DB, bundleId: string): number {
  const row = db.prepare(
    "SELECT total_activations, low_focus_activations FROM app_behavior WHERE bundle_id = ?"
  ).get(bundleId) as { total_activations: number; low_focus_activations: number } | undefined;
  if (!row || row.total_activations === 0) return 0;
  return row.low_focus_activations / row.total_activations;
}

export function getFrictionLeaderboard(db: DB, limit = 10): FrictionRow[] {
  const rows = db.prepare(`
    SELECT bundle_id, total_activations, low_focus_activations, last_seen, last_focus_score
    FROM app_behavior
    WHERE total_activations >= ?
    ORDER BY CAST(low_focus_activations AS REAL) / total_activations DESC
    LIMIT ?
  `).all(MIN_ACTIVATIONS, limit) as Array<{
    bundle_id: string;
    total_activations: number;
    low_focus_activations: number;
    last_seen: string;
    last_focus_score: number;
  }>;

  return rows.map((r) => ({
    bundleId: r.bundle_id,
    frictionScore: r.total_activations > 0 ? r.low_focus_activations / r.total_activations : 0,
    totalActivations: r.total_activations,
    lowFocusActivations: r.low_focus_activations,
    lastSeen: r.last_seen,
    lastFocusScore: r.last_focus_score,
  }));
}
