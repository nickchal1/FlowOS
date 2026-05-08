import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  notes: string | null;
  calendarName: string;
}

export async function getTodayEvents(): Promise<CalendarEvent[]> {
  return getEventsForDate(new Date());
}

export async function getTomorrowEvents(): Promise<CalendarEvent[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getEventsForDate(tomorrow);
}

async function getEventsForDate(date: Date): Promise<CalendarEvent[]> {
  const year  = date.getFullYear();
  const month = date.getMonth() + 1;
  const day   = date.getDate();

  // AppleScript: query Calendar.app for events on the given date
  const script = `
set targetYear to ${year}
set targetMonth to ${month}
set targetDay to ${day}
set output to ""
tell application "Calendar"
  try
    repeat with aCal in calendars
      set calName to name of aCal
      set allEvents to every event of aCal
      repeat with anEvt in allEvents
        try
          set evtStart to start date of anEvt
          set startYear to year of evtStart
          set startMonth to month of evtStart as integer
          set startDay to day of evtStart
          if startYear = targetYear and startMonth = targetMonth and startDay = targetDay then
            set evtTitle to summary of anEvt
            set evtEnd to end date of anEvt
            set uid to uid of anEvt
            try
              set evtLoc to location of anEvt
            on error
              set evtLoc to ""
            end try
            set startStr to (startYear as string) & "-" & (startMonth as string) & "-" & (startDay as string) & " " & (hours of evtStart as string) & ":" & (minutes of evtStart as string)
            set endYear to year of evtEnd
            set endMonth to month of evtEnd as integer
            set endDay to day of evtEnd
            set endStr to (endYear as string) & "-" & (endMonth as string) & "-" & (endDay as string) & " " & (hours of evtEnd as string) & ":" & (minutes of evtEnd as string)
            set output to output & uid & "|||" & evtTitle & "|||" & startStr & "|||" & endStr & "|||" & evtLoc & "|||" & calName & "\n"
          end if
        end try
      end repeat
    end repeat
  end try
end tell
return output
`;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 10000 });
    return parseOutput(stdout, year, month, day);
  } catch {
    return [];
  }
}

function parseOutput(raw: string, year: number, month: number, day: number): CalendarEvent[] {
  return raw
    .split("\n")
    .filter((line) => line.includes("|||"))
    .map((line, idx) => {
      const parts = line.split("|||");
      if (parts.length < 6) return null;
      const [id, title, startStr, endStr, location, calendarName] = parts;
      if (!title?.trim()) return null;
      try {
        // Pad month/day for ISO parsing
        const pad = (n: string) => n.trim().padStart(2, "0");
        const toIso = (s: string) => {
          const [datePart, timePart] = s.trim().split(" ");
          const [y, m, d] = (datePart ?? "").split("-");
          const [h, min] = (timePart ?? "0:0").split(":");
          return `${y}-${pad(m ?? "1")}-${pad(d ?? "1")}T${pad(h ?? "0")}:${pad(min ?? "0")}:00`;
        };
        return {
          id: id?.trim() || `evt-${year}${month}${day}-${idx}`,
          title: title.trim(),
          startAt: toIso(startStr ?? ""),
          endAt: toIso(endStr ?? ""),
          location: location?.trim() || null,
          notes: null,
          calendarName: calendarName?.trim() ?? "Calendar",
        };
      } catch {
        return null;
      }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
