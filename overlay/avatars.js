// Overlay avatar penonton: tiap penonton yang chat muncul sebagai karakter blob
// yang jalan-jalan di bawah layar, menampilkan chat-nya di balon, dan bereaksi
// pada command (!lompat, !joget, !duel @nama, ...). Murni visual — tidak memotong
// point. Sambung WS sebagai role "chat" (event chat di-broadcast ke semua role).
//
// Param URL: ?max=40 &idle=600 (detik) &scale=1 &floor=0 (px dari bawah)
//            &bubble=0 (matikan balon chat) &names=0 (sembunyikan nama) &demo=1
//            &type=blob|kotak|campur (tipe karakter default; penonton bisa ganti via !karakter)
(() => {
  "use strict";

  const q = new URLSearchParams(location.search);
  const num = (k, d, min, max) => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
  };
  const CFG = {
    max: num("max", 40, 1, 150),
    idleMs: num("idle", 600, 30, 7200) * 1000,
    scale: num("scale", 1, 0.4, 3),
    floor: num("floor", 0, 0, 1000),
    bubbles: q.get("bubble") !== "0",
    names: q.get("names") !== "0",
    demo: q.get("demo") === "1",
    type: ["blob", "kotak", "campur"].includes(q.get("type")) ? q.get("type") : "blob",
  };

  const S = CFG.scale;
  const SIZE = 64 * S;
  const GRAV = 2400 * S;
  document.documentElement.style.setProperty("--s", String(S));
  if (!CFG.names) document.body.classList.add("no-names");

  const stage = document.getElementById("stage");
  const connEl = document.getElementById("conn");
  stage.style.bottom = CFG.floor + "px";

  // ---- Utilitas ----
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cleanName = (s) => String(s || "").replace(/^@+/, "").trim();
  const clampX = (x) => Math.min(window.innerWidth - SIZE / 2, Math.max(SIZE / 2, x));
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Warna bisa diganti penonton lewat !warna <nama>. Nama ID + EN.
  const COLORS = {
    pink: "#ff5c8a",
    kuning: "#ffde00", yellow: "#ffde00",
    biru: "#4dd4ff", blue: "#4dd4ff",
    hijau: "#7ae582", green: "#7ae582",
    ungu: "#b28dff", purple: "#b28dff",
    oranye: "#ff9f43", orange: "#ff9f43",
    merah: "#ff4d4d", red: "#ff4d4d",
    tosca: "#2ee6c5", teal: "#2ee6c5",
    coklat: "#c08552", brown: "#c08552",
    putih: "#f4f4f4", white: "#f4f4f4",
    hitam: "#3a3a3a", black: "#3a3a3a",
  };
  const BASE_COLORS = ["#ff5c8a", "#ffde00", "#4dd4ff", "#7ae582", "#b28dff", "#ff9f43", "#2ee6c5", "#ff4d4d"];

  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* OBS tanpa storage → abaikan */
      }
    },
  };

  // ---- Gambar karakter (SVG, viewBox 64×84 dengan ruang topi di atas) ----
  // Bentuk tubuh: top = puncak kepala, eye = tinggi mata.
  const SHAPES = [
    { d: "M8 60 C8 36 18 26 32 26 C46 26 56 36 56 60 C56 72 48 76 32 76 C16 76 8 72 8 60 Z", top: 26, eye: 48 },
    { d: "M14 58 C14 32 22 22 32 22 C42 22 50 32 50 58 C50 72 44 76 32 76 C20 76 14 72 14 58 Z", top: 22, eye: 44 },
    { d: "M4 62 C4 44 16 34 32 34 C48 34 60 44 60 62 C60 73 50 76 32 76 C14 76 4 73 4 62 Z", top: 34, eye: 54 },
  ];

  function accessory(kind, t) {
    const o = 'stroke="#000" stroke-width="3" stroke-linejoin="round"';
    switch (kind) {
      case "crown": // host
        return `<path d="M19 ${t + 3} L21 ${t - 10} L27 ${t - 3} L32 ${t - 13} L37 ${t - 3} L43 ${t - 10} L45 ${t + 3} Z" fill="#ffde00" ${o}/>`;
      case "cap": // moderator
        return `<path d="M17 ${t + 6} Q32 ${t - 12} 47 ${t + 6} Z" fill="#2f6bff" ${o}/><path d="M44 ${t + 5} L56 ${t + 6}" stroke="#000" stroke-width="4" stroke-linecap="round"/>`;
      case "party": // member
        return `<path d="M24 ${t + 4} L32 ${t - 16} L40 ${t + 4} Z" fill="#7ae582" ${o}/><circle cx="32" cy="${t - 17}" r="3.5" fill="#ff5c8a" ${o.replace("3", "2")}/>`;
      case "sprout":
        return `<path d="M32 ${t + 2} Q31 ${t - 6} 34 ${t - 10}" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/><ellipse cx="39" cy="${t - 11}" rx="6" ry="3.5" transform="rotate(-25 39 ${t - 11})" fill="#7ae582" ${o.replace("3", "2.5")}/>`;
      case "antenna":
        return `<path d="M32 ${t + 2} L32 ${t - 10}" stroke="#000" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="${t - 12}" r="4" fill="#ffde00" ${o.replace("3", "2.5")}/>`;
      default:
        return "";
    }
  }

  // ---- Tipe "kotak": karakter pixel blok (grid 4px di viewBox 64×84) ----
  const SKIN = ["#ffdbac", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"];
  const HAIR = ["#3b2219", "#111111", "#a55728", "#e8c25b", "#8a8a8a", "#ff5c8a", "#4dd4ff"];
  const PANTS = ["#2f3a8f", "#3a3a3a", "#5a3b1f", "#2b6b4f", "#6b2b5a"];

  function rect(x, y, w, h, fill, extra = "") {
    const f = fill.startsWith("var(") ? `style="fill:${fill}"` : `fill="${fill}"`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${f} ${extra}/>`;
  }

  function boxAccessory(kind) {
    const o = 'stroke="#000" stroke-width="2.5"';
    switch (kind) {
      case "crown":
        return rect(18, 4, 28, 9, "#ffde00", o) + rect(18, -1, 6, 6, "#ffde00", o) + rect(29, -1, 6, 6, "#ffde00", o) +
          rect(40, -1, 6, 6, "#ffde00", o) + rect(30, 7, 4, 3, "#ff5c8a");
      case "cap":
        return rect(14, 5, 36, 9, "#2f6bff", o) + rect(44, 10, 14, 4, "#2f6bff", o) + rect(18, 7, 6, 3, "#fff", 'opacity=".5"');
      case "party":
        return rect(20, 4, 24, 9, "#7ae582", o) + rect(24, -2, 16, 7, "#7ae582", o) + rect(28, -8, 8, 7, "#7ae582", o) +
          rect(29, -14, 6, 6, "#ff5c8a", o);
      case "band":
        return rect(16, 16, 32, 4, "#ff5c8a") ;
      default:
        return "";
    }
  }

  function boxSvg(h, role) {
    const skin = SKIN[h % SKIN.length];
    const hair = HAIR[(h >>> 4) % HAIR.length];
    const pants = PANTS[(h >>> 8) % PANTS.length];
    const style = (h >>> 12) % 3; // 0 pendek, 1 poni, 2 panjang
    const o = 'stroke="#000" stroke-width="2.5"';
    const shirt = "var(--c)";
    let hairRects = rect(16, 12, 32, 8, hair);
    if (style === 1) hairRects += rect(16, 20, 12, 4, hair) + rect(44, 20, 4, 8, hair);
    if (style === 2) hairRects += rect(16, 20, 4, 18, hair) + rect(44, 20, 4, 18, hair);
    const acc = role || ((h >>> 3) % 5 === 0 ? "band" : "");
    const blush = (h >>> 6) % 2 === 0;
    return `
<svg viewBox="0 0 64 84" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <g class="limb leg l">${rect(18, 64, 13, 16, pants, o)}${rect(18, 76, 13, 4, "#222")}</g>
  <g class="limb leg r">${rect(33, 64, 13, 16, pants, o)}${rect(33, 76, 13, 4, "#222")}</g>
  <g class="limb arm l">${rect(8, 44, 8, 14, shirt)}${rect(8, 58, 8, 6, skin)}${rect(8, 44, 8, 20, "none", o)}</g>
  <g class="limb arm r">${rect(48, 44, 8, 14, shirt)}${rect(48, 58, 8, 6, skin)}${rect(48, 44, 8, 20, "none", o)}</g>
  ${rect(16, 44, 32, 20, shirt, o)}
  ${rect(28, 44, 8, 3, skin)}${rect(17.5, 59, 29, 4, "#000", 'opacity=".18"')}
  ${rect(16, 12, 32, 32, skin)}
  ${hairRects}
  ${blush ? rect(18, 34, 4, 3, "#ff7aa2", 'opacity=".7"') + rect(42, 34, 4, 3, "#ff7aa2", 'opacity=".7"') : ""}
  <g class="eyes">
    <g class="open">${rect(20, 27, 8, 5, "#fff")}${rect(24, 27, 4, 5, "#000")}${rect(36, 27, 8, 5, "#fff")}${rect(40, 27, 4, 5, "#000")}</g>
    <g class="closed">${rect(20, 30, 8, 2, "#000")}${rect(36, 30, 8, 2, "#000")}</g>
    <g class="x" stroke="#000" stroke-width="2.5" shape-rendering="auto"><path d="M21 26 L27 33 M27 26 L21 33"/><path d="M37 26 L43 33 M43 26 L37 33"/></g>
  </g>
  ${rect(26, 35, 2, 2, "#000")}${rect(28, 37, 8, 2, "#000")}${rect(36, 35, 2, 2, "#000")}
  ${rect(16, 12, 32, 32, "none", o)}
  ${boxAccessory(acc)}
</svg>`;
  }

  // ---- Tipe "blob" ----
  function blobSvg(h, role) {
    const sh = SHAPES[h % SHAPES.length];
    const e = sh.eye;
    const look = 1.6; // pupil melirik ke arah jalan (flip ditangani CSS scaleX)
    const variant = (h >>> 3) % 6;
    const acc = role || (variant === 0 ? "sprout" : variant === 1 ? "antenna" : "");
    const blush = (h >>> 6) % 2 === 0;
    return `
<svg viewBox="0 0 64 84" xmlns="http://www.w3.org/2000/svg">
  <ellipse class="foot l" cx="22" cy="78" rx="7.5" ry="4.5" fill="#000"/>
  <ellipse class="foot r" cx="42" cy="78" rx="7.5" ry="4.5" fill="#000"/>
  <path d="${sh.d}" style="fill:var(--c)" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
  <ellipse cx="21" cy="${sh.top + 11}" rx="5" ry="3" transform="rotate(-25 21 ${sh.top + 11})" fill="#fff" opacity=".55"/>
  ${blush ? `<circle cx="19" cy="${e + 8}" r="3.5" fill="#ff7aa2" opacity=".75"/><circle cx="47" cy="${e + 8}" r="3.5" fill="#ff7aa2" opacity=".75"/>` : ""}
  <g class="eyes">
    <g class="open">
      <circle cx="25" cy="${e}" r="6" fill="#fff" stroke="#000" stroke-width="2.5"/>
      <circle cx="41" cy="${e}" r="6" fill="#fff" stroke="#000" stroke-width="2.5"/>
      <circle cx="${25 + look}" cy="${e + 0.5}" r="3" fill="#000"/>
      <circle cx="${41 + look}" cy="${e + 0.5}" r="3" fill="#000"/>
    </g>
    <g class="closed" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round">
      <path d="M20 ${e} Q25 ${e + 4} 30 ${e}"/><path d="M36 ${e} Q41 ${e + 4} 46 ${e}"/>
    </g>
    <g class="x" stroke="#000" stroke-width="2.5" stroke-linecap="round">
      <path d="M21 ${e - 4} L29 ${e + 4} M29 ${e - 4} L21 ${e + 4}"/><path d="M37 ${e - 4} L45 ${e + 4} M45 ${e - 4} L37 ${e + 4}"/>
    </g>
  </g>
  <path d="M29 ${e + 9} Q33 ${e + 13} 37 ${e + 9}" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>
  ${accessory(acc, sh.top)}
</svg>`;
  }

  // ---- Avatar ----
  /** @type {Map<string, any>} */
  const avatars = new Map();
  let zTop = 1;

  function roleOf(m) {
    return m.isOwner ? "owner" : m.isModerator ? "mod" : m.isMember ? "member" : "";
  }
  const ROLE_ACC = { owner: "crown", mod: "cap", member: "party" };

  /** Tipe karakter: pilihan penonton (!karakter) > param ?type= (campur = acak per penonton). */
  function kindFor(id, h) {
    const saved = store.get("sa_av_kind_" + id);
    if (saved === "blob" || saved === "kotak") return saved;
    if (CFG.type === "campur") return (h >>> 9) % 2 ? "kotak" : "blob";
    return CFG.type;
  }

  function render(av) {
    const draw = av.kind === "kotak" ? boxSvg : blobSvg;
    av.figure.innerHTML = draw(av.h, ROLE_ACC[av.role] || "");
    av.el.classList.toggle("kotak", av.kind === "kotak");
    av.el.classList.remove("owner", "mod", "member");
    if (av.role) av.el.classList.add(av.role);
  }

  function updateTag(av, m) {
    av.name = cleanName(m.name) || "?";
    av.nameLower = av.name.toLowerCase();
    av.nmEl.textContent = av.name;
    const lvl = m.level && m.level.name ? m.level : null;
    av.lvlEl.textContent = lvl ? lvl.name : "";
    av.lvlEl.style.background = lvl ? lvl.color || "#ffde00" : "";
    const role = roleOf(m);
    if (role !== av.role) {
      av.role = role;
      render(av);
    }
  }

  function spawn(m) {
    // Penuh → buang yang paling lama diam (kecuali sedang duel).
    if (avatars.size >= CFG.max) {
      let oldest = null;
      for (const v of avatars.values()) if (!v.busy && (!oldest || v.lastActive < oldest.lastActive)) oldest = v;
      if (oldest) despawn(oldest);
      else return null;
    }

    const id = m.authorChannelId;
    const h = hash(id);
    const el = document.createElement("div");
    el.className = "av";
    el.innerHTML =
      '<div class="bubble"></div><div class="tag"><span class="lvl"></span><span class="nm"></span></div>' +
      '<div class="sprite"><div class="figure"></div></div>';
    const av = {
      id,
      h,
      el,
      bubble: el.querySelector(".bubble"),
      nmEl: el.querySelector(".nm"),
      lvlEl: el.querySelector(".lvl"),
      sprite: el.querySelector(".sprite"),
      figure: el.querySelector(".figure"),
      role: null,
      name: "",
      nameLower: "",
      x: clampX(rand(SIZE, window.innerWidth - SIZE)),
      y: rand(250, 500) * S, // jatuh dari atas saat muncul
      vy: 0,
      dir: Math.random() < 0.5 ? -1 : 1,
      target: null,
      speed: 50 * S,
      onArrive: null,
      walking: false,
      squash: 0,
      busy: false,
      sleeping: false,
      zzz: null,
      bubbleTimer: null,
      danceTimer: null,
      lastActive: Date.now(),
      nextThink: performance.now() + rand(800, 2500),
      nextBlink: performance.now() + rand(1000, 4000),
    };
    av.kind = kindFor(id, h);
    const saved = store.get("sa_av_color_" + id);
    av.el.style.setProperty("--c", saved || BASE_COLORS[h % BASE_COLORS.length]);
    updateTag(av, m); // role null → "" memicu render pertama
    stage.appendChild(el);
    avatars.set(id, av);
    return av;
  }

  function despawn(av) {
    avatars.delete(av.id);
    clearInterval(av.zzz);
    av.el.classList.add("bye");
    setTimeout(() => av.el.remove(), 600);
  }

  // ---- Aksi ----
  function say(av, text, ms) {
    if (!CFG.bubbles && !ms) return;
    const s = String(text);
    av.bubble.textContent = s.length > 90 ? s.slice(0, 88) + "…" : s;
    av.bubble.classList.add("show");
    clearTimeout(av.bubbleTimer);
    av.bubbleTimer = setTimeout(
      () => av.bubble.classList.remove("show"),
      ms || Math.min(8000, 3500 + s.length * 45),
    );
  }

  function fx(av, text, cls = "", dx = 0) {
    const el = document.createElement("span");
    el.className = "fx " + cls;
    el.textContent = text;
    el.style.setProperty("--dx", dx + "px");
    el.addEventListener("animationend", () => el.remove());
    av.el.appendChild(el);
  }

  function jump(av, power = 1) {
    if (av.y > 0) return;
    av.vy = rand(720, 860) * S * power;
  }

  function wake(av) {
    if (!av.sleeping) return;
    av.sleeping = false;
    av.el.classList.remove("sleep");
    clearInterval(av.zzz);
  }

  function dance(av, ms = 4000) {
    av.el.classList.add("dance");
    clearTimeout(av.danceTimer);
    av.danceTimer = setTimeout(() => av.el.classList.remove("dance"), ms);
  }

  function sleepAv(av) {
    if (av.busy) return;
    av.sleeping = true;
    av.target = null;
    av.el.classList.add("sleep");
    clearInterval(av.zzz);
    fx(av, "z", "zzz", 14);
    av.zzz = setInterval(() => fx(av, pick(["z", "Z", "z"]), "zzz", rand(6, 22)), 1400);
  }

  function hearts(av) {
    for (let i = 0; i < 6; i++) setTimeout(() => fx(av, pick(["❤️", "💖", "💕"]), "", rand(-26, 26)), i * 160);
    jump(av, 0.6);
  }

  function setColor(av, arg) {
    const a = String(arg || "").toLowerCase();
    const c = COLORS[a] || (/^#[0-9a-f]{6}$/i.test(a) ? a : null);
    if (!c) {
      say(av, "🎨 pink, kuning, biru, hijau, ungu, oranye, merah, tosca, coklat, putih, hitam", 6000);
      return;
    }
    av.el.style.setProperty("--c", c);
    store.set("sa_av_color_" + av.id, c);
    jump(av, 0.7);
  }

  const KINDS = { kotak: "kotak", box: "kotak", blok: "kotak", pixel: "kotak", blob: "blob", bulat: "blob", round: "blob" };
  function setKind(av, arg) {
    const k = KINDS[String(arg || "").toLowerCase()];
    if (!k) {
      say(av, "🧩 !karakter kotak / !karakter blob", 5000);
      return;
    }
    av.kind = k;
    store.set("sa_av_kind_" + av.id, k);
    render(av);
    jump(av, 0.8);
  }

  function goTo(av, x, speed) {
    return new Promise((resolve) => {
      av.target = clampX(x);
      av.speed = speed;
      av.onArrive = resolve;
    });
  }

  function findByName(raw, except) {
    const n = cleanName(raw).toLowerCase();
    if (!n) return null;
    let starts = null;
    for (const v of avatars.values()) {
      if (v === except) continue;
      if (v.nameLower === n) return v;
      if (!starts && v.nameLower.startsWith(n)) starts = v;
    }
    return starts;
  }

  // Duel visual: dua avatar mendekat, adu 3x, satu KO secara acak.
  async function duel(a, arg) {
    if (a.busy) return;
    if (!cleanName(arg)) return say(a, "⚔️ !duel @nama");
    const b = findByName(arg, a);
    if (!b) return say(a, `⚔️ @${cleanName(arg)} nggak ada di layar 🤔`);
    if (b.busy) return say(a, `⏳ @${b.name} lagi sibuk duel`);

    a.busy = b.busy = true;
    for (const v of [a, b]) {
      wake(v);
      v.el.classList.remove("dance");
    }
    say(a, `⚔️ Duel, @${b.name}!`, 3000);

    const gap = SIZE * 0.55;
    const mid = Math.min(window.innerWidth - SIZE - gap, Math.max(SIZE + gap, (a.x + b.x) / 2));
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    await Promise.all([goTo(left, mid - gap, 240 * S), goTo(right, mid + gap, 240 * S)]);
    left.dir = 1;
    right.dir = -1;
    await sleep(250);

    for (let i = 0; i < 3; i++) {
      jump(left, 0.55);
      jump(right, 0.55);
      await sleep(330);
      fx(left, pick(["💥", "⚡", "✨"]), "clash", gap);
      await sleep(320);
    }

    const [win, lose] = Math.random() < 0.5 ? [a, b] : [b, a];
    lose.el.classList.add("ko");
    lose.vy = 520 * S;
    lose.target = clampX(lose.x + (lose === left ? -70 : 70) * S);
    lose.speed = 260 * S;
    say(win, "🏆 MENANG!", 3200);
    jump(win);
    setTimeout(() => jump(win), 600);

    await sleep(3200);
    lose.el.classList.remove("ko");
    a.busy = b.busy = false;
    a.lastActive = b.lastActive = Date.now();
  }

  const COMMANDS = {
    "!lompat": (av) => jump(av),
    "!jump": (av) => jump(av),
    "!joget": (av) => dance(av),
    "!dance": (av) => dance(av),
    "!sapa": (av) => {
      say(av, "👋 Halo semua!", 3500);
      jump(av, 0.6);
    },
    "!wave": (av) => {
      say(av, "👋 Hi everyone!", 3500);
      jump(av, 0.6);
    },
    "!love": (av) => hearts(av),
    "!tidur": (av) => sleepAv(av),
    "!sleep": (av) => sleepAv(av),
    "!duel": (av, arg) => duel(av, arg),
    "!warna": (av, arg) => setColor(av, arg),
    "!color": (av, arg) => setColor(av, arg),
    "!karakter": (av, arg) => setKind(av, arg),
    "!char": (av, arg) => setKind(av, arg),
  };

  function onChat(m) {
    if (!m || !m.authorChannelId) return;
    let av = avatars.get(m.authorChannelId);
    if (av) updateTag(av, m);
    else av = spawn(m);
    if (!av) return;
    av.lastActive = Date.now();
    av.el.style.zIndex = String(++zTop); // yang baru chat tampil paling depan

    const text = String(m.text || "").trim();
    const [first = "", ...rest] = text.split(/\s+/);
    const cmd = COMMANDS[first.toLowerCase()];
    if (cmd !== COMMANDS["!tidur"] && cmd !== COMMANDS["!sleep"]) wake(av);
    if (cmd) cmd(av, rest.join(" "));
    else if (text) say(av, text);
  }

  /** Arah menjauh dari tetangga terdekat (-1/1), atau 0 kalau lega. */
  function crowdPush(av) {
    const near = SIZE * 1.1;
    let push = 0;
    for (const o of avatars.values()) {
      if (o === av) continue;
      const d = av.x - o.x;
      if (Math.abs(d) < near) push += d === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(d);
    }
    if (!push) return 0;
    // Mentok di tepi layar → menjauh ke arah dalam.
    const dir = Math.sign(push);
    if (av.x + dir * SIZE > window.innerWidth - SIZE / 2) return -1;
    if (av.x + dir * SIZE < SIZE / 2) return 1;
    return dir;
  }

  // ---- Loop animasi ----
  function step(av, dt, now) {
    // Vertikal: lompat / jatuh.
    if (av.y > 0 || av.vy > 0) {
      av.vy -= GRAV * dt;
      av.y += av.vy * dt;
      if (av.y <= 0) {
        if (av.vy < -500 * S) av.squash = 0.18;
        av.y = 0;
        av.vy = 0;
      }
    }

    // Horizontal: jalan ke target.
    if (av.target != null) {
      const dx = av.target - av.x;
      if (Math.abs(dx) < 2) {
        av.x = av.target;
        av.target = null;
        const done = av.onArrive;
        av.onArrive = null;
        if (done) done();
      } else {
        if (!av.el.classList.contains("ko")) av.dir = Math.sign(dx);
        av.x += Math.sign(dx) * Math.min(Math.abs(dx), av.speed * dt);
      }
    }
    av.x = clampX(av.x);
    av.walking = av.target != null && av.y === 0 && !av.el.classList.contains("ko");

    // "Otak" sederhana: jalan-jalan acak lalu diam.
    // Kalau berdesakan, menjauh dulu supaya label nama tidak bertumpuk.
    if (!av.busy && !av.sleeping && av.target == null && now > av.nextThink) {
      const crowd = crowdPush(av);
      if (crowd) {
        av.target = clampX(av.x + crowd * rand(70, 160) * S);
        av.speed = rand(45, 75) * S;
      } else if (Math.random() < 0.65) {
        av.target = clampX(av.x + rand(-320, 320) * S);
        av.speed = rand(35, 75) * S;
      }
      av.nextThink = now + rand(crowd ? 600 : 2000, crowd ? 1500 : 6500);
    }

    // Kedip.
    if (now > av.nextBlink && !av.sleeping) {
      const el = av.el;
      el.classList.add("blink");
      setTimeout(() => el.classList.remove("blink"), 120);
      av.nextBlink = now + rand(2500, 6000);
    }

    // Squash & stretch.
    let sx = 1;
    let sy = 1;
    if (av.squash > 0) {
      av.squash -= dt;
      const k = Math.max(0, av.squash / 0.18);
      sx = 1 + 0.25 * k;
      sy = 1 - 0.25 * k;
    } else if (av.y > 0) {
      sx = 0.92;
      sy = 1.08;
    }
    const bob = av.walking ? Math.abs(Math.sin(now / 90)) * 3 * S : 0;

    av.el.classList.toggle("walk", av.walking);
    av.el.style.transform = `translate3d(${av.x - SIZE / 2}px, ${-av.y}px, 0)`;
    av.sprite.style.transform = `translateY(${-bob}px) scale(${av.dir * sx}, ${sy})`;
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const av of avatars.values()) step(av, dt, now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Hilangkan avatar yang lama tidak chat.
  setInterval(() => {
    const now = Date.now();
    for (const av of avatars.values()) if (!av.busy && now - av.lastActive > CFG.idleMs) despawn(av);
  }, 5000);

  // ---- Sumber pesan ----
  function setConn(state) {
    connEl.dataset.state = state;
    connEl.textContent = state === "open" ? "tersambung" : state === "closed" ? "terputus" : "menyambung…";
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?role=chat`);
    ws.onopen = () => setConn("open");
    ws.onclose = () => {
      setConn("closed");
      setTimeout(connect, 1500);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === "chat") onChat(msg.data);
    };
  }

  // Mode demo (pratinjau dashboard): penonton palsu yang chat & pakai command.
  function demo() {
    connEl.dataset.state = "open";
    const people = [
      { name: "Budi", isOwner: true },
      { name: "Sari", isModerator: true },
      { name: "Raka", isMember: true, level: { name: "Sultan", color: "#ffde00" } },
      { name: "Nadia", level: { name: "Bocil", color: "#7ae582" } },
      { name: "Joko" },
      { name: "Ayu", isMember: true },
      { name: "Dimas", level: { name: "Pro", color: "#4dd4ff" } },
      { name: "Putri" },
    ].map((p, i) => ({ authorChannelId: "demo-" + i, isOwner: false, isModerator: false, isMember: false, ...p }));
    const lines = ["halo bang! 👋", "gas terus 🔥", "wkwkwk", "mantap jiwa", "first!", "kapan mabar?", "!lompat", "!joget", "!love", "!sapa", "!tidur", "!warna ungu", "!warna tosca", "!karakter kotak", "!karakter blob"];
    const send = (p, text) => onChat({ ...p, text, timestamp: Date.now() });
    people.forEach((p, i) => setTimeout(() => send(p, pick(lines.slice(0, 6))), i * 350));
    setInterval(() => {
      const p = pick(people);
      if (Math.random() < 0.12) send(p, "!duel @" + pick(people.filter((o) => o !== p)).name);
      else send(p, pick(lines));
    }, 1700);
  }

  if (CFG.demo) demo();
  else connect();
})();
