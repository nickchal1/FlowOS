import { getTomorrowEvents, type CalendarEvent } from "./calendarService.js";

const DEFAULT_TRIGGER_HOUR = 21; // 9 PM

export interface ScheduleItem {
  time: string;
  title: string;
  details: string;
  type: "meeting" | "deep_work" | "shallow" | "break";
}

export interface NightBeforeResult {
  tomorrowEvents: CalendarEvent[];
  schedule: ScheduleItem[];
  generatedAt: string;
}

interface NightBeforeOptions {
  triggerHour?: number;
  apiKey: string;
  model: string;
  onScheduleReady: (result: NightBeforeResult) => void;
}

export interface NightBeforeService {
  start(): void;
  stop(): void;
  triggerNow(): Promise<void>;
}

export function createNightBeforeService(options: NightBeforeOptions): NightBeforeService {
  const triggerHour = options.triggerHour ?? DEFAULT_TRIGGER_HOUR;
  let timer: NodeJS.Timeout | null = null;
  let lastFiredDate = "";

  async function checkAndFire(): Promise<void> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (now.getHours() === triggerHour && lastFiredDate !== today) {
      lastFiredDate = today;
      await generate();
    }
  }

  async function generate(): Promise<void> {
    const events = await getTomorrowEvents();
    const schedule = await generateSchedule(events, options.apiKey, options.model);
    options.onScheduleReady({
      tomorrowEvents: events,
      schedule,
      generatedAt: new Date().toISOString(),
    });
  }

  function start(): void {
    timer = setInterval(() => { void checkAndFire(); }, 60_000);
  }

  function stop(): void {
    if (timer) { clearInterval(timer); timer = null; }
  }

  async function triggerNow(): Promise<void> {
    await generate();
  }

  return { start, stop, triggerNow };
}

async function generateSchedule(events: CalendarEvent[], apiKey: string, model: string): Promise<ScheduleItem[]> {
  if (!apiKey) return [];

  const eventSummary = events.length > 0
    ? events.map((e) => `- ${new Date(e.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}: ${e.title}${e.location ? ` @ ${e.location}` : ""}`).join("\n")
    : "No meetings scheduled";

  const prompt = `You are a productivity assistant. Given tomorrow's calendar, create an optimized schedule.

Tomorrow's calendar:
${eventSummary}

Create a focused schedule with 5–8 items. Include deep work blocks (before first meeting if possible), prep time before important meetings, breaks, and shallow work for admin tasks.

Respond with a JSON array only — no explanation, no markdown:
[{"time":"9:00 AM","title":"...","details":"...","type":"deep_work"}]

Valid types: deep_work, meeting, shallow, break`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
        temperature: 0.4,
      }),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message.content ?? "[]";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]) as ScheduleItem[];
  } catch {
    return [];
  }
}
