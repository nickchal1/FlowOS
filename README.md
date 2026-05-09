# FlowOS — your Mac's AI focus copilot

> Talk to your menu bar. Watch your desktop snap into place. And never lose an hour to distraction again.

FlowOS lives as a small icon in your macOS menu bar. Press **⌘⇧K**, speak a command, and it moves windows, groups Chrome tabs, and switches focus layouts — in seconds. But it does a lot more than window management now: it watches your app-switch patterns, reads your calendar, scores your focus in real time, and steps in before you lose the hour.

---

## What It Does

### Voice-driven desktop control
Hit **⌘⇧K** from anywhere on macOS, speak your request, hit **⌘⇧K** again to send. OpenAI Whisper transcribes, an agent loop plans against a live snapshot of every window and tab, and the Swift helper + Chrome extension execute it.

Commands that work today:
- *"Switch to coding mode"* → IDE fills the left, terminal snaps right, Slack/Spotify/Chrome close
- *"Move Chrome to my second display and group all my tabs by category"* → relocates Chrome, topic-groups 30+ tabs
- *"Split screen my two most recently used apps"* → reads the tracking buffer, picks the right two, tiles them
- *"Open 5 tabs to help me learn dynamic programming"* → opens and groups them in a new window

### Three Focus Modes
| Mode | What happens |
|------|-------------|
| **Coding** | IDE + terminal split-screen, everything else minimized |
| **Research** | Chrome + notes app side-by-side, distractors gone |
| **Auto** | Reads your recent activity and runs the right playbook |

### Spiral Detection *(Pro)*
FlowOS watches your app switches in a 10-minute sliding window. The moment you've bounced between Slack → Twitter → Spotify → Slack four times, an alert fires — not after an hour, after four switches. One click locks focus for 30 minutes and closes every distraction.

### Night Before Mode *(Pro)*
Every evening at 9 PM, FlowOS reads tomorrow's Apple Calendar, sends it to AI, and generates a prioritized schedule — deep work blocks before meetings, prep time built in. You review and approve. Takes 20 seconds.

### Pre-Mortem Alarm *(Pro)*
FlowOS polls your Apple Calendar every 5 minutes. When a meeting is 45 minutes away, a prep banner appears. One click closes distractions and opens whatever you need for that meeting.

### Energy Heatmap *(Pro)*
Records your app-switch count and focus duration by hour of day. After a week of use, it shows you exactly when you're sharpest — so you can schedule deep work there and stop fighting your own biology.

### Commitment Contracts *(Pro)*
Before a focus session, set one goal. After you stop, FlowOS asks: did you finish it? Tracks your completion streak over time.

### Friction Scoring *(Pro)*
Every time you open an app, FlowOS records what your focus score was at that moment. Over time it builds a distraction leaderboard — the apps that most reliably pull you out of flow, ranked.

### Context Capsule
Save your full work state — every window position, every Chrome tab, the active layout — as a named snapshot. Restore it later with one click. Works like a "save game" for your desktop.

### Deep Work Guardian
A real-time focus score (0–100) in the menu bar, computed from how fast you're switching apps. Drops below a threshold and you get an alert before the spiral starts.

### VS Code Integration
Bidirectional control via 9 AI tools over WebSocket — open files, run commands, read diagnostics, all triggerable by voice.

### Analytics Tab
Weekly focus stats, session history, friction leaderboard, and energy heatmap — all local, all yours.

---

## Requirements

- macOS 13 Ventura or later (Apple Silicon or Intel)
- Node.js 20+ and npm
- Swift toolchain (`xcode-select --install`)
- Google Chrome (for the browser-control extension)
- OpenAI API key with access to `gpt-4o` or newer + Whisper

---

## Installation

### Option A — Run from source (development)

**1. Clone and install**
```bash
git clone https://github.com/<you>/FlowOS.git
cd FlowOS
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
```
Fill in your key:
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
FLOWOS_WS_PORT=7331
```

**3. Build the Swift helper**
```bash
npm run build:swift-helper
```
Produces `swift-helper/.build/debug/FlowStateHelper`. If you skip this, Electron falls back to `swift run` on first launch — slower but works.

**4. Load the Chrome extension**
```bash
npm run build --workspace @flowos/extension-chrome
```
Then in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `extension-chrome/dist/`.

**5. Launch**
```bash
npm run dev
```

---

### Option B — Build a distributable .app

```bash
npm run dist:mac:arm64    # Apple Silicon
npm run dist:mac:x64      # Intel
npm run dist:mac          # both (universal)
```

Output lands in `release/`. Open the `.dmg`, drag FlowOS to Applications. First launch: right-click → Open to bypass the unverified developer warning (only needed once).

**Note on API key in the packaged app:** the `.env` file is not bundled. Set your key in your shell profile so macOS inherits it:
```bash
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.zshrc
```

---

## Setup Notes

### Menu bar icon not appearing?
The terminal or IDE you launched from controls whether FlowOS shows in the menu bar. Open **System Settings → Allow in the Menu Bar** and make sure your terminal is toggled on. Bartender / Hidden Bar users: check your hiding rules.

### Multiple monitors
Align your displays on the same horizontal axis in **System Settings → Displays → Arrange**. FlowOS uses macOS global screen coordinates — misaligned displays cause windows to land outside the visible area.

### Typecheck / test
```bash
npm run typecheck        # full repo
npm run test --workspace @flowos/electron   # 144 unit tests
```

---

## Architecture

```
FlowOS/
├── electron/          Main process — IPC, agent loop, Swift bridge,
│                      tracking, analytics, all services
├── renderer/          React + Vite UI — 340×420px frameless popover
├── swift-helper/      Native macOS binary — AXUIElement window control
├── extension-chrome/  Manifest V3 — tabs/groups via WebSocket
├── shared/            TypeScript contracts shared across packages
├── db/                SQLite schema + query helpers (better-sqlite3)
└── website/           Landing page (Astro + Tailwind)
```

**Data flow:**
1. Voice or button → Whisper → OpenAI agent loop (≤20 iterations)
2. Agent calls tools → Electron dispatches to Swift helper (JSON-RPC stdio) or Chrome extension (WebSocket)
3. Results flow back as tool_result messages → agent continues or returns summary
4. All sessions, events, focus scores, commitments, morning plans stored locally in SQLite at `~/Library/Application Support/FlowOS/flowos.db`

**Services running in the background:**
| Service | What it does |
|---------|-------------|
| `focusScoreService` | Scores app-switch frequency every 60s |
| `spiralDetectorService` | 10-min sliding window, 3-switch threshold |
| `prepModeService` | Polls Apple Calendar every 5 min |
| `nightBeforeService` | Fires at 9 PM, generates tomorrow's schedule |
| `contextTriggerService` | 8s debounce on app.activated, suggests layouts |
| `energyCurveService` | Records hourly activity to SQLite |

---

## Built With

- **Electron 36** — main process, IPC via `contextBridge`, frameless transparent popover
- **React 18 + Vite** — renderer UI
- **TypeScript strict** — everywhere
- **Swift 5** — native helper using `AXUIElement`, `NSScreen`, CoreGraphics
- **better-sqlite3** — local SQLite for all persistence
- **OpenAI GPT-4o** — agent loop + night before scheduling
- **OpenAI Whisper** — speech-to-text
- **Chrome Extension (Manifest V3)** — tabs, tabGroups, windows APIs
- **WebSocket (`ws`)** — Electron ↔ extensions event bus
- **JSON-RPC over stdio** — Electron ↔ Swift helper
- **Astro + Tailwind** — marketing website
- **electron-builder** — macOS packaging + DMG

---

## Demo

[![Watch the FlowOS demo](https://img.youtube.com/vi/h011ZfVjL3E/maxresdefault.jpg)](https://youtu.be/h011ZfVjL3E)

![FlowOS architecture diagram](assets/architecture.png)
