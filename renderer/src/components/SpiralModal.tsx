interface SpiralEvent {
  triggeredAt: string;
  appSequence: string[];
}

interface Props {
  event: SpiralEvent;
  onDismiss: () => void;
  onCloseDistractors: () => void;
  onLock: () => void;
}

const APP_NAMES: Record<string, string> = {
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
};

function appLabel(bundleId: string): string {
  return APP_NAMES[bundleId] ?? bundleId.split(".").pop()?.replace(/([A-Z])/g, " $1").trim() ?? bundleId;
}

export function SpiralModal({ event, onDismiss, onCloseDistractors, onLock }: Props) {
  const unique = [...new Set(event.appSequence)];
  const count = event.appSequence.length;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#0c0c0e] rounded-[14px] overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-orange-500 via-red-500 to-orange-500 animate-pulse" />

      <div className="flex flex-col flex-1 px-4 py-5 justify-between">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-bold text-white">You're spiraling</p>
              <p className="text-[11px] text-white/40">Repeated distractions detected</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {unique.map((id) => (
              <span key={id} className="text-[11px] bg-red-500/10 text-red-300 px-2.5 py-1 rounded-lg ring-1 ring-red-500/20">
                {appLabel(id)}
              </span>
            ))}
          </div>

          <p className="text-[12px] text-white/50 leading-relaxed">
            You've switched to distracting apps <span className="text-white font-semibold">{count}×</span> in the last 10 minutes.
          </p>
        </div>

        <div className="space-y-2 pt-4">
          <button
            onClick={onLock}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold transition-colors"
          >
            Lock Focus — close distractions for 30 min
          </button>
          <button
            onClick={onCloseDistractors}
            className="w-full py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.10] text-white text-[12px] font-medium transition-colors"
          >
            Close distractions now
          </button>
          <button
            onClick={onDismiss}
            className="w-full py-2 text-[11px] text-white/25 hover:text-white/50 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
