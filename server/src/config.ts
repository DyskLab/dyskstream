// Konfigurasi dari environment (dengan default aman untuk dev).
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(__dirname, "..");

function envStr(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.length > 0 ? v : fallback;
}

export const config = {
  port: Number(envStr("PORT", "4300")),
  host: envStr("HOST", "0.0.0.0"),
  dbPath: resolve(serverRoot, envStr("DB_PATH", "./data.sqlite")),
  uploadDir: resolve(serverRoot, envStr("UPLOAD_DIR", "./uploads")),
  // Bisa di-override (dipakai aplikasi desktop: aset ada di folder resources).
  overlayDir: resolve(serverRoot, envStr("OVERLAY_DIR", "../overlay")),
  publicDir: resolve(serverRoot, envStr("PUBLIC_DIR", "../public")),
  dashboardDir: resolve(serverRoot, envStr("DASHBOARD_DIR", "../dashboard/dist")),
  /** Kalau di-set, log ditulis ke file ini (tanpa pino-pretty) — untuk build ter-bundle. */
  logFile: process.env.LOG_FILE || null,
  adminPassword: envStr("ADMIN_PASSWORD", "admin"),
  get usingDefaultPassword(): boolean {
    return !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length === 0;
  },
};
