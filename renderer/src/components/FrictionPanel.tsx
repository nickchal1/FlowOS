import { useEffect, useState } from "react";

interface FrictionRow {
  bundleId: string;
  frictionScore: number;
  totalActivations: number;
  lowFocusActivations: number;
  lastFocusScore: number;
}

function shortName(bundleId: string): string {
  const known: Record<string, string> = {
    "com.tinyspeck.slackmacgap": "Slack",
    "com.spotify.client": "Spotify",
    "com.hnc.Discord": "Discord",
    "com.apple.MobileSMS": "Messages",
    "com.apple.iChat": "Messages",
    "com.apple.TV": "Apple TV",
    "com.apple.Music": "Music",
    "us.zoom.xos": "Zoom",
    "com.microsoft.teams2": "Teams",
    "ru.keepcoder.Telegram": "Telegram",
    "com.google.Chrome": "Chrome",
    "com.apple.Safari": "Safari",
    "company.thebrowser.Browser": "Arc",
  };
  return known[bundleId] ?? bundleId.split(".").pop()?.replace(/([A-Z])/g, " $1").trim() ?? bundleId;
}

function barColor(score: number): string {
  if (score > 0.7) return "bg-red-500/70";
  if (score > 0.4) return "bg-amber-500/70";
  return "bg-emerald-500/70";
}

function labelColor(score: number): string {
  if (score > 0.7) return "text-red-400";
  if (score > 0.4) return "text-amber-400";
  return "text-emerald-400";
}

export function FrictionPanel() {
  const [rows, setRows] = useState<FrictionRow[]>([]);

  useEffect(() => {
    window.flowos?.frictionLeaderboard()
      .then((r) => setRows(r as FrictionRow[]))
      .catch(console.error);
  }, []);

  if (rows.length === 0) {
    return (
      <p className="text-[11px] text-white/25 text-center py-4 px-3">
        Distraction data builds as you use FlowOS.
      </p>
    );
  }

  return (
    <div className="px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 mb-2">
        Distraction Leaderboard
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.bundleId}
            className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] ring-1 ring-white/[0.06] px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-white truncate">{shortName(r.bundleId)}</p>
              <p className="text-[10px] text-white/30">{r.totalActivations} opens</p>
            </div>
            <div className="text-right shrink-0 w-10">
              <p className={`text-[12px] font-semibold ${labelColor(r.frictionScore)}`}>
                {Math.round(r.frictionScore * 100)}%
              </p>
            </div>
            <div className="w-14 h-1.5 rounded-full bg-white/[0.08] overflow-hidden shrink-0">
              <div
                className={`h-full rounded-full ${barColor(r.frictionScore)}`}
                style={{ width: `${r.frictionScore * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-white/20 mt-2 text-center">% of opens during low-focus periods</p>
    </div>
  );
}
