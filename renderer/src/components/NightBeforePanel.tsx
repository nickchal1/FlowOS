interface ScheduleItem {
  time: string;
  title: string;
  details: string;
  type: "meeting" | "deep_work" | "shallow" | "break";
}

interface CalendarEvent {
  title: string;
  startAt: string;
}

interface NightBeforeResult {
  tomorrowEvents: CalendarEvent[];
  schedule: ScheduleItem[];
  generatedAt: string;
}

interface Props {
  result: NightBeforeResult;
  onApprove: () => void;
  onDismiss: () => void;
}

const TYPE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  deep_work: { bg: "bg-indigo-500/15", text: "text-indigo-300", label: "Deep Work" },
  meeting:   { bg: "bg-blue-500/15",   text: "text-blue-300",   label: "Meeting"   },
  shallow:   { bg: "bg-amber-500/15",  text: "text-amber-300",  label: "Shallow"   },
  break:     { bg: "bg-emerald-500/15",text: "text-emerald-300",label: "Break"     },
};

export function NightBeforePanel({ result, onApprove, onDismiss }: Props) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowLabel = tomorrow.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#0c0c0e] rounded-[14px] overflow-hidden">
      <div className="h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-4 pb-2">
          <div>
            <p className="text-[15px] font-bold text-white">Tomorrow's Plan</p>
            <p className="text-[11px] text-white/35">{tomorrowLabel}</p>
          </div>
          <button onClick={onDismiss} className="text-[12px] text-white/20 hover:text-white/50 pt-0.5">✕</button>
        </div>

        {/* Calendar events */}
        {result.tomorrowEvents.length > 0 && (
          <div className="px-4 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-white/25 mb-1.5">Calendar</p>
            <div className="space-y-1">
              {result.tomorrowEvents.map((e, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-[10px] text-white/30 w-12 shrink-0">
                    {new Date(e.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="text-[11px] text-white/60 truncate">{e.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mx-4 h-px bg-white/[0.06] my-2" />

        {/* AI Schedule */}
        <div className="px-4 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.10em] text-white/25 mb-2">AI Schedule</p>
          {result.schedule.length === 0 ? (
            <p className="text-[11px] text-white/30">No schedule generated. Try again.</p>
          ) : (
            <div className="space-y-1.5">
              {result.schedule.map((item, i) => {
                const style = TYPE_STYLE[item.type] ?? TYPE_STYLE.shallow!;
                return (
                  <div key={i} className="flex gap-2 items-start rounded-lg bg-white/[0.03] px-2.5 py-2">
                    <span className="text-[10px] text-white/30 w-14 shrink-0 pt-0.5">{item.time}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white font-medium">{item.title}</p>
                      {item.details && (
                        <p className="text-[10px] text-white/35 mt-0.5 leading-snug">{item.details}</p>
                      )}
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md shrink-0 ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Approve button */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <button
          onClick={onApprove}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-bold transition-colors"
        >
          Approve — prep Mac for first task
        </button>
      </div>
    </div>
  );
}
