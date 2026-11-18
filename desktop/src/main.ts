// Main process aplikasi desktop: nyalakan server Fastify (ter-bundle) di dalam
// aplikasi, lalu tampilkan dashboard di jendela sendiri + ikon tray.
//
// Server tetap mendengarkan di 0.0.0.0 supaya OBS (Browser Source) dan HP (QR
// "Buka di HP") bisa mengakses http://<ip>:4300 seperti versi non-desktop.
import { app, BrowserWindow, Tray, Menu, shell, clipboard, dialog, nativeImage } from "electron";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const APP_NAME = "DyskStream";

interface DesktopSettings {
  port: number;
  adminPassword: string;
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let settings: DesktopSettings;

// ---- Lokasi file ----
// Paket: aset ada di folder resources (extraResources, di luar asar supaya
// @fastify/static membaca file asli). Dev (`npm start`): langsung dari repo.
const appRoot = app.getAppPath(); // desktop/ saat dev, .../app.asar saat dipaket
const resDir = app.isPackaged ? process.resourcesPath : join(appRoot, "..");
const assetDir = app.isPackaged ? join(process.resourcesPath, "assets") : join(appRoot, "assets");
// DYSKSTREAM_DATA_DIR (atau SA_DATA_DIR lama): folder data alternatif (uji coba / mode portable).
// Instalasi dari sebelum ganti nama (Streaming Assistant) tetap memakai folder datanya yang lama.
const legacyDataDir = join(app.getPath("appData"), "Streaming Assistant");
const dataDir = process.env.DYSKSTREAM_DATA_DIR || process.env.SA_DATA_DIR || (existsSync(legacyDataDir) ? legacyDataDir : app.getPath("userData"));

const paths = {
  overlay: join(resDir, "overlay"),
  public: join(resDir, "public"),
  dashboard: app.isPackaged ? join(resDir, "dashboard") : join(resDir, "dashboard", "dist"),
  server: join(appRoot, "build", "server.mjs"),
  settings: join(dataDir, "desktop.json"),
  db: join(dataDir, "data.sqlite"),
  uploads: join(dataDir, "uploads"),
  log: join(dataDir, "server.log"),
};

/** Password admin acak dibuat sekali saat pertama jalan (bukan default "admin",
 *  karena server terbuka di jaringan lokal). Jendela aplikasi login otomatis. */
function loadSettings(): DesktopSettings {
  mkdirSync(dataDir, { recursive: true });
  let s: Partial<DesktopSettings> = {};
  try {
    s = JSON.parse(readFileSync(paths.settings, "utf8"));
  } catch {
    /* belum ada → buat baru */
  }
  const out: DesktopSettings = {
    port: Number(s.port) > 0 ? Number(s.port) : 4300,
    adminPassword:
      typeof s.adminPassword === "string" && s.adminPassword.length >= 6
        ? s.adminPassword
        : randomBytes(9).toString("base64url"),
  };
  writeFileSync(paths.settings, JSON.stringify(out, null, 2));
  return out;
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => srv.close(() => resolve(true)))
      .listen(port, "0.0.0.0");
  });
}

async function waitHealthy(base: string, timeoutMs = 20000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server tidak merespons");
}

async function startServer(): Promise<void> {
  mkdirSync(paths.uploads, { recursive: true });
  Object.assign(process.env, {
    PORT: String(settings.port),
    HOST: "0.0.0.0",
    ADMIN_PASSWORD: settings.adminPassword,
    DB_PATH: paths.db,
    UPLOAD_DIR: paths.uploads,
    OVERLAY_DIR: paths.overlay,
    PUBLIC_DIR: paths.public,
    DASHBOARD_DIR: paths.dashboard,
    LOG_FILE: paths.log,
  });
  // Server dijalankan in-process: impor modul = bootstrap + listen.
  await import(pathToFileURL(paths.server).href);
}

/** Login dengan password lokal lalu pakai kode pairing (fitur QR yang sama)
 *  supaya jendela langsung masuk tanpa mengetik password. */
async function dashboardUrl(base: string): Promise<string> {
  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: settings.adminPassword }),
    });
    const { token } = (await login.json()) as { token: string };
    const pair = await fetch(`${base}/api/auth/pair`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const { code } = (await pair.json()) as { code: string };
    // Logout token sementara ini; sesi jendela memakai token hasil pairing.
    void fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    return `${base}/?pair=${code}`;
  } catch {
    return `${base}/`; // jatuh ke halaman login biasa
  }
}

function base(): string {
  return `http://127.0.0.1:${settings.port}`;
}

async function showWindow(): Promise<void> {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 420,
    minHeight: 500,
    title: APP_NAME,
    icon: join(assetDir, "icon.png"),
    backgroundColor: "#fff4e0",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Link ke tab baru (preview overlay, YouTube, dll) → browser bawaan sistem.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  // Tutup jendela = sembunyikan ke tray; server tetap jalan untuk OBS.
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  win.on("closed", () => {
    win = null;
  });
  await win.loadURL(await dashboardUrl(base()));
}

function createTray(): void {
  // macOS: template image (hitam + transparan) → otomatis putih di menu bar gelap.
  // Nama berakhiran "Template" + file @2x dideteksi Electron. Windows: ikon berwarna.
  const file = process.platform === "darwin" ? "trayTemplate.png" : "tray.png";
  const img = nativeImage.createFromPath(join(assetDir, file));
  tray = new Tray(img);
  tray.setToolTip(`${APP_NAME} — port ${settings.port}`);
  const menu = Menu.buildFromTemplate([
    { label: "Buka Dashboard", click: () => void showWindow() },
    { label: "Buka di Browser", click: () => void shell.openExternal(`http://localhost:${settings.port}/`) },
    { type: "separator" },
    {
      label: "Salin URL Overlay Alert (OBS)",
      click: () => clipboard.writeText(`http://localhost:${settings.port}/overlay/`),
    },
    { label: "Salin Password Admin", click: () => clipboard.writeText(settings.adminPassword) },
    { label: "Buka Folder Data", click: () => void shell.openPath(dataDir) },
    { type: "separator" },
    {
      label: "Keluar",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  // Windows: klik kiri ikon tray membuka jendela.
  tray.on("click", () => void showWindow());
}

async function boot(): Promise<void> {
  settings = loadSettings();

  if (!(await portFree(settings.port))) {
    dialog.showErrorBox(
      APP_NAME,
      `Port ${settings.port} sedang dipakai program lain (mungkin server DyskStream ` +
        `versi terminal masih jalan). Tutup program itu lalu buka aplikasi ini lagi.\n\n` +
        `Port bisa diubah di:\n${paths.settings}`,
    );
    app.exit(1);
    return;
  }

  try {
    await startServer();
    await waitHealthy(base());
  } catch (e) {
    dialog.showErrorBox(
      APP_NAME,
      `Server gagal menyala: ${e instanceof Error ? e.message : String(e)}\n\nLog: ${paths.log}`,
    );
    app.exit(1);
    return;
  }

  createTray();
  await showWindow();
}

// Satu instance saja: buka aplikasi lagi = fokuskan jendela yang ada.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName(APP_NAME);
  app.on("second-instance", () => void showWindow());
  app.on("activate", () => void showWindow()); // macOS: klik ikon dock
  app.on("before-quit", () => {
    quitting = true;
  });
  // Jendela ditutup ≠ keluar: server tetap melayani overlay OBS.
  app.on("window-all-closed", () => {});
  app.whenReady().then(boot);
}
