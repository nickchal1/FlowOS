import Database from "better-sqlite3";

type DB = InstanceType<typeof Database>;

export interface HourlySlot {
  hour: number;
  switchCount: number;
  focusSecs: number;
  commandsRun: number;
  energyScore: number; // 0–100
  dayCount: number;
}

export function recordHourlySwitch(db: DB): void {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  db.prepare(`
    INSERT INTO hourly_activity (date, hour, switch_count, focus_secs, commands_run)
    VALUES (?, ?, 1, 0, 0)
    ON CONFLICT(date, hour) DO UPDATE SET switch_count = switch_count + 1
  `).run(date, hour);
}

export function recordHourlyCommand(db: DB): void {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  db.prepare(`
    INSERT INTO hourly_activity (date, hour, switch_count, focus_secs, commands_run)
    VALUES (?, ?, 0, 0, 1)
    ON CONFLICT(date, hour) DO UPDATE SET commands_run = commands_run + 1
  `).run(date, hour);
}

export function recordHourlyFocusSecs(db: DB, secs: number): void {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  db.prepare(`
    INSERT INTO hourly_activity (date, hour, switch_count, focus_secs, commands_run)
    VALUES (?, ?, 0, ?, 0)
    ON CONFLICT(date, hour) DO UPDATE SET focus_secs = focus_secs + excluded.focus_secs
  `).run(date, hour, secs);
}

export function getEnergyCurve(db: DB, days = 14): HourlySlot[] {
  const rows = db.prepare(`
    SELECT
      hour,
      SUM(switch_count) AS total_switches,
      SUM(focus_secs)   AS total_focus,
      SUM(commands_run) AS total_commands,
      COUNT(DISTINCT date) AS day_count
    FROM hourly_activity
    WHERE date >= date('now', ?)
    GROUP BY hour
    ORDER BY hour ASC
  `).all(`-${days} days`) as Array<{
    hour: number;
    total_switches: number;
    total_focus: number;
    total_commands: number;
    day_count: number;
  }>;

  const maxFocus   = Math.max(...rows.map((r) => r.day_count > 0 ? r.total_focus   / r.day_count : 0), 1);
  const maxSwitches = Math.max(...rows.map((r) => r.day_count > 0 ? r.total_switches / r.day_count : 0), 1);

  return Array.from({ length: 24 }, (_, h) => {
    const row = rows.find((r) => r.hour === h);
    if (!row || row.day_count === 0) {
      return { hour: h, switchCount: 0, focusSecs: 0, commandsRun: 0, energyScore: 0, dayCount: 0 };
    }
    const avgFocus    = row.total_focus    / row.day_count;
    const avgSwitches = row.total_switches / row.day_count;
    const focusComponent  = (avgFocus    / maxFocus)    * 60;
    const switchComponent = (1 - avgSwitches / maxSwitches) * 40;
    const energyScore = Math.round(Math.max(0, Math.min(100, focusComponent + switchComponent)));
    return {
      hour: h,
      switchCount:  Math.round(row.total_switches / row.day_count),
      focusSecs:    Math.round(row.total_focus    / row.day_count),
      commandsRun:  Math.round(row.total_commands / row.day_count),
      energyScore,
      dayCount: row.day_count,
    };
  });
}
