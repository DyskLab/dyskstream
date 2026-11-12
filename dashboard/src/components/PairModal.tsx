// Modal "Buka di HP": tampilkan QR berisi URL dashboard via IP LAN + kode login
// sekali pakai, supaya HP di WiFi yang sama bisa langsung masuk tanpa password.
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../api";
import { useLang, registerDict } from "../i18n";
import { Button } from "./ui";

registerDict({
  "📱 Buka di HP": "📱 Open on phone",
  "Scan QR ini pakai kamera HP. HP harus terhubung ke WiFi yang sama dengan PC ini.":
    "Scan this QR with your phone camera. The phone must be on the same Wi-Fi as this PC.",
  "Membuat QR…": "Generating QR…",
  "Berlaku {s} detik · sekali pakai": "Valid for {s}s · single use",
  "Kedaluwarsa — membuat QR baru…": "Expired — generating a new QR…",
  "🔄 QR baru": "🔄 New QR",
  "Alamat jaringan": "Network address",
  "Tidak ada alamat LAN yang terdeteksi. Pastikan PC terhubung ke WiFi/LAN.":
    "No LAN address detected. Make sure this PC is connected to Wi-Fi/LAN.",
  "⚠️ QR ini = kunci masuk dashboard. Jangan tampilkan di stream!":
    "⚠️ This QR is a key to your dashboard. Don't show it on stream!",
  "gagal membuat QR": "failed to generate QR",
});

interface Pair {
  code: string;
  expiresAt: number;
  addresses: string[];
}

export function PairModal({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const [pair, setPair] = useState<Pair | null>(null);
  const [ip, setIp] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const p = await api.createPair();
      setPair(p);
      setIp((cur) => (cur && p.addresses.includes(cur) ? cur : p.addresses[0] ?? null));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("gagal membuat QR"));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Detik mundur; kode kedaluwarsa → minta kode baru otomatis.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = pair ? Math.max(0, Math.ceil((pair.expiresAt - now) / 1000)) : 0;
  const expired = !!pair && left === 0;
  useEffect(() => {
    if (expired) refresh();
  }, [expired, refresh]);

  // Port ikut halaman yang sedang dibuka (4300 produksi, 4301 saat dev Vite).
  const url =
    pair && ip
      ? `${location.protocol}//${ip}${location.port ? `:${location.port}` : ""}/?pair=${pair.code}`
      : null;

  useEffect(() => {
    if (!url) {
      setQr(null);
      return;
    }
    let alive = true;
    QRCode.toDataURL(url, { width: 280, margin: 2, errorCorrectionLevel: "M" })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setErr(t("gagal membuat QR")));
    return () => {
      alive = false;
    };
  }, [url, t]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(0,0,0,.5)" }}
      onClick={onClose}
    >
      <div className="neo w-full max-w-sm mt-10" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}>
        <div
          className="flex items-center justify-between p-3"
          style={{ borderBottom: "3px solid #000", background: "var(--cyan)" }}
        >
          <span className="font-black text-lg">{t("📱 Buka di HP")}</span>
          <button className="font-black text-xl px-2 leading-none" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="p-4 text-center">
          <p className="text-sm mb-3">
            {t("Scan QR ini pakai kamera HP. HP harus terhubung ke WiFi yang sama dengan PC ini.")}
          </p>

          {err ? (
            <p className="text-sm font-bold" style={{ color: "var(--red)" }}>❌ {err}</p>
          ) : pair && pair.addresses.length === 0 ? (
            <p className="text-sm font-bold" style={{ color: "var(--red)" }}>
              {t("Tidak ada alamat LAN yang terdeteksi. Pastikan PC terhubung ke WiFi/LAN.")}
            </p>
          ) : qr && !expired ? (
            <img
              src={qr}
              alt="QR"
              width={280}
              height={280}
              className="mx-auto"
              style={{ border: "3px solid #000", imageRendering: "pixelated" }}
            />
          ) : (
            <div className="mx-auto grid place-items-center text-sm opacity-60" style={{ width: 280, height: 280, border: "3px dashed #000" }}>
              {expired ? t("Kedaluwarsa — membuat QR baru…") : t("Membuat QR…")}
            </div>
          )}

          {pair && !expired && qr && (
            <p className="text-xs font-bold mt-2">{t("Berlaku {s} detik · sekali pakai", { s: left })}</p>
          )}

          {pair && pair.addresses.length > 1 && (
            <div className="mt-3 text-left">
              <span className="block mb-1 font-extrabold text-xs uppercase">{t("Alamat jaringan")}</span>
              <div className="flex flex-wrap gap-2">
                {pair.addresses.map((a) => (
                  <button
                    key={a}
                    className="px-2 py-1 text-xs font-bold"
                    style={{ border: "2px solid #000", background: a === ip ? "var(--yellow)" : "#fff" }}
                    onClick={() => setIp(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {url && (
            <code className="block mt-3 text-[10px] break-all opacity-60 select-all">
              {url.replace(/\?pair=.*/, "")}
            </code>
          )}

          <p className="text-xs font-bold mt-3 p-2" style={{ background: "var(--yellow)", border: "2px solid #000" }}>
            {t("⚠️ QR ini = kunci masuk dashboard. Jangan tampilkan di stream!")}
          </p>

          <div className="mt-4 flex justify-center">
            <Button color="white" onClick={refresh}>
              {t("🔄 QR baru")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
