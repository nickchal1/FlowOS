import { app, BrowserWindow, session } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const windowModuleDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = resolve(windowModuleDir, "../preload.cjs");

export function createMainWindow(options?: { show?: boolean }) {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });

  const mainWindow = new BrowserWindow({
    width: 340,
    height: 420,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    show: options?.show ?? false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  if (app.isPackaged) {
    void mainWindow.loadFile(join(app.getAppPath(), "renderer/dist/index.html"));
  } else {
    void mainWindow.loadURL(process.env.FLOWOS_RENDERER_URL ?? "http://127.0.0.1:5173");
  }

  return mainWindow;
}
