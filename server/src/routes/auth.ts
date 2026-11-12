// Route auth: login / check / logout.
import { networkInterfaces } from "node:os";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Auth, bearer } from "../auth.ts";

const loginSchema = z.object({ password: z.string().min(1) });
const pairSchema = z.object({ code: z.string().min(1).max(64) });

/** IPv4 LAN mesin ini (untuk QR). Alamat privat 192.168/10/172.16-31 didahulukan. */
function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      out.push(a.address);
    }
  }
  const rank = (ip: string) =>
    ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
  return [...new Set(out)].sort((a, b) => rank(a) - rank(b));
}

export function authRoutes(app: FastifyInstance, deps: { auth: Auth }): void {
  app.post("/api/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "password wajib diisi" });

    const token = deps.auth.login(parsed.data.password);
    if (!token) return reply.code(401).send({ error: "password salah" });
    return { token };
  });

  // Endpoint ini dilewati guard hanya bila token valid (guard global),
  // jadi kalau sampai sini berarti sudah terautentikasi.
  app.get("/api/auth/check", async () => ({ ok: true }));

  // QR login HP: admin (sudah login) minta kode → HP menukar kode jadi token.
  app.post("/api/auth/pair", async () => ({
    ...deps.auth.createPairCode(),
    addresses: lanAddresses(),
  }));

  // Publik (dikecualikan di guard): HP belum punya token saat memanggil ini.
  app.post("/api/auth/pair/redeem", async (req, reply) => {
    const parsed = pairSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "kode wajib diisi" });
    const token = deps.auth.redeemPairCode(parsed.data.code);
    if (!token) return reply.code(401).send({ error: "kode QR tidak valid atau kedaluwarsa" });
    return { token };
  });

  app.post("/api/auth/logout", async (req) => {
    deps.auth.logout(bearer(req.headers.authorization));
    return { ok: true };
  });
}
