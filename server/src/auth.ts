// Auth sederhana untuk satu streamer: login password → token sesi.
// Token disimpan di DB (tabel sessions) supaya TAHAN restart server.
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
/** Umur kode pairing QR (login dari HP). Pendek karena QR = kunci masuk. */
export const PAIR_TTL_MS = 2 * 60 * 1000;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export class Auth {
  private tokens = new Set<string>();
  /** Kode pairing sekali pakai → waktu kedaluwarsa. Sengaja di memori saja. */
  private pairCodes = new Map<string, number>();

  constructor(
    private readonly db: DatabaseSync,
    private readonly password: string,
  ) {
    // Bersihkan sesi lama, lalu muat sesi yang masih berlaku ke memori.
    this.db
      .prepare("DELETE FROM sessions WHERE created_at < ?")
      .run(Date.now() - THIRTY_DAYS);
    const rows = this.db.prepare("SELECT token FROM sessions").all() as {
      token: string;
    }[];
    for (const r of rows) this.tokens.add(r.token);
  }

  /** Verifikasi password → keluarkan token, atau null bila salah. */
  login(password: string): string | null {
    if (!safeEqual(password, this.password)) return null;
    return this.issue();
  }

  /** Buat kode pairing untuk QR (hanya dipanggil oleh admin yang sudah login). */
  createPairCode(now = Date.now()): { code: string; expiresAt: number } {
    for (const [c, exp] of this.pairCodes) if (exp <= now) this.pairCodes.delete(c);
    const code = randomUUID().replace(/-/g, "");
    const expiresAt = now + PAIR_TTL_MS;
    this.pairCodes.set(code, expiresAt);
    return { code, expiresAt };
  }

  /** Tukar kode pairing → token sesi. Kode langsung hangus (sekali pakai). */
  redeemPairCode(code: string, now = Date.now()): string | null {
    const exp = this.pairCodes.get(code);
    if (exp === undefined) return null;
    this.pairCodes.delete(code);
    if (exp <= now) return null;
    return this.issue();
  }

  private issue(): string {
    const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
    this.tokens.add(token);
    this.db
      .prepare("INSERT INTO sessions(token, created_at) VALUES(?, ?)")
      .run(token, Date.now());
    return token;
  }

  valid(token: string | undefined): boolean {
    return !!token && this.tokens.has(token);
  }

  logout(token: string | undefined): void {
    if (!token) return;
    this.tokens.delete(token);
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
}

/** Ambil token dari header Authorization: Bearer <token>. */
export function bearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m?.[1];
}
