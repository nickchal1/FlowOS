import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, net, globalShortcut, screen } from "electron";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { ensureDatabase } from "@flowos/db";
import { startSession, endSession } from "./services/sessionStore.js";
import { isLocalSttConfigured } from "./services/localSttConfig.js";
import { transcribeWebmAudio } from "./services/localStt.js";
import { saveLayout, listLayouts, getLayout, deleteLayout } from "./services/layoutStore.js";
import { recordFocusEvent, upsertDailyStat, getWeeklyRollup, getDailyStats } from "./services/analyticsStore.js";
import { createContextTriggerService, type ContextTriggerService } from "./services/contextTriggerService.js";
import { getActiveLicense, saveLicense, removeLicense, validateLicenseKey } from "./services/licenseStore.js";
import { saveCapsule, listCapsules, getCapsule, deleteCapsule, type CapsuleVscodeState, type CapsuleChromTab, type CapsuleWindowFrame } from "./services/capsuleStore.js";
import { createFocusScoreService, type FocusScoreService } from "./services/focusScoreService.js";
import { createSpiralDetectorService, type SpiralDetectorService } from "./services/spiralDetectorService.js";
import { categorizeApp } from "./services/workStyleAnalyzer.js";
import { getFrictionLeaderboard, recordAppActivation } from "./services/frictionStore.js";
import { createPrepModeService, type PrepModeService } from "./services/prepModeService.js";
import { getTodayEvents } from "./services/calendarService.js";
import { getEnergyCurve, recordHourlyCommand, recordHourlySwitch } from "./services/energyCurveService.js";
import { createNightBeforeService, type NightBeforeService } from "./services/nightBeforeService.js";
import {
  demoSuggestions,
  demoTaskState,
  type ChromeCommand,
  type ChromeCommandPayloadMap,
  type ChromeCommandResultMap,
  type ChromeSnapshot,
  type VscodeCommand,
  type VscodeCommandPayloadMap,
  type VscodeCommandResultMap,
  type VscodeSnapshot,
  type Suggestion,
  type TaskState,
  type TaskSignal
} from "@flowos/shared";
import { ipcChannels } from "./ipc/channels.js";
import { createRealtimeServer, type RealtimeServerHandle } from "./realtime/server.js";
import { startSwiftHelperBridge, type SwiftHelperStatus } from "./bridge/swiftHelper.js";
import { startElectronObservationService } from "./telemetry/electronObservationService.js";
import { startNativeHelperTelemetry } from "./telemetry/nativeHelperTelemetry.js";
import {
  OpenAIFlowOrchestrator,
  type FlowMode,
  type FlowRunResult
} from "./services/openaiFlowOrchestrator.js";
import { loadDotEnv } from "./services/loadEnv.js";
import { TrackingSession } from "./services/trackingSession.js";
import {
  createPersistentMemoryStore,
  type PersistentMemoryStore
} from "./services/persistentMemoryStore.js";
import { createMainWindow } from "./windows/browserWindows.js";
import { createChromeHistoryStore, type ChromeHistoryStore } from "./realtime/chromeHistoryStore.js";
import { createChromeEditor, type ChromeEditor } from "./actions/chromeEditor.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
loadDotEnv(repoRoot);
const port = Number(process.env.FLOWOS_WS_PORT ?? "7331");

let taskState: TaskState = demoTaskState;
let suggestions: Suggestion[] = demoSuggestions;
let mainWindow: Electron.BrowserWindow | null = null;
let observationService: Awaited<ReturnType<typeof startElectronObservationService>> | null = null;
let nativeHelperBridge: Awaited<ReturnType<typeof startSwiftHelperBridge>> | null = null;
let nativeHelperTelemetry: Awaited<ReturnType<typeof startNativeHelperTelemetry>> | null = null;
let realtimeServer: RealtimeServerHandle | null = null;
let menuBarTray: Tray | null = null;
let chromeEditor: ChromeEditor | null = null;
let chromeHistoryStore: ChromeHistoryStore | null = null;
let persistentMemoryStore: PersistentMemoryStore | null = null;
let latestChromeSnapshot: ChromeSnapshot | null = null;
let latestVscodeSnapshot: VscodeSnapshot | null = null;
let swiftHelperStatus: SwiftHelperStatus = {
  connected: false,
  transport: "stdio",
  command: []
};
const trackingSession = new TrackingSession();
let db: ReturnType<typeof ensureDatabase> | null = null;
let activeSessionId: string | null = null;
let activeFlowMode: "coding" | "research" | "auto" | null = null;
let trackingStartedAt: number | null = null;
let triggerService: ContextTriggerService | null = null;
let licenseActivationInProgress = false;
let focusScoreService: FocusScoreService | null = null;
let spiralDetector: SpiralDetectorService | null = null;
let prepModeService: PrepModeService | null = null;
let nightBeforeService: NightBeforeService | null = null;
let lastFlowRun: FlowRunResult | null = null;
let flowModeStatus: "idle" | "running" | "completed" | "failed" = "idle";
const GLOBAL_MIC_SHORTCUT = "CommandOrControl+Shift+K";

async function bootstrap() {
  const dbPath = process.env.FLOWOS_DB_PATH?.trim() || join(app.getPath("userData"), "flowos.db");
  db = ensureDatabase(dbPath);

  const authToken = process.env.FLOWOS_EXTENSION_TOKEN?.trim();
  const memoryFilePath =
    process.env.FLOWOS_MEMORY_PATH?.trim() || join(app.getPath("desktop"), "flowos-memory.md");
  persistentMemoryStore = await createPersistentMemoryStore(memoryFilePath);
  appendMemoryEntry("flowos.bootstrap", "FlowOS app bootstrap completed.", {
    websocketPort: port,
    memoryFilePath
  });

  chromeHistoryStore = await createChromeHistoryStore(
    join(app.getPath("userData"), "chrome-snapshots.jsonl")
  );
  latestChromeSnapshot = chromeHistoryStore.getLatest();

  realtimeServer = createRealtimeServer(port, {
    authToken,
    onChromeSnapshot: (snapshot) => {
      latestChromeSnapshot = snapshot;
      void chromeHistoryStore?.append(snapshot);
      refreshTaskStateFromSignals();
      broadcastStateUpdate();
    },
    onVscodeSnapshot: (snapshot) => {
      latestVscodeSnapshot = snapshot;
    }
  });

  chromeEditor = createChromeEditor(async (command, payload) => {
    if (!realtimeServer) {
      throw new Error("Realtime server not initialized");
    }

    return await realtimeServer.requestChromeCommand(command, payload);
  });

  observationService = await startElectronObservationService({ trackingSession });
  nativeHelperBridge = await startSwiftHelperBridge();
  swiftHelperStatus = nativeHelperBridge.getStatus();

  triggerService = createContextTriggerService({
    debounceMs: 8000,
    onSuggestion: (suggestion) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send("trigger:suggestion", suggestion);
      }
    },
  });

  focusScoreService = createFocusScoreService({
    onScoreUpdate: ({ score }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send("focus:score", { score });
      }
      // Update menu bar title with focus indicator
      if (menuBarTray) {
        if (score >= 70) {
          menuBarTray.setTitle("FlowOS");
        } else if (score >= 40) {
          menuBarTray.setTitle("FlowOS ·");
        } else {
          menuBarTray.setTitle("FlowOS ··");
        }
      }
    },
    onFragmentationAlert: () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send("focus:alert");
      }
    },
  });

  spiralDetector = createSpiralDetectorService({
    onSpiralDetected: (event) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send(ipcChannels.spiralDetected, event);
      }
      if (db) {
        db.prepare(`
          INSERT INTO spiral_events (id, triggered_at, app_sequence, action_taken)
          VALUES (?, ?, ?, NULL)
        `).run(randomUUID(), event.triggeredAt, JSON.stringify(event.appSequence));
      }
    },
  });

  prepModeService = createPrepModeService({
    onPrepTriggered: (event, minsUntil) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send(ipcChannels.prepActive, { event, minsUntil });
      }
    },
  });
  prepModeService.start();

  nightBeforeService = createNightBeforeService({
    apiKey: process.env["OPENAI_API_KEY"] ?? "",
    model: process.env["OPENAI_MODEL"] ?? "gpt-4o-mini",
    onScheduleReady: (result) => {
      if (db) {
        db.prepare(`
          INSERT OR REPLACE INTO morning_plans (id, plan_date, events_json, schedule_json, approved, created_at)
          VALUES (?, ?, ?, ?, 0, ?)
        `).run(
          randomUUID(),
          new Date(result.generatedAt).toISOString().slice(0, 10),
          JSON.stringify(result.tomorrowEvents),
          JSON.stringify(result.schedule),
          result.generatedAt
        );
      }
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send(ipcChannels.nightBeforeReady, result);
      }
    },
  });
  nightBeforeService.start();

  nativeHelperBridge.onEvent((event) => {
    if (event.event === "helper.ready") {
      swiftHelperStatus = nativeHelperBridge?.getStatus() ?? swiftHelperStatus;
    }

    trackingSession.record(event);

    if (event.event === "app.activated") {
      const bundleId = (event.payload as { app?: { bundleId?: string } }).app?.bundleId ?? "";
      const appName  = (event.payload as { app?: { name?: string } }).app?.name ?? "";
      const effectiveId = bundleId || appName; // guard against empty primary key
      focusScoreService?.recordSwitch(bundleId);
      // Spiral detection only fires during active tracking sessions
      if (trackingSession.getState().isTracking) {
        spiralDetector?.recordSwitch(bundleId, categorizeApp(bundleId));
      }
      if (db && effectiveId) {
        const currentScore = focusScoreService?.getScore() ?? 50;
        // Use service functions to keep threshold logic in one place
        recordAppActivation(db, effectiveId, currentScore);
        recordHourlySwitch(db);
      }
      if (trackingSession.getState().isTracking) {
        triggerService?.onAppActivated(bundleId, trackingSession.getState().recentEvents);
      }
    }
  });
  nativeHelperTelemetry = await startNativeHelperTelemetry(nativeHelperBridge);
  const flowOrchestrator = new OpenAIFlowOrchestrator({
    bridge: nativeHelperBridge,
    trackingSession,
    getChromeSnapshot: () => latestChromeSnapshot,
    getVscodeSnapshot: () => latestVscodeSnapshot,
    runChromeCommand,
    runVscodeCommand,
    getMemory: () => persistentMemoryStore?.getSnapshot().recentEntries ?? [],
    saveLayout: (name, mode, windows) => {
      if (!db) throw new Error("Database not initialized");
      return saveLayout(db, name, mode, windows as Parameters<typeof saveLayout>[3]);
    },
    listLayouts: () => {
      if (!db) return [];
      return listLayouts(db);
    },
    getLayout: (id) => {
      if (!db) return undefined;
      return getLayout(db, id);
    }
  });

  const runEnterFlowMode = async (mode: FlowMode) => {
    flowModeStatus = "running";
    appendMemoryEntry("flow.mode.start", `Entered flow mode run (${mode}).`, { mode });
    refreshMenuBar();

    try {
      const result = await flowOrchestrator.enterFlowMode(mode);
      lastFlowRun = result;
      flowModeStatus = result.ok ? "completed" : "failed";
      if (result.ok) {
        const appsActedOn = [...new Set(result.toolCalls.map((t) => t.input["bundleId"] ?? t.input["windowId"]).filter(Boolean))];
        appendMemoryEntry(
          "flow.mode.completed",
          `${mode} mode: ${result.summary}`,
          { mode, model: result.model, appsActedOn, toolCallCount: result.toolCalls.length }
        );
      } else {
        appendMemoryEntry("flow.mode.failed", result.summary, { mode });
      }
      if (result.errorCode === "tracking-required") {
        void dialog.showMessageBox({
          type: "warning",
          title: "Tracking required",
          message: "Tracking required",
          detail: result.summary,
          buttons: ["OK"],
          defaultId: 0
        });
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastFlowRun = {
        ok: false,
        summary: message,
        model: process.env.OPENAI_MODEL ?? null,
        snapshotTimestamp: null,
        toolCalls: [],
        toolResults: []
      };
      flowModeStatus = "failed";
      appendMemoryEntry("flow.mode.failed", message, { mode });
      return lastFlowRun;
    } finally {
      refreshMenuBar();
    }
  };

  const startTracking = () => {
    const tracking = trackingSession.start();
    if (db && !activeSessionId) {
      activeSessionId = startSession(db, "general");
      trackingStartedAt = Date.now();
    }
    refreshMenuBar();
    return tracking;
  };

  ipcMain.handle(ipcChannels.getBootstrapState, () => ({
    taskState,
    suggestions,
    websocketPort: port,
    swiftHelper: swiftHelperStatus,
    tracking: trackingSession.getState(),
    flow: {
      status: flowModeStatus,
      lastRun: lastFlowRun
    },
    memory: persistentMemoryStore?.getSnapshot() ?? null,
    realtimeClients: realtimeServer?.getConnectedClients() ?? [],
    chrome: {
      latestSnapshot: latestChromeSnapshot,
      historyPreview: chromeHistoryStore?.getRecent(5) ?? []
    }
  }));

  ipcMain.handle(ipcChannels.showWindow, () => {
    const win = ensureBackgroundWindow();
    win.show();
    win.focus();
  });

  ipcMain.handle(ipcChannels.hideWindow, () => {
    mainWindow?.hide();
  });

  ipcMain.handle(ipcChannels.startTracking, () => {
    return startTracking();
  });

  ipcMain.handle(ipcChannels.stopTracking, () => {
    const result = trackingSession.stop();
    if (db && activeSessionId) {
      if (activeSessionId && activeFlowMode) {
        recordFocusEvent(db, { sessionId: activeSessionId, kind: "mode_exit", app: null, payload: null });
      }
      if (trackingStartedAt) {
        const focusSecs = Math.round((Date.now() - trackingStartedAt) / 1000);
        const date = new Date().toISOString().slice(0, 10);
        const half = Math.round(focusSecs / 2);
        upsertDailyStat(db, date, {
          totalFocusSecs: focusSecs,
          codingSecs: activeFlowMode === "coding" ? focusSecs : activeFlowMode === "auto" ? half : 0,
          researchSecs: activeFlowMode === "research" ? focusSecs : activeFlowMode === "auto" ? focusSecs - half : 0,
          commandsRun: 0,
          sessionsCount: 1,
        });
        trackingStartedAt = null;
      }
      endSession(db, activeSessionId);
      activeSessionId = null;
      activeFlowMode = null;
      triggerService?.setActiveMode(null);
      spiralDetector?.setPaused(false);
    }
    refreshMenuBar();
    return result;
  });

  ipcMain.handle(ipcChannels.enterFlowMode, async (_event, payload: { mode?: FlowMode } | undefined) => {
    const requested = payload?.mode;
    const mode: FlowMode = requested === "research" || requested === "auto" ? requested : "coding";
    const result = await runEnterFlowMode(mode);
    if (result.ok) {
      activeFlowMode = mode;
      triggerService?.setActiveMode(mode);
      spiralDetector?.setPaused(true);
      if (db && activeSessionId) {
        recordFocusEvent(db, { sessionId: activeSessionId, kind: "mode_enter", app: null, payload: JSON.stringify({ mode }) });
      }
    }
    return result;
  });

  ipcMain.handle(ipcChannels.runVoiceCommand, async (_event, transcript: string) => {
    appendMemoryEntry("voice.command.start", `Voice command started: "${transcript}"`);
    const result = await flowOrchestrator.runVoiceCommand(transcript);
    appendMemoryEntry(
      result.ok ? "voice.command.completed" : "voice.command.failed",
      result.summary,
      {
        transcript,
        model: result.model,
        snapshotTimestamp: result.snapshotTimestamp,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults
      }
    );
    if (result.ok && db && activeSessionId) {
      recordFocusEvent(db, { sessionId: activeSessionId, kind: "command_run", app: null, payload: JSON.stringify({ transcript: transcript.slice(0, 100) }) });
      upsertDailyStat(db, new Date().toISOString().slice(0, 10), { totalFocusSecs: 0, codingSecs: 0, researchSecs: 0, commandsRun: 1, sessionsCount: 0 });
      recordHourlyCommand(db);
    }
    return result;
  });

  ipcMain.handle(ipcChannels.transcribeAudio, async (_event, audioData: Uint8Array) => {
    if (isLocalSttConfigured()) {
      return await transcribeWebmAudio(audioData);
    }

    const apiKey = process.env["OPENAI_API_KEY"]?.trim();
    if (!apiKey) {
      throw new Error(
        "No transcription backend configured. Either set OPENAI_API_KEY for cloud STT, or set FLOWOS_WHISPER_BIN and FLOWOS_WHISPER_MODEL for local STT."
      );
    }

    const form = new FormData();
    const audioBuffer = audioData.buffer.slice(
      audioData.byteOffset,
      audioData.byteOffset + audioData.byteLength
    ) as ArrayBuffer;
    form.append("model", "whisper-1");
    form.append("file", new Blob([audioBuffer], { type: "audio/webm" }), "recording.webm");

    const response = await net.fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Whisper error ${response.status}: ${text}`);
    }

    const data = await response.json() as { text: string };
    return data.text.trim();
  });

  ipcMain.handle(ipcChannels.runChromeCommand, async (_event, request: ChromeCommandInvocation) => {
    return await runChromeCommand(request.command, request.payload);
  });

  ipcMain.handle(ipcChannels.listLayouts, () => {
    if (!db) return [];
    return listLayouts(db);
  });

  ipcMain.handle(ipcChannels.saveLayout, (_event, payload: { name: string; mode: string; windows: unknown[] }) => {
    if (!db) throw new Error("Database not initialized");
    if (typeof payload.name !== "string" || !payload.name.trim()) throw new Error("name must be a non-empty string");
    if (typeof payload.mode !== "string" || !payload.mode.trim()) throw new Error("mode must be a non-empty string");
    if (!Array.isArray(payload.windows)) throw new Error("windows must be an array");
    return saveLayout(db, payload.name, payload.mode, payload.windows as Parameters<typeof saveLayout>[3]);
  });

  ipcMain.handle(ipcChannels.deleteLayout, (_event, id: string) => {
    if (!db) throw new Error("Database not initialized");
    deleteLayout(db, id);
  });

  ipcMain.handle(ipcChannels.recallLayout, async (_event, id: string) => {
    if (!db) throw new Error("Database not initialized");
    const layout = getLayout(db, id);
    if (!layout) throw new Error(`No layout found with id ${id}`);
    return flowOrchestrator.applyLayoutFrames(layout.config);
  });

  ipcMain.handle(ipcChannels.analyticsWeekly, () => {
    if (!db) return null;
    return {
      rollup: getWeeklyRollup(db),
      days: getDailyStats(db, 7),
    };
  });

  ipcMain.handle(ipcChannels.licenseGet, () => {
    if (!db) return null;
    return getActiveLicense(db) ?? null;
  });

  ipcMain.handle(ipcChannels.licenseActivate, async (_event, key: string) => {
    if (!db) throw new Error("DB not ready");
    if (licenseActivationInProgress) throw new Error("Activation already in progress");
    const trimmed = key.trim();
    if (!trimmed) throw new Error("License key is required");
    licenseActivationInProgress = true;
    try {
      const result = await validateLicenseKey(trimmed, { firstActivation: true });
      if (!result.valid) throw new Error("Invalid license key");
      const license = {
        key: trimmed,
        email: result.email ?? null,
        plan: result.plan ?? "pro",
        activated_at: new Date().toISOString(),
        expires_at: result.expires_at ?? null,
      };
      saveLicense(db, license);
      return license;
    } finally {
      licenseActivationInProgress = false;
    }
  });

  ipcMain.handle(ipcChannels.licenseDeactivate, () => {
    if (!db) return;
    removeLicense(db);
  });

  ipcMain.handle(ipcChannels.frictionLeaderboard, () => {
    if (!db) return [];
    return getFrictionLeaderboard(db, 10);
  });

  ipcMain.handle(ipcChannels.energyCurve, () => {
    if (!db) return [];
    return getEnergyCurve(db, 14);
  });

  ipcMain.handle(ipcChannels.commitmentSave, (_event, goalText: string) => {
    if (!db || !goalText.trim()) return null;
    const id = randomUUID();
    db.prepare(`
      INSERT INTO commitments (id, session_id, goal_text, completed, created_at)
      VALUES (?, ?, ?, NULL, ?)
    `).run(id, activeSessionId, goalText.trim(), new Date().toISOString());
    return id;
  });

  ipcMain.handle(ipcChannels.commitmentResolve, (_event, id: string, completed: boolean) => {
    if (!db) return;
    db.prepare(`
      UPDATE commitments SET completed = ?, resolved_at = ? WHERE id = ?
    `).run(completed ? 1 : 0, new Date().toISOString(), id);
  });

  ipcMain.handle(ipcChannels.commitmentStats, () => {
    if (!db) return { total: 0, completed: 0, streak: 0, hitRate: 0, recentGoals: [] };
    const total     = (db.prepare("SELECT COUNT(*) as n FROM commitments WHERE completed IS NOT NULL").get() as { n: number }).n;
    const completed = (db.prepare("SELECT COUNT(*) as n FROM commitments WHERE completed = 1").get() as { n: number }).n;
    const recent    = db.prepare("SELECT * FROM commitments ORDER BY created_at DESC LIMIT 10").all() as Array<{
      id: string; goal_text: string; completed: number | null; created_at: string;
    }>;
    let streak = 0;
    for (const r of recent) {
      if (r.completed === null) continue;
      if (r.completed === 1) streak++;
      else break;
    }
    return {
      total,
      completed,
      streak,
      hitRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      recentGoals: recent,
    };
  });

  ipcMain.handle(ipcChannels.calendarToday, async () => {
    return getTodayEvents();
  });

  ipcMain.handle(ipcChannels.nightBeforeTrigger, async () => {
    await nightBeforeService?.triggerNow();
  });

  ipcMain.handle(ipcChannels.nightBeforeApprove, (_event, planId: string) => {
    if (!db) return;
    if (planId === "latest") {
      db.prepare("UPDATE morning_plans SET approved = 1 WHERE id = (SELECT id FROM morning_plans ORDER BY created_at DESC LIMIT 1)").run();
    } else {
      db.prepare("UPDATE morning_plans SET approved = 1 WHERE id = ?").run(planId);
    }
  });

  ipcMain.handle(ipcChannels.prepDismiss, () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(ipcChannels.prepActive, null);
    }
  });

  ipcMain.handle(ipcChannels.spiralResolve, async (_event, action: "dismiss" | "close_distractors" | "locked") => {
    if (db) {
      db.prepare(`
        UPDATE spiral_events SET action_taken = ?
        WHERE id = (SELECT id FROM spiral_events ORDER BY triggered_at DESC LIMIT 1)
      `).run(action);
    }
    if (action === "close_distractors" || action === "locked") {
      return runEnterFlowMode("coding");
    }
  });

  ipcMain.handle(ipcChannels.capsuleList, () => {
    if (!db) return [];
    return listCapsules(db);
  });

  ipcMain.handle(ipcChannels.capsuleDelete, (_event, id: string) => {
    if (!db) return;
    deleteCapsule(db, id);
  });

  ipcMain.handle(ipcChannels.capsuleSave, async (_event, name: string) => {
    if (!db) throw new Error("DB not ready");

    // Capture VS Code state
    let vscode: CapsuleVscodeState | null = null;
    if (latestVscodeSnapshot) {
      vscode = {
        activeFile: latestVscodeSnapshot.activeFile,
        activeLine: latestVscodeSnapshot.activeLine,
        openTabs: latestVscodeSnapshot.openTabs ?? [],
        workspaceRoot: latestVscodeSnapshot.workspaceRoot,
      };
    }

    // Capture Chrome tabs (exclude incognito, keep non-discarded)
    const chrome: CapsuleChromTab[] = (latestChromeSnapshot?.tabs ?? [])
      .filter((t) => !t.incognito && !t.discarded && t.url && !t.url.startsWith("chrome://"))
      .map((t) => ({ url: t.url, title: t.title, pinned: t.pinned, active: t.active }));

    // Capture window positions from Swift bridge
    let windows: CapsuleWindowFrame[] = [];
    try {
      const snapshot = await nativeHelperBridge?.request("system.snapshot", {}) as { windows?: Array<{ windowId: string; appName: string; bundleId: string; x: number; y: number; width: number; height: number }> } | null;
      windows = (snapshot?.windows ?? [])
        .filter((w) => w.width > 100 && w.height > 100)
        .map((w) => ({ windowId: w.windowId, appName: w.appName, bundleId: w.bundleId, x: w.x, y: w.y, width: w.width, height: w.height }));
    } catch {
      // Window capture is best-effort
    }

    return saveCapsule(db, name.trim() || `Capsule ${new Date().toLocaleDateString()}`, vscode, chrome, windows);
  });

  ipcMain.handle(ipcChannels.capsuleRestore, async (_event, id: string) => {
    if (!db) throw new Error("DB not ready");
    const capsule = getCapsule(db, id);
    if (!capsule) throw new Error("Capsule not found");

    const results: string[] = [];

    // Restore VS Code active file
    if (capsule.vscode?.activeFile && realtimeServer) {
      try {
        await realtimeServer.requestVscodeCommand("vscode.file.open", {
          path: capsule.vscode.activeFile,
          line: capsule.vscode.activeLine ?? 1,
        });
        results.push(`VS Code: opened ${capsule.vscode.activeFile}`);
      } catch {
        results.push("VS Code: not connected");
      }
    }

    // Restore Chrome tabs
    if (capsule.chrome.length > 0 && realtimeServer) {
      let opened = 0;
      for (const tab of capsule.chrome) {
        try {
          await realtimeServer.requestChromeCommand("chrome.tab.open", { url: tab.url, active: tab.active, pinned: tab.pinned });
          opened++;
        } catch {
          break; // Chrome not connected
        }
      }
      if (opened > 0) results.push(`Chrome: opened ${opened} tabs`);
    }

    // Restore window positions
    if (capsule.windows.length > 0) {
      try {
        await flowOrchestrator.applyLayoutFrames(capsule.windows);
        results.push(`Windows: restored ${capsule.windows.length} positions`);
      } catch {
        results.push("Windows: restore failed");
      }
    }

    return { ok: true, results };
  });

  function ensureBackgroundWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow({ show: false });
      mainWindow.on("blur", () => {
        mainWindow?.hide();
      });
    }

    return mainWindow;
  }

  function sendTrayAction(action: "toggle-mic") {
    const backgroundWindow = ensureBackgroundWindow();
    if (backgroundWindow.webContents.isLoadingMainFrame()) {
      backgroundWindow.webContents.once("did-finish-load", () => {
        if (!backgroundWindow.isDestroyed()) {
          backgroundWindow.webContents.send(ipcChannels.trayAction, { action });
        }
      });
      return;
    }

    backgroundWindow.webContents.send(ipcChannels.trayAction, { action });
  }

  function registerGlobalShortcuts() {
    globalShortcut.unregisterAll();
    const registered = globalShortcut.register(GLOBAL_MIC_SHORTCUT, () => {
      sendTrayAction("toggle-mic");
    });

    if (!registered) {
      console.error(`[flowos][shortcut] failed to register ${GLOBAL_MIC_SHORTCUT}`);
    }
  }

  function buildMenuBarMenu() {
    return Menu.buildFromTemplate([
      {
        label: trackingSession.getState().isTracking ? "Tracking Active" : "Start Tracking",
        enabled: !trackingSession.getState().isTracking,
        click: () => {
          startTracking();
        }
      },
      {
        label: flowModeStatus === "running" ? "Entering Flow State..." : "Enter Flow State",
        enabled: flowModeStatus !== "running",
        submenu: [
          {
            label: "Coding Mode",
            enabled: flowModeStatus !== "running",
            click: () => {
              void runEnterFlowMode("coding");
            }
          },
          {
            label: "Research Mode",
            enabled: flowModeStatus !== "running",
            click: () => {
              void runEnterFlowMode("research");
            }
          },
          {
            label: trackingSession.getState().isTracking
              ? "Auto (from tracking)"
              : "Auto (requires tracking)",
            enabled: flowModeStatus !== "running",
            click: () => {
              void runEnterFlowMode("auto");
            }
          }
        ]
      },
      {
        label: "Toggle Mic",
        click: () => {
          sendTrayAction("toggle-mic");
        }
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit();
        }
      }
    ]);
  }

  function togglePopover(trayBounds?: Electron.Rectangle) {
    const win = ensureBackgroundWindow();
    if (win.isVisible()) {
      win.hide();
      return;
    }
    if (trayBounds) {
      const [winWidthRaw] = win.getSize();
      const winWidth = winWidthRaw ?? 340;
      const { workAreaSize } = screen.getPrimaryDisplay();
      const x = Math.max(0, Math.min(
        Math.round(trayBounds.x + trayBounds.width / 2 - winWidth / 2),
        workAreaSize.width - winWidth
      ));
      const y = Math.round(trayBounds.y + trayBounds.height + 2);
      win.setPosition(x, y, false);
    }
    win.show();
    win.focus();
  }

  function refreshMenuBar() {
    if (process.platform !== "darwin") {
      return;
    }

    if (!menuBarTray) {
      menuBarTray = new Tray(nativeImage.createEmpty());
      menuBarTray.setTitle("FlowOS");
      menuBarTray.setToolTip("FlowOS");
      menuBarTray.on("click", (_event, bounds) => {
        togglePopover(bounds);
      });
      menuBarTray.on("right-click", () => {
        menuBarTray?.popUpContextMenu(buildMenuBarMenu());
      });
    }
  }

  refreshMenuBar();
  ensureBackgroundWindow();
  registerGlobalShortcuts();
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.setActivationPolicy("accessory");
  }
  void bootstrap();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && process.platform !== "darwin") {
    mainWindow = createMainWindow({ show: true });
  }
});

app.on("before-quit", () => {
  if (db && activeSessionId) {
    if (activeFlowMode) {
      recordFocusEvent(db, { sessionId: activeSessionId, kind: "mode_exit", app: null, payload: null });
    }
    if (trackingStartedAt) {
      const focusSecs = Math.round((Date.now() - trackingStartedAt) / 1000);
      const date = new Date().toISOString().slice(0, 10);
      const half = Math.round(focusSecs / 2);
      upsertDailyStat(db, date, {
        totalFocusSecs: focusSecs,
        codingSecs: activeFlowMode === "coding" ? focusSecs : activeFlowMode === "auto" ? half : 0,
        researchSecs: activeFlowMode === "research" ? focusSecs : activeFlowMode === "auto" ? focusSecs - half : 0,
        commandsRun: 0,
        sessionsCount: 1,
      });
    }
    endSession(db, activeSessionId);
    activeSessionId = null;
    activeFlowMode = null;
    trackingStartedAt = null;
  }
  triggerService?.dispose();
  triggerService = null;
  focusScoreService?.dispose();
  focusScoreService = null;
  spiralDetector?.dispose();
  spiralDetector = null;
  prepModeService?.stop();
  prepModeService = null;
  nightBeforeService?.stop();
  nightBeforeService = null;
  globalShortcut.unregisterAll();
  menuBarTray?.destroy();
  menuBarTray = null;
  realtimeServer?.stop();
  nativeHelperTelemetry?.stop();
  nativeHelperBridge?.stop();
  observationService?.stop();
  db?.close();
});

type ChromeCommandInvocation<C extends ChromeCommand = ChromeCommand> = {
  command: C;
  payload: ChromeCommandPayloadMap[C];
};

async function runChromeCommand<C extends ChromeCommand>(
  command: C,
  payload: ChromeCommandPayloadMap[C]
): Promise<ChromeCommandResultMap[C]> {
  if (!chromeEditor) {
    throw new Error("Chrome editor not initialized");
  }

  let result: ChromeCommandResultMap[C];
  switch (command) {
    case "chrome.tab.focus":
      result = (await chromeEditor.focusTab(
        (payload as ChromeCommandPayloadMap["chrome.tab.focus"]).tabId
      )) as ChromeCommandResultMap[C];
      break;
    case "chrome.tabs.group":
      result = (await chromeEditor.groupTabs(
        payload as ChromeCommandPayloadMap["chrome.tabs.group"]
      )) as ChromeCommandResultMap[C];
      break;
    case "chrome.tabs.ungroup":
      result = (await chromeEditor.ungroupTabs(
        (payload as ChromeCommandPayloadMap["chrome.tabs.ungroup"]).tabIds
      )) as ChromeCommandResultMap[C];
      break;
    case "chrome.tab.pin":
      result = (await chromeEditor.pinTab(
        (payload as ChromeCommandPayloadMap["chrome.tab.pin"]).tabId,
        (payload as ChromeCommandPayloadMap["chrome.tab.pin"]).pinned
      )) as ChromeCommandResultMap[C];
      break;
    case "chrome.tabs.close":
      result = (await chromeEditor.closeTabs(
        (payload as ChromeCommandPayloadMap["chrome.tabs.close"]).tabIds
      )) as ChromeCommandResultMap[C];
      break;
    case "chrome.tab.open":
      result = (await chromeEditor.openTab(
        payload as ChromeCommandPayloadMap["chrome.tab.open"]
      )) as ChromeCommandResultMap[C];
      break;
    default:
      throw new Error(`Unsupported chrome command: ${String(command)}`);
  }

  return result;
}

async function runVscodeCommand<C extends VscodeCommand>(
  command: C,
  payload: VscodeCommandPayloadMap[C]
): Promise<VscodeCommandResultMap[C]> {
  if (!realtimeServer) throw new Error("Realtime server not initialized");
  return realtimeServer.requestVscodeCommand(command, payload);
}

function refreshTaskStateFromSignals() {
  const signals: TaskSignal[] = [];

  if (latestChromeSnapshot) {
    const activeTab = latestChromeSnapshot.tabs.find((tab) => tab.active);
    if (activeTab) {
      signals.push({
        source: "chrome-extension",
        label: "Active tab",
        value: activeTab.title || activeTab.url,
        weight: 0.72
      });
    }
  }

  if (signals.length === 0) {
    return;
  }

  taskState = {
    ...taskState,
    updatedAt: new Date().toISOString(),
    signals
  };
}

function broadcastStateUpdate() {
  const payload = {
    taskState,
    suggestions
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(ipcChannels.stateUpdated, payload);
  }
}

function appendMemoryEntry(title: string, summary: string, data?: unknown) {
  if (!persistentMemoryStore) {
    return;
  }

  void persistentMemoryStore.appendEntry({ title, summary, data }).catch((error) => {
    console.error("[flowos][memory] failed to append entry", error);
  });
}
