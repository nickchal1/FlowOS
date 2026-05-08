import { useEffect, useState } from "react";

interface HourlySlot {
  hour: number;
  energyScore: number;
  focusSecs: number;
  dayCount: number;
}

function fmtHour(h: number): string {
  if (h === 0)  return "12a";
  if (h < 12)   return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function cellBg(score: number, dayCount: number): string {
  if (dayCount === 0) return "bg-white/[0.04]";
  if (score >= 70)    return "bg-emerald-500/75";
  if (score >= 40)    return "bg-amber-500/65";
  if (score >= 15)    return "bg-red-500/45";
  return "bg-white/[0.06]";
}

export function EnergyHeatmap() {
  const [slots, setSlots] = useState<HourlySlot[]>([]);

  useEffect(() => {
    window.flowos?.energyCurve()
      .then((s) => setSlots(s as HourlySlot[]))
      .catch(console.error);
  }, []);

  const hasData = slots.some((s) => s.dayCount > 0);

  if (!hasData) {
    return (
      <p className="text-[11px] text-white/25 text-center py-4 px-3">
        Energy data builds after a few days of use.
      </p>
    );
  }

  // Show hours 7–22
  const visible = slots.filter((s) => s.hour >= 7 && s.hour <= 22);
  const peak = [...slots]
    .filter((s) => s.dayCount > 0)
    .sort((a, b) => b.energyScore - a.energyScore)
    .slice(0, 3);

  return (
    <div className="px-3 py-3 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">
        Energy Heatmap · 14-day avg
      </p>

      {/* Heatmap blocks */}
      <div className="flex gap-0.5 flex-wrap pb-4">
        {visible.map((slot) => (
          <div
            key={slot.hour}
            className={`relative rounded-sm ${cellBg(slot.energyScore, slot.dayCount)} shrink-0`}
            style={{ width: 17, height: 22 }}
            title={`${fmtHour(slot.hour)}: score ${slot.energyScore}`}
          >
            {slot.hour % 3 === 0 && (
              <span className="absolute -bottom-3.5 left-0 text-[8px] text-white/20 w-6 select-none">
                {fmtHour(slot.hour)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[9px] text-white/30">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/75 inline-block" />High</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/65 inline-block" />Mid</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/45 inline-block" />Low</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-white/[0.06] inline-block" />No data</span>
      </div>

      {/* Peak hours */}
      {peak.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 mb-1.5">
            Peak focus windows
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {peak.map((s) => (
              <span key={s.hour} className="text-[11px] bg-emerald-500/10 text-emerald-300 px-2.5 py-1 rounded-lg ring-1 ring-emerald-500/20">
                {fmtHour(s.hour)} · {s.energyScore}/100
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
