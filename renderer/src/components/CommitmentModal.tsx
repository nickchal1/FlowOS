import { useState } from "react";

interface Props {
  mode: "goal" | "resolve";
  goalText?: string;
  commitmentId?: string;
  onGoalSet: (text: string, id: string) => void;
  onResolved: (completed: boolean) => void;
  onDismiss: () => void;
}

export function CommitmentModal({ mode, goalText, onGoalSet, onResolved, onDismiss }: Props) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSetGoal() {
    const text = input.trim();
    if (!text) return;
    setSaving(true);
    try {
      const id = await window.flowos?.commitmentSave(text);
      if (id) onGoalSet(text, id as string);
    } finally {
      setSaving(false);
    }
  }

  if (mode === "resolve") {
    return (
      <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/70 rounded-[14px]">
        <div className="bg-[#0c0c0e] rounded-t-[14px] p-4 space-y-3 border-t border-white/[0.08]">
          <p className="text-[13px] font-bold text-white">Session complete</p>
          {goalText && (
            <div className="rounded-lg bg-white/[0.05] px-3 py-2 ring-1 ring-white/[0.08]">
              <p className="text-[11px] text-white/60 italic">"{goalText}"</p>
            </div>
          )}
          <p className="text-[12px] text-white/50">Did you complete your goal?</p>
          <div className="flex gap-2">
            <button
              onClick={() => onResolved(true)}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-bold transition-colors"
            >
              Yes ✓
            </button>
            <button
              onClick={() => onResolved(false)}
              className="flex-1 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white/60 text-[12px] transition-colors"
            >
              Not quite
            </button>
          </div>
          <button onClick={onDismiss} className="w-full py-1 text-[10px] text-white/20 hover:text-white/40">
            Skip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/70 rounded-[14px]">
      <div className="bg-[#0c0c0e] rounded-t-[14px] p-4 space-y-3 border-t border-white/[0.08]">
        <p className="text-[13px] font-bold text-white">What's your goal for this session?</p>
        <p className="text-[11px] text-white/35">Hold yourself accountable — FlowOS will check in when you stop.</p>
        <input
          autoFocus
          className="w-full bg-white/[0.06] ring-1 ring-white/[0.10] rounded-xl px-3 py-2.5 text-[12px] text-white placeholder:text-white/25 focus:outline-none focus:ring-indigo-500/60"
          placeholder="e.g. Finish the auth PR review"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void handleSetGoal(); }}
        />
        <div className="flex gap-2">
          <button
            disabled={saving || !input.trim()}
            onClick={() => void handleSetGoal()}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[12px] font-bold transition-colors"
          >
            {saving ? "Saving…" : "Set Goal"}
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-2.5 rounded-xl bg-white/[0.06] text-white/40 text-[12px] hover:text-white/60"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
