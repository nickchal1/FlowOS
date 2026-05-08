interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  location: string | null;
}

interface Props {
  event: CalendarEvent;
  minsUntil: number;
  onDismiss: () => void;
  onEnterFocus: () => void;
}

export function PrepBanner({ event, minsUntil, onDismiss, onEnterFocus }: Props) {
  const startTime = new Date(event.startAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mx-3 mt-2 p-3 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/25">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <p className="text-[11px] text-blue-300 font-semibold">
              Starts in {minsUntil} min · {startTime}
            </p>
          </div>
          <p className="text-[13px] font-semibold text-white truncate">{event.title}</p>
          {event.location && (
            <p className="text-[10px] text-white/35 truncate mt-0.5">{event.location}</p>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-[11px] text-white/20 hover:text-white/50 shrink-0 pt-0.5"
        >
          ✕
        </button>
      </div>
      <button
        onClick={onEnterFocus}
        className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition-colors"
      >
        Enter Prep Mode — close distractions
      </button>
    </div>
  );
}
