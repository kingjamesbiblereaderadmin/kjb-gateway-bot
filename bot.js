import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, PermissionsBitField, ModalBuilder, TextInputBuilder, AttachmentBuilder } from "discord.js";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============ CRASH PROTECTION ============
process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ Unhandled Rejection:", reason?.message || reason);
  console.error(reason?.stack || "");
});
process.on("uncaughtException", (err) => {
  console.error("⚠️ Uncaught Exception:", err?.message || err);
  console.error(err?.stack || "");
  // Don't exit — try to keep running
});
const SERVERS_FILE = path.join(__dirname, "servers.json");

function loadServers() {
  try { return JSON.parse(fs.readFileSync(SERVERS_FILE, "utf8")); } catch { return []; }
}
function saveServers(servers) {
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
  scheduleGitBackup();
}

// ── Live backup of servers.json to git ─────────────────────────────────────
// servers.json is the only persistent record of per-guild settings, and this app is deployed
// via git-sync (a code push redeploys the container from the repo). Without this, a code deploy
// would silently reset every guild's settings to whatever was last committed, and could even make
// already-configured guilds look "new" again (re-triggering onboarding). To prevent that, every
// write to servers.json is committed and pushed back to the SAME repo/branch on a short debounce,
// so the repo is always a near-live mirror of the running state and a future deploy can never regress it.
let _gitBackupTimer = null;
function scheduleGitBackup() {
  if (_gitBackupTimer) return;
  _gitBackupTimer = setTimeout(() => {
    _gitBackupTimer = null;
    const token = process.env.GITHUB_PUSH_TOKEN;
    if (!token) { console.warn("⚠️ GITHUB_PUSH_TOKEN not set — skipping servers.json git backup"); return; }
    const remote = `https://kingjamesbiblereaderadmin:${token}@github.com/kingjamesbiblereaderadmin/kjb-gateway-bot.git`;
    const cmd = [
      `git add servers.json`,
      `git -c user.email="bot@kjbreader.local" -c user.name="KJB Reader Bot" commit -m "auto-backup servers.json" --quiet`,
      `git push "${remote}" HEAD:main --quiet`,
    ].join(" && ");
    exec(cmd, { cwd: __dirname }, (err, stdout, stderr) => {
      if (err) {
        if (/nothing to commit/i.test(stdout + stderr)) return; // no-op, fine
        console.error("⚠️ servers.json git backup failed:", (stderr || err.message || "").slice(0, 300));
      } else {
        console.log("💾 servers.json backed up to git");
      }
    });
  }, 15000); // debounce: coalesce rapid successive writes into one commit
}
function getServer(guildId) {
  return loadServers().find(s => s.guild_id === guildId);
}
function updateServer(guildId, updates) {
  const servers = loadServers();
  let server = servers.find(s => s.guild_id === guildId);
  if (!server) {
    server = { guild_id: guildId, channel_name: "", webhook_url: "", role_id: "everyone", verse_time: "12:00", timezone: "UTC", active: false, last_sent_date: "", updates_ready: true };
    servers.push(server);
  }
  Object.assign(server, updates);
  saveServers(servers);
  return server;
}

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "";

async function patchWebhookAvatar(webhookUrl) {
  try {
    const imgRes = await fetch(KJB_LOGO);
    if (!imgRes.ok) return;
    const imgBuf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuf).toString("base64");
    await fetch(webhookUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "KJB Reader", avatar: `data:image/png;base64,${base64}` }),
    });
  } catch (e) { console.warn("patchWebhookAvatar skipped:", e.message); }
}

async function deliverDailyVerse() {
  const now = new Date();
  const utcH = now.getUTCHours();
  const todayStr = now.toISOString().slice(0, 10);
  const servers = loadServers();
  const activeServers = servers.filter(s => s.active && s.webhook_url);
  
  // Check if any server needs delivery this hour
  const needDelivery = activeServers.some(s => {
    const [targetH] = (s.verse_time || "12:00").split(":").map(Number);
    return targetH === utcH && s.last_sent_date !== todayStr;
  });
  if (!needDelivery) { console.log(`Daily: no servers need delivery at ${utcH}:00 UTC`); return; }

  // Fetch daily verse once
  let v;
  try {
    const data = await callBibleApi({ action: "daily_verse", clientDate: `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}` });
    v = data?.verse || data;
  } catch (e) { console.error("Daily: failed to fetch verse:", e.message); return; }
  if (!v?.text) { console.error("Daily: no verse text"); return; }

  const fullRef = v.bookFullName ? `${v.bookFullName} — ${v.chapter}:${v.verse}` : `${v.book} ${v.chapter}:${v.verse}`;
  const formattedDate = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const verseText = formatKJV(v.text);
  const verseSup = v.superscription ? formatKJV(v.superscription) : "";
  const shortRef = `${v.book} ${v.chapter}:${v.verse}`;

  // Build embed + components
  const prevDis = (v.book === "Genesis" && v.chapter === 1 && v.verse === 1);
  const components = [
    { type: 1, components: [
      { type: 2, style: 2, label: "◀ Prev Vs", custom_id: `prevvs|${v.book}||${v.chapter}||${v.verse}`, disabled: prevDis },
      { type: 2, style: 2, label: "Next Vs ▶", custom_id: `nextvs|${v.book}||${v.chapter}||${v.verse}` },
    ]},
    { type: 1, components: [
      { type: 2, style: 2, label: "📖 Read Chapter", custom_id: `dv|${v.book}||${v.chapter}||${v.verse}` },
      { type: 2, style: 2, label: "📖 TOC", custom_id: `bibletoc|0` },
      { type: 2, style: 2, label: "📋 Copy", custom_id: `copyref|${shortRef}`.slice(0, 100) },
    ]},
  ];

  const embed = {
    title: `📖 Daily Verse — ${formattedDate}`,
    description: `${verseSup ? `*${verseSup}*\n\n` : ""}**${fullRef}**\n\n> "${verseText}"`,
    color: 0xC8922E,
    thumbnail: { url: KJB_LOGO },
    footer: { text: "KJB Reader • kingjamesbiblereader.com" },
  };

  let delivered = 0, skipped = 0, errors = 0;
  for (const server of activeServers) {
    const [targetH] = (server.verse_time || "12:00").split(":").map(Number);
    if (targetH !== utcH) { skipped++; continue; }
    if (server.last_sent_date === todayStr) { skipped++; continue; }
    try {
      await patchWebhookAvatar(server.webhook_url);
      const payload = {
        embeds: [embed],
        components,
        allowed_mentions: server.role_id === "everyone" ? { parse: ["everyone"] } : server.role_id ? { roles: [server.role_id] } : { parse: [] },
      };
      if (server.role_id === "everyone") payload.content = "@everyone";
      else if (server.role_id) payload.content = `<@&${server.role_id}>`;
      const res = await fetch(server.webhook_url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.status === 404 || res.status === 410) {
        // Webhook dead — mark inactive
        updateServer(server.guild_id, { active: false });
        errors++;
        continue;
      }
      if (!res.ok) { errors++; continue; }
      updateServer(server.guild_id, { last_sent_date: todayStr });
      delivered++;
    } catch (e) { console.error("Delivery error:", e.message); errors++; }
  }
  console.log(`Daily delivery: delivered=${delivered} skipped=${skipped} errors=${errors}`);
}

const BIBLE_API = "https://kingjamesbiblereader.com/api/functions/bibleApi";
const KJB_LOGO = "https://cdn.discordapp.com/avatars/1529303667348606996/0dd9efc7dc75c3bfe0eda43d99d6ed4e.png?size=256";

const OT_BOOKS = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi"];
const NT_BOOKS = ["Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];
const ALL_BOOKS = [...OT_BOOKS, ...NT_BOOKS];
const OT_SET = new Set(OT_BOOKS);
const NT_SET = new Set(NT_BOOKS);

const KJV_BOOKS = { "Genesis":50,"Exodus":40,"Leviticus":27,"Numbers":36,"Deuteronomy":34,"Joshua":24,"Judges":21,"Ruth":4,"1 Samuel":31,"2 Samuel":24,"1 Kings":22,"2 Kings":25,"1 Chronicles":29,"2 Chronicles":36,"Ezra":10,"Nehemiah":13,"Esther":10,"Job":42,"Psalms":150,"Proverbs":31,"Ecclesiastes":12,"Song of Solomon":8,"Isaiah":66,"Jeremiah":52,"Lamentations":5,"Ezekiel":48,"Daniel":12,"Hosea":14,"Joel":3,"Amos":9,"Obadiah":1,"Jonah":4,"Micah":7,"Nahum":3,"Habakkuk":3,"Zephaniah":3,"Haggai":2,"Zechariah":14,"Malachi":4,"Matthew":28,"Mark":16,"Luke":24,"John":21,"Acts":28,"Romans":16,"1 Corinthians":16,"2 Corinthians":13,"Galatians":6,"Ephesians":6,"Philippians":4,"Colossians":4,"1 Thessalonians":5,"2 Thessalonians":3,"1 Timothy":6,"2 Timothy":4,"Titus":3,"Philemon":1,"Hebrews":13,"James":5,"1 Peter":5,"2 Peter":3,"1 John":5,"2 John":1,"3 John":1,"Jude":1,"Revelation":22 };
const BOOK_ORDER = Object.keys(KJV_BOOKS);

const KJV_FULL_TITLES = { "Genesis":"The First Book of Moses, called Genesis","Exodus":"The Second Book of Moses, called Exodus","Leviticus":"The Third Book of Moses, called Leviticus","Numbers":"The Fourth Book of Moses, called Numbers","Deuteronomy":"The Fifth Book of Moses, called Deuteronomy","Joshua":"The Book of Joshua","Judges":"The Book of Judges","Ruth":"The Book of Ruth","1 Samuel":"The First Book of Samuel, Otherwise called, The First Book Of The Kings","2 Samuel":"The Second Book of Samuel, Otherwise called, The Second Book Of The Kings","1 Kings":"The First Book Of The Kings, Commonly called, The Third Book Of The Kings","2 Kings":"The Second Book Of The Kings, Commonly called, The Fourth Book Of The Kings","1 Chronicles":"The First Book of the Chronicles","2 Chronicles":"The Second Book of the Chronicles","Ezra":"Ezra","Nehemiah":"The Book of Nehemiah","Esther":"The Book of Esther","Job":"The Book of Job","Psalms":"The Book of Psalms","Proverbs":"The Proverbs","Ecclesiastes":"Ecclesiastes; or, the Preacher","Song of Solomon":"The Song of Solomon","Isaiah":"The Book of the Prophet Isaiah","Jeremiah":"The Book of the Prophet Jeremiah","Lamentations":"The Lamentations of Jeremiah","Ezekiel":"The Book of the Prophet Ezekiel","Daniel":"The Book of Daniel","Hosea":"Hosea","Joel":"Joel","Amos":"Amos","Obadiah":"Obadiah","Jonah":"Jonah","Micah":"Micah","Nahum":"Nahum","Habakkuk":"Habakkuk","Zephaniah":"Zephaniah","Haggai":"Haggai","Zechariah":"Zechariah","Malachi":"Malachi","Matthew":"The Gospel According to Saint Matthew","Mark":"The Gospel According to Saint Mark","Luke":"The Gospel According to Saint Luke","John":"The Gospel According to Saint John","Acts":"The Acts of the Apostles","Romans":"The Epistle of Paul the Apostle to the Romans","1 Corinthians":"The First Epistle of Paul the Apostle to the Corinthians","2 Corinthians":"The Second Epistle of Paul the Apostle to the Corinthians","Galatians":"The Epistle of Paul the Apostle to the Galatians","Ephesians":"The Epistle of Paul the Apostle to the Ephesians","Philippians":"The Epistle of Paul the Apostle to the Philippians","Colossians":"The Epistle of Paul the Apostle to the Colossians","1 Thessalonians":"The First Epistle of Paul the Apostle to the Thessalonians","2 Thessalonians":"The Second Epistle of Paul the Apostle to the Thessalonians","1 Timothy":"The First Epistle of Paul the Apostle to Timothy","2 Timothy":"The Second Epistle of Paul the Apostle to Timothy","Titus":"The Epistle of Paul to Titus","Philemon":"The Epistle of Paul to Philemon","Hebrews":"The Epistle of Paul the Apostle to the Hebrews","James":"The General Epistle of James","1 Peter":"The First Epistle General of Peter","2 Peter":"The Second Epistle General of Peter","1 John":"The First Epistle General of John","2 John":"The Second Epistle of John","3 John":"The Third Epistle of John","Jude":"The General Epistle of Jude","Revelation":"The Revelation of Saint John the Divine" };

const ALIASES = { "gen":"Genesis","ge":"Genesis","gn":"Genesis","exo":"Exodus","ex":"Exodus","lev":"Leviticus","le":"Leviticus","num":"Numbers","nu":"Numbers","deu":"Deuteronomy","de":"Deuteronomy","dt":"Deuteronomy","jos":"Joshua","josh":"Joshua","jdg":"Judges","judg":"Judges","rut":"Ruth","ru":"Ruth","1sa":"1 Samuel","1sam":"1 Samuel","2sa":"2 Samuel","2sam":"2 Samuel","1ki":"1 Kings","1kgs":"1 Kings","2ki":"2 Kings","2kgs":"2 Kings","1ch":"1 Chronicles","1chr":"1 Chronicles","2ch":"2 Chronicles","2chr":"2 Chronicles","ezr":"Ezra","neh":"Nehemiah","ne":"Nehemiah","est":"Esther","es":"Esther","job":"Job","jb":"Job","psa":"Psalms","ps":"Psalms","psalm":"Psalms","pss":"Psalms","pro":"Proverbs","pr":"Proverbs","prv":"Proverbs","ecc":"Ecclesiastes","ec":"Ecclesiastes","son":"Song of Solomon","sos":"Song of Solomon","sng":"Song of Solomon","song":"Song of Solomon","isa":"Isaiah","is":"Isaiah","jer":"Jeremiah","je":"Jeremiah","lam":"Lamentations","la":"Lamentations","eze":"Ezekiel","ezk":"Ezekiel","dan":"Daniel","da":"Daniel","hos":"Hosea","ho":"Hosea","joe":"Joel","jl":"Joel","amo":"Amos","am":"Amos","oba":"Obadiah","ob":"Obadiah","jon":"Jonah","mic":"Micah","mi":"Micah","nah":"Nahum","na":"Nahum","hab":"Habakkuk","hb":"Habakkuk","zep":"Zephaniah","hag":"Haggai","hg":"Haggai","zec":"Zechariah","zch":"Zechariah","mal":"Malachi","ml":"Malachi","mat":"Matthew","mt":"Matthew","matt":"Matthew","mar":"Mark","mk":"Mark","mr":"Mark","luk":"Luke","lk":"Luke","joh":"John","jn":"John","jhn":"John","act":"Acts","ac":"Acts","rom":"Romans","ro":"Romans","rm":"Romans","1co":"1 Corinthians","1cor":"1 Corinthians","2co":"2 Corinthians","2cor":"2 Corinthians","gal":"Galatians","ga":"Galatians","eph":"Ephesians","ep":"Ephesians","php":"Philippians","phi":"Philippians","phil":"Philippians","col":"Colossians","1th":"1 Thessalonians","1thes":"1 Thessalonians","2th":"2 Thessalonians","2thes":"2 Thessalonians","1ti":"1 Timothy","1tim":"1 Timothy","2ti":"2 Timothy","2tim":"2 Timothy","tit":"Titus","ti":"Titus","phm":"Philemon","pm":"Philemon","heb":"Hebrews","he":"Hebrews","jam":"James","jas":"James","1pe":"1 Peter","1pet":"1 Peter","2pe":"2 Peter","2pet":"2 Peter","1jo":"1 John","1jn":"1 John","1jhn":"1 John","2jo":"2 John","2jn":"2 John","3jo":"3 John","3jn":"3 John","jud":"Jude","jude":"Jude","rev":"Revelation","re":"Revelation","rv":"Revelation","revelation":"Revelation","exod":"Exodus","levi":"Leviticus","deut":"Deuteronomy","judges":"Judges","esth":"Esther","psalms":"Psalms","prov":"Proverbs","eccl":"Ecclesiastes","ezek":"Ezekiel","hab":"Habakkuk","zeph":"Zephaniah","zech":"Zechariah","malachi":"Malachi","mark":"Mark","luke":"Luke","acts":"Acts","titus":"Titus","james":"James","cor":"1 Corinthians","thess":"1 Thessalonians","tim":"1 Timothy","pet":"1 Peter","john":"John","sam":"1 Samuel","kgs":"1 Kings","chr":"1 Chronicles","gs":"Galatians" };

// Gospel pages (paginated) — exact wording per official gospel text, do not paraphrase
const GOSPEL_PAGES = [
  {
    title: "✝️ HOW TO BE SAVED — Page 1/6",
    refs: ["Romans 3:20", "Psalm 9:17"],
    desc: "**The Gospel is the glad tidings of the Lord Jesus Christ:**\nTrust he is God, died, shed his blood, buried and rose again on the third day for our sins according to the scriptures.\n\n**1. Believe you are a sinner that deserves hell:**\n\"Therefore by the deeds of the law there shall no flesh be justified in his sight: for by the law is the knowledge of sin.\"\n— [Romans 3:20](https://kingjamesbiblereader.com/read?book=Rom&chapter=3&verse=20&from=gospel)\n\n\"The wicked shall be turned into hell, and all the nations that forget God.\"\n— [Psalm 9:17](https://kingjamesbiblereader.com/read?book=Psa&chapter=9&verse=17&from=gospel)"
  },
  {
    title: "✝️ HOW TO BE SAVED — Page 2/6",
    refs: ["1 Timothy 3:16"],
    desc: "**2. Believe that Jesus is God manifested in the flesh:**\n\"And without controversy great is the mystery of godliness: God was manifest in the flesh, justified in the Spirit, seen of angels, preached unto the Gentiles, believed on in the world, received up into glory.\"\n— [1 Timothy 3:16](https://kingjamesbiblereader.com/read?book=1Tim&chapter=3&verse=16&from=gospel)"
  },
  {
    title: "✝️ HOW TO BE SAVED — Page 3/6",
    refs: ["1 Corinthians 15:1-4", "Romans 3:25"],
    desc: "**3. Believe he died, shed his blood, was buried and rose again for our sins according to the scriptures:**\n\"Moreover, brethren, I declare unto you the gospel which I preached unto you, which also ye have received, and wherein ye stand; By which also ye are saved, if ye keep in memory what I preached unto you, unless ye have believed in vain. For I delivered unto you first of all that which I also received, how that Christ died for our sins according to the scriptures; And that he was buried, and that he rose again the third day according to the scriptures.\"\n— [1 Corinthians 15:1-4](https://kingjamesbiblereader.com/read?book=1Cor&chapter=15&verse=1&from=gospel)\n\n\"Whom God hath set forth to be a propitiation through faith in his blood, to declare his righteousness for the remission of sins that are past, through the forbearance of God;\"\n— [Romans 3:25](https://kingjamesbiblereader.com/read?book=Rom&chapter=3&verse=25&from=gospel)"
  },
  {
    title: "✝️ HOW TO BE SAVED — Page 4/6",
    desc: "**These do NOT make you a Christian:**\n• Repenting of sins\n• Making Jesus Lord\n• Being a member of a church\n• Tithing\n• Being baptised (water)\n• Saying a sinner's prayer\n• Confessing with your mouth\n• Lordship Salvation"
  },
  {
    title: "✝️ HOW TO BE SAVED — Page 5/6",
    refs: ["Ephesians 1:13"],
    desc: "**Once Saved, Always Saved:**\nA believer who has trusted the gospel cannot lose salvation, no matter what happens in their life. God's gift of eternal life is just that — eternal.\n\n\"In whom ye also trusted, after that ye heard the word of truth, the gospel of your salvation: in whom also after that ye believed, ye were sealed with that holy Spirit of promise.\"\n— [Ephesians 1:13](https://kingjamesbiblereader.com/read?book=Eph&chapter=1&verse=13&from=gospel)"
  },
  {
    title: "✝️ HOW TO BE SAVED — Page 6/6",
    desc: "Trust Jesus died, shed his blood, buried and rose again on the third day for your sins according to the scriptures.\n\n📖 [Read the full gospel](https://kingjamesbiblereader.com/gospel)\n\n▶️ Watch [\"THE GOSPEL THAT SAVES\" by Robert Breaker](https://www.youtube.com/watch?v=znP9Dr6tOzU)\n\n▶️ Watch the [full gospel video playlist](https://www.youtube.com/playlist?list=PLNGhZnJavRf3f2_NI79j5GigC6xK5_YYq)\n\n✉️ [Kingjamesbiblereader@outlook.sg](mailto:Kingjamesbiblereader@outlook.sg)"
  },
];


function resolveBook(input) {
  const norm = input.trim();
  for (const full of ALL_BOOKS) { if (full.toLowerCase() === norm.toLowerCase()) return full; }
  const key = norm.toLowerCase().replace(/\s+/g, "");
  if (ALIASES[key]) return ALIASES[key];
  return null;
}

// Try to resolve a book name, progressively trimming leading words
// e.g. "does John" -> "John", "explain Romans" -> "Romans"
function tryResolveBook(rawBook) {
  let book = resolveBook(rawBook);
  if (book) return book;
  const parts = rawBook.split(/\s+/);
  for (let i = 1; i < parts.length; i++) {
    const trimmed = parts.slice(i).join(" ");
    book = resolveBook(trimmed);
    if (book) return book;
  }
  return null;
}

// Like tryResolveBook, but only accepts a match whose first letter is capitalized in the
// original text. Used for chapter-only inline detection (no ":verse"), which is riskier —
// without a colon to anchor it, short lowercase aliases (e.g. "am" -> Amos, "is" -> Isaiah)
// could otherwise misfire on ordinary words like "I am 3 minutes late".
function resolveBookCapitalized(rawBook) {
  const parts = rawBook.split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(i).join(" ");
    if (!/^(?:[123]\s*)?[A-Z]/.test(candidate)) continue;
    const book = resolveBook(candidate);
    if (book) return book;
  }
  return null;
}

function parseRef(text) {
  const m = text.trim().match(/^((?:[123]\s*)?[A-Za-z][A-Za-z\s]*?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return null;
  const book = resolveBook(m[1]);
  if (!book) return null;
  const chapter = parseInt(m[2]);
  const verseStart = m[3] ? parseInt(m[3]) : null;
  const verseEnd = m[4] ? parseInt(m[4]) : null;
  if (verseStart !== null && KJV_BOOKS[book] && (chapter < 1 || chapter > KJV_BOOKS[book])) return null;
  return { book, chapter, verseStart, verseEnd };
}

function fixAE(text) { return text.replace(/\bAEnon\b/g, "Ænon").replace(/\bAEneas\b/g, "Æneas"); }
function formatKJV(text) { if (!text) return ""; return fixAE(text).replace(/\[([^\]]+)\]/g, "*$1*"); }
function stripMd(text) { if (!text) return ""; return fixAE(text).replace(/\[([^\]]+)\]/g, "$1").replace(/\*/g, "").replace(/¶/g, "").trim(); }

function highlightKeywords(text, keywords) {
  let result = formatKJV(text);
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(${escaped})`, "gi"), "**$1**");
  }
  return result;
}

function getPrevCh(book, ch) { if (ch > 1) return { book, chapter: ch - 1 }; const idx = BOOK_ORDER.indexOf(book); if (idx <= 0) return null; const p = BOOK_ORDER[idx - 1]; return { book: p, chapter: KJV_BOOKS[p] }; }
function getNextCh(book, ch) { if (ch < KJV_BOOKS[book]) return { book, chapter: ch + 1 }; const idx = BOOK_ORDER.indexOf(book); if (idx >= BOOK_ORDER.length - 1) return null; const n = BOOK_ORDER[idx + 1]; return { book: n, chapter: 1 }; }

async function callBibleApi(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const r = await fetch(BIBLE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`API returned ${r.status}`);
    return await r.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ============ EMBED BUILDERS ============

// Verse embed — matches V3: Prev Vs / Next Vs + Read Chapter + TOC + Copy
// Resolve a ref that may include a dash-range (e.g. "John 3:16-18") into a
// full array of verse objects — the bibleApi's resolve_refs does NOT support
// dash ranges natively, so ranges must be expanded into individual fetches.
// Fetch many verses in parallel batches (API accepts arrays of refs)
async function fetchVersesBatch(refs) {
  // Split into batches of 25 refs per API call
  const BATCH_SIZE = 25;
  const batches = [];
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    batches.push(refs.slice(i, i + BATCH_SIZE));
  }
  const results = await Promise.all(batches.map(batch =>
    callBibleApi({ action: "resolve_refs", refs: batch })
      .then(d => d?.verses || [])
      .catch(e => { console.error("batch fetch failed:", e.message); return []; })
  ));
  // Flatten and preserve order
  return results.flat();
}

async function resolveRefRange(ref) {
  const parsed = parseRef(ref);
  if (!parsed) return [];
  if (parsed.verseStart && parsed.verseEnd) {
    const rangeSize = parsed.verseEnd - parsed.verseStart + 1;
    if (rangeSize > 200) return []; // Cap ranges at 200 verses
    // Build all refs and fetch in parallel batches
    const refs = [];
    for (let v = parsed.verseStart; v <= parsed.verseEnd; v++) {
      refs.push(`${parsed.book} ${parsed.chapter}:${v}`);
    }
    return await fetchVersesBatch(refs);
  }
  // Single verse
  const singleRef = parsed.verseStart ? `${parsed.book} ${parsed.chapter}:${parsed.verseStart}` : ref;
  const d = await callBibleApi({ action: "resolve_refs", refs: [singleRef] });
  return d?.verses || [];
}

function isValidVerse(v) {
  return v && v.text != null && v.book != null && v.chapter != null && v.verse != null;
}

// ---- In-memory cache for paginated verse embeds (keyed by short id, referenced from button customIds) ----
// Bounded FIFO — oldest entries evicted once the cache grows past MAX_ENTRIES so long-running
// processes don't leak memory. Entries are cheap (just text), so a modest cap is fine.
const verseEmbedCache = new Map();
const VERSE_CACHE_MAX = 300;
function cacheVerseEmbed(entry) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  verseEmbedCache.set(id, entry);
  if (verseEmbedCache.size > VERSE_CACHE_MAX) {
    const oldest = verseEmbedCache.keys().next().value;
    verseEmbedCache.delete(oldest);
  }
  return id;
}

// Packs an array of text blocks into pages under a character budget, WITHOUT ever splitting
// a block (verse/group) in the middle — each page is a valid, complete chunk of text.
function paginateBlocks(blocks, budget = 3900) {
  const pages = [];
  let current = [];
  let currentLen = 0;
  for (const block of blocks) {
    const addedLen = block.length + (current.length ? 2 : 0); // +2 for the "\n\n" joiner
    if (current.length && currentLen + addedLen > budget) {
      pages.push(current.join("\n\n"));
      current = [block];
      currentLen = block.length;
    } else {
      current.push(block);
      currentLen += addedLen;
    }
  }
  if (current.length) pages.push(current.join("\n\n"));
  return pages.length ? pages : [""];
}

function buildVerseEmbed(verses, page = 0, cacheId = null) {
  const valid = verses.filter(isValidVerse);
  if (!valid.length) return { embeds: [], components: [] };
  const first = valid[0], last = valid[valid.length - 1];
  const fullTitle = KJV_FULL_TITLES[first.book] || first.book;
  
  // Check if verses span multiple books or chapters
  const sameBook = valid.every(v => v.book === first.book);
  const sameChapter = sameBook && valid.every(v => v.chapter === first.chapter);
  const isMultiRef = !sameChapter; // different books or different chapters
  
  // Compute verse groups (contiguous verses in same book+chapter) — used by both description and buttons
  const groups = [];
  if (isMultiRef && valid.length > 1) {
    let curGroup = [valid[0]];
    for (let i = 1; i < valid.length; i++) {
      const prev = valid[i - 1], curr = valid[i];
      if (prev.book === curr.book && prev.chapter === curr.chapter && curr.verse === prev.verse + 1) {
        curGroup.push(curr);
      } else {
        groups.push(curGroup);
        curGroup = [curr];
      }
    }
    groups.push(curGroup);
  }
  
  let title, blocks;
  
  if (sameBook && sameChapter && valid.length > 1) {
    // Dash range in same chapter (e.g., John 3:16-18) — show verses TOGETHER
    title = `${fullTitle} — ${first.chapter}:${first.verse}–${last.verse}`;
    blocks = [];
    if (first.verse === 1 && first.superscription) blocks.push(`¶ ${formatKJV(first.superscription)}`);
    blocks.push(...verses.map(v => {
      const heading = v.heading ? `\u200b\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003**${v.heading}**\n` : "";
      return `${heading}[${v.verse}] ${formatKJV(v.text)}`;
    }));
  } else if (valid.length === 1) {
    // Single verse
    title = `${fullTitle} — ${first.chapter}:${first.verse}`;
    blocks = [];
    if (first.verse === 1 && first.superscription) blocks.push(`¶ ${formatKJV(first.superscription)}`);
    const singleHeading = first.heading ? `\u200b\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003**${first.heading}**\n` : "";
    blocks.push(`${singleHeading}"${formatKJV(valid[0].text)}"`);
  } else if (sameBook && !sameChapter) {
    // Same book, different chapters
    title = fullTitle;
    blocks = verses.map(v => {
      const heading = v.heading ? `\u200b\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003**${v.heading}**\n` : "";
      return `${heading}**${v.chapter}:${v.verse}**\n\n"${formatKJV(v.text)}"`;
    });
  } else {
    // Multiple books or refs (e.g., 1 Cor 15:1-4, Romans 3:25, Eph 1:13)
    title = "Multiple Verses";
    blocks = groups.map(g => {
      const gTitle = KJV_FULL_TITLES[g[0].book] || g[0].book;
      if (g.length === 1) {
        return `**${gTitle} — ${g[0].chapter}:${g[0].verse}**\n\n"${formatKJV(g[0].text)}"`;
      } else {
        const ref = `${g[0].chapter}:${g[0].verse}–${g[g.length - 1].verse}`;
        const text = g.map(v => {
          const heading = v.heading ? `\u200b\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003**${v.heading}**\n` : "";
          return `${heading}[${v.verse}] ${formatKJV(v.text)}`;
        }).join("\n\n");
        return `**${gTitle} — ${ref}**\n\n${text}`;
      }
    });
  }

  // Paginate — never truncate/drop content. Most lookups fit on one page (no pagination UI shown).
  const pages = paginateBlocks(blocks);
  const totalPages = pages.length;
  const curPage = Math.min(Math.max(page, 0), totalPages - 1);
  const desc = pages[curPage];
  const pagedTitle = totalPages > 1 ? `${title} (${curPage + 1}/${totalPages})` : title;

  const embed = new EmbedBuilder()
    .setTitle(`📖 ${pagedTitle}`)
    .setDescription(desc)
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });

  const rows = [];

  if (!isMultiRef) {
    // Single verse or dash range: keep Prev/Next + Read Chapter + TOC + Copy
    const shortRef = valid.length > 1 
      ? `${first.book} ${first.chapter}:${first.verse}-${last.verse}` 
      : `${first.book} ${first.chapter}:${first.verse}`;
    
    // Row 1: Prev Vs / Next Vs
    const prevVsDis = (first.chapter === 1 && first.verse === 1);
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`prevvs|${first.book}||${first.chapter}||${first.verse}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev Vs").setDisabled(prevVsDis),
      new ButtonBuilder().setCustomId(`nextvs|${last.book}||${last.chapter}||${last.verse}`).setStyle(ButtonStyle.Secondary).setLabel("Next Vs ▶"),
    ));

    // Row 2: Read Chapter + TOC + Copy
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`dv|${first.book}||${first.chapter}||${first.verse}`).setStyle(ButtonStyle.Secondary).setLabel("📖 Read Chapter"),
      new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 TOC"),
      new ButtonBuilder().setCustomId(`copyref|${shortRef}`.slice(0, 100)).setStyle(ButtonStyle.Secondary).setLabel("📋 Copy"),
    ));
  } else {
    // Multi-ref: grouped "open verse" buttons (one per range/group) + TOC.
    // These post a NEW PUBLIC message (srchverse|) — same as search result buttons.
    // Row 1: TOC + up to 4 group buttons
    const groupButtons = groups.slice(0, 4).map(g => {
      const gFirst = g[0], gLast = g[g.length - 1];
      const ref = g.length === 1
        ? `${gFirst.book} ${gFirst.chapter}:${gFirst.verse}`
        : `${gFirst.book} ${gFirst.chapter}:${gFirst.verse}-${gLast.verse}`;
      const label = g.length === 1
        ? `📖 ${gFirst.book} ${gFirst.chapter}:${gFirst.verse}`
        : `📖 ${gFirst.book} ${gFirst.chapter}:${gFirst.verse}-${gLast.verse}`;
      return new ButtonBuilder().setCustomId(`srchverse|${ref}`.slice(0, 100)).setStyle(ButtonStyle.Secondary).setLabel(label);
    });
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 TOC"),
      ...groupButtons
    ));
    
    // If more than 4 groups, add remaining in row 2
    if (groups.length > 4) {
      const groupButtons2 = groups.slice(4, 9).map(g => {
        const gFirst = g[0], gLast = g[g.length - 1];
        const ref = g.length === 1
          ? `${gFirst.book} ${gFirst.chapter}:${gFirst.verse}`
          : `${gFirst.book} ${gFirst.chapter}:${gFirst.verse}-${gLast.verse}`;
        const label = g.length === 1
          ? `📖 ${gFirst.book} ${gFirst.chapter}:${gFirst.verse}`
          : `📖 ${gFirst.book} ${gFirst.chapter}:${gFirst.verse}-${gLast.verse}`;
        return new ButtonBuilder().setCustomId(`srchverse|${ref}`.slice(0, 100)).setStyle(ButtonStyle.Secondary).setLabel(label);
      });
      rows.push(new ActionRowBuilder().addComponents(...groupButtons2));
    }
  }

  // Pagination + full-text download row — only shown when content actually spans multiple pages.
  if (totalPages > 1) {
    if (!cacheId) {
      const fullText = `${title}\n\n${blocks.join("\n\n")}`;
      cacheId = cacheVerseEmbed({ verses, fullText, title });
    }
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`vspg|${cacheId}|${curPage - 1}`).setStyle(ButtonStyle.Primary).setLabel("◀ Page").setDisabled(curPage === 0),
      new ButtonBuilder().setCustomId(`vspg|${cacheId}|${curPage + 1}`).setStyle(ButtonStyle.Primary).setLabel("Page ▶").setDisabled(curPage >= totalPages - 1),
      new ButtonBuilder().setCustomId(`vsfile|${cacheId}`).setStyle(ButtonStyle.Secondary).setLabel("📄 Full Text (.txt)"),
    ));
  }

  return { embeds: [embed], components: rows };
}

// Chapter embed — already matches V3, keeping as-is
function buildChapterEmbed(book, chapter, verses, colophon, bookFullName, page = 0) {
  const pageSize = 20;
  const totalPages = Math.ceil(verses.length / pageSize);
  const startIdx = page * pageSize;
  const pageVerses = verses.slice(startIdx, startIdx + pageSize);

  let text = "";
  if (page === 0 && verses[0]?.verse === 1 && verses[0]?.superscription) {
    text += `¶ ${formatKJV(verses[0].superscription)}\n\n`;
  }
  text += pageVerses.map(v => {
    const heading = v.heading ? `\u200b\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003**${v.heading}**\n` : "";
    return `${heading}[${v.verse}] ${formatKJV(v.text)}`;
  }).join("\n\n");
  if (page === totalPages - 1 && colophon) text += `\n\n¶ ${formatKJV(colophon)}`;
  if (text.length > 4000) text = text.slice(0, 3997) + "...";

  const embed = new EmbedBuilder()
    .setTitle(`📖 ${bookFullName || KJV_FULL_TITLES[book] || book} — Chapter ${chapter}`)
    .setDescription(text)
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: `KJB Reader • Chapter ${chapter} of ${KJV_BOOKS[book]} • Page ${page + 1} of ${totalPages} • kingjamesbiblereader.com` });

  const rows = [];
  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`chpg|${book}|${chapter}|${page - 1}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Page").setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`nopg_${page}`).setStyle(ButtonStyle.Secondary).setLabel(`${page + 1} / ${totalPages}`).setDisabled(true),
      new ButtonBuilder().setCustomId(`chpg|${book}|${chapter}|${page + 1}`).setStyle(ButtonStyle.Secondary).setLabel("Page ▶").setDisabled(page >= totalPages - 1),
    ));
  }

  const prev = getPrevCh(book, chapter);
  const next = getNextCh(book, chapter);
  const navBtns = [];
  if (prev) {
    const isOT = OT_SET.has(book), prevIsOT = OT_SET.has(prev.book);
    if (!isOT && prevIsOT) navBtns.push(new ButtonBuilder().setCustomId(`prevch|${prev.book}||${prev.chapter}`).setStyle(ButtonStyle.Primary).setLabel("Old Testament ◀"));
    else navBtns.push(new ButtonBuilder().setCustomId(`prevch|${prev.book}||${prev.chapter}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev Ch"));
  } else {
    navBtns.push(new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 TOC"));
  }
  if (next) {
    const isOT = OT_SET.has(book), nextIsNT = NT_SET.has(next.book);
    if (isOT && nextIsNT) navBtns.push(new ButtonBuilder().setCustomId(`nextch|${next.book}||${next.chapter}`).setStyle(ButtonStyle.Primary).setLabel("New Testament ▶"));
    else navBtns.push(new ButtonBuilder().setCustomId(`nextch|${next.book}||${next.chapter}`).setStyle(ButtonStyle.Secondary).setLabel("Next Ch ▶"));
  } else {
    navBtns.push(new ButtonBuilder().setCustomId(`toc_ch|Genesis||1`).setStyle(ButtonStyle.Primary).setLabel("📖 Bible Start"));
  }
  rows.push(new ActionRowBuilder().addComponents(...navBtns));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`chcopy|${book}||${chapter}`).setStyle(ButtonStyle.Secondary).setLabel("📋 Copy"),
    new ButtonBuilder().setCustomId(`toc|${book}||0`).setStyle(ButtonStyle.Secondary).setLabel("📖 Chapters"),
    new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 TOC"),
  ));
  return { embeds: [embed], components: rows };
}

// Bible TOC embed — matches V3: OT/NT + Start Reading + Daily Verse
function buildBookTocEmbed(book, pageIdx = 0) {
  const totalChapters = KJV_BOOKS[book] || 0;
  if (totalChapters === 0) return null;
  const pageSize = 25;
  const start = pageIdx * pageSize;
  const end = Math.min(start + pageSize, totalChapters);
  const btns = [];
  for (let ch = start + 1; ch <= end; ch++) btns.push(new ButtonBuilder().setCustomId(`toc_ch|${book}||${ch}`).setStyle(ButtonStyle.Secondary).setLabel(`${ch}`));
  const rows = [];
  for (let i = 0; i < btns.length; i += 5) rows.push(new ActionRowBuilder().addComponents(...btns.slice(i, i + 5)));
  const totalPages = Math.ceil(totalChapters / pageSize);
  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`toc|${book}||${pageIdx - 1}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev").setDisabled(pageIdx === 0),
      new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 Bible TOC"),
      new ButtonBuilder().setCustomId(`toc|${book}||${pageIdx + 1}`).setStyle(ButtonStyle.Secondary).setLabel("Next ▶").setDisabled(pageIdx >= totalPages - 1),
    ));
  }
  const embed = new EmbedBuilder()
    .setTitle(`📖 ${KJV_FULL_TITLES[book] || book}`)
    .setDescription(`Select a chapter to read:\n\n${totalPages > 1 ? `Chapters ${start + 1}–${end} of ${totalChapters}` : `${totalChapters} chapter${totalChapters !== 1 ? "s" : ""}`}`)
    .setColor(0xC8922E).setThumbnail(KJB_LOGO)
    .setFooter({ text: `KJB Reader • ${totalPages > 1 ? `Page ${pageIdx + 1} of ${totalPages} • ` : ""}kingjamesbiblereader.com` });
  return { embeds: [embed], components: rows };
}

function buildBibleTocEmbed(page = 0) {
  const embed = new EmbedBuilder()
    .setTitle("📖 Holy Bible — King James Bible")
    .setDescription([
      "**Old Testament** (39 books)",
      OT_BOOKS.map(b => `\`${b}\``).join(", "),
      "",
      "**New Testament** (27 books)",
      NT_BOOKS.map(b => `\`${b}\``).join(", "),
      "",
      "Type `toc` or use the buttons below to browse.",
    ].join("\n"))
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });

  const rows = [];
  // Row 1: Start Reading buttons
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`nextch|Genesis||1`).setStyle(ButtonStyle.Primary).setLabel("📖 Start Reading (Gen 1)"),
    new ButtonBuilder().setCustomId(`nextch|Matthew||1`).setStyle(ButtonStyle.Primary).setLabel("📖 New Testament (Matt 1)"),
  ));
  // Row 2: Testament browsers + Daily Verse
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`testament|OT|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 Old Testament"),
    new ButtonBuilder().setCustomId(`testament|NT|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 New Testament"),
    new ButtonBuilder().setCustomId(`dailyverse|`).setStyle(ButtonStyle.Primary).setLabel("💡 Daily Verse"),
  ));
  return { embeds: [embed], components: rows };
}

// Testament browser — paginated book list for OT or NT
function buildTestamentEmbed(test, page = 0) {
  const books = test === "OT" ? OT_BOOKS : NT_BOOKS;
  const pageSize = 15;
  const start = page * pageSize;
  const pageBooks = books.slice(start, start + pageSize);
  const totalPages = Math.ceil(books.length / pageSize);
  const btns = pageBooks.map(b => new ButtonBuilder().setCustomId(`toc|${b}||0`).setStyle(ButtonStyle.Secondary).setLabel(b));
  const rows = [];
  for (let i = 0; i < btns.length; i += 5) rows.push(new ActionRowBuilder().addComponents(...btns.slice(i, i + 5)));
  const navBtns = [];
  if (page > 0) navBtns.push(new ButtonBuilder().setCustomId(`testament|${test}|${page - 1}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev Page"));
  navBtns.push(new ButtonBuilder().setCustomId(`nop_tpg_${page}`).setStyle(ButtonStyle.Secondary).setLabel(`Page ${page + 1} / ${totalPages}`).setDisabled(true));
  if (page < totalPages - 1) navBtns.push(new ButtonBuilder().setCustomId(`testament|${test}|${page + 1}`).setStyle(ButtonStyle.Secondary).setLabel("Next Page ▶"));
  rows.push(new ActionRowBuilder().addComponents(...navBtns));
  // Switch testament + back to full TOC
  const otherTarget = test === "OT" ? "testament|NT|0" : "testament|OT|0";
  const otherLabel = test === "OT" ? "📖 New Testament ▶" : "◀ 📖 Old Testament";
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(otherTarget).setStyle(ButtonStyle.Secondary).setLabel(otherLabel),
    new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 Full TOC"),
  ));
  const embed = new EmbedBuilder()
    .setTitle(`📖 ${test === "OT" ? "Old Testament" : "New Testament"} — ${books.length} Books`)
    .setDescription(`Select a book to see its chapters.\n\nPage ${page + 1} of ${totalPages}`)
    .setColor(0xC8922E).setThumbnail(KJB_LOGO)
    .setFooter({ text: `KJB Reader • kingjamesbiblereader.com` });
  return { embeds: [embed], components: rows };
}

// Daily verse embed — matches V3: Prev Vs / Next Vs + Read Chapter + TOC + Copy
function buildDailyVerseEmbed(v) {
  const now = new Date();
  const fullTitle = KJV_FULL_TITLES[v.book] || v.book;
  const ref = `${fullTitle} — ${v.chapter}:${v.verse}`;
  let desc = `**${ref}**\n\n`;
  if (v.verse === 1 && v.superscription) desc += `¶ ${formatKJV(v.superscription)}\n\n`;
  desc += `> "${formatKJV(v.text)}"`;
  const shortRef = `${v.book} ${v.chapter}:${v.verse}`;
  const embed = new EmbedBuilder()
    .setTitle(`📖 Daily Verse — ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`)
    .setDescription(desc)
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });

  const rows = [];
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`prevvs|${v.book}||${v.chapter}||${v.verse}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev Vs"),
    new ButtonBuilder().setCustomId(`nextvs|${v.book}||${v.chapter}||${v.verse}`).setStyle(ButtonStyle.Secondary).setLabel("Next Vs ▶"),
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dv|${v.book}||${v.chapter}||${v.verse}`).setStyle(ButtonStyle.Secondary).setLabel("📖 Read Chapter"),
    new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 TOC"),
    new ButtonBuilder().setCustomId(`copyref|${shortRef}`.slice(0, 100)).setStyle(ButtonStyle.Secondary).setLabel("📋 Copy"),
  ));
  return { embeds: [embed], components: rows };
}

// Search embed — matches V3: 5 per page, full verse text, keyword highlighting, per-result openverse buttons
function buildSearchEmbed(query, keywords, total, verses, page, sliceStart) {
  const perPage = 5;
  const totalPages = Math.ceil(total / perPage);
  const start = (typeof sliceStart === "number") ? sliceStart : page * perPage;
  const show = verses.slice(start, start + perPage);
  let desc = show.map(v => {
    const ref = v.ref || `${v.book} ${v.chapter}:${v.verse}`;
    return `**${ref}**\n\n${highlightKeywords(v.text, keywords)}`;
  }).join("\n\n");
  if (desc.length > 4000) desc = desc.slice(0, 3997) + "...";

  const embed = new EmbedBuilder()
    .setTitle(`🔍 Search: "${query}"`)
    .setDescription(desc || "No results found.")
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: `KJB Reader • Page ${page + 1} of ${Math.max(1, totalPages)} (${total} result${total !== 1 ? "s" : ""}) • kingjamesbiblereader.com` });

  const rows = [];
  // Row 1: Per-result verse buttons — search results post publicly (srchverse|), unlike
  // the private openverse| lookups used elsewhere (gospel citations, multi-ref groups).
  if (show.length > 0) {
    const resultBtns = show.map(v => {
      const ref = v.ref || `${v.book} ${v.chapter}:${v.verse}`;
      return new ButtonBuilder().setCustomId(`srchverse|${ref}`.slice(0, 100)).setStyle(ButtonStyle.Secondary).setLabel(ref);
    });
    rows.push(new ActionRowBuilder().addComponents(...resultBtns));
  }
  // Row 2: Pagination
  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`srchpg|${query.slice(0, 80)}|${page - 1}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev").setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`nopg_srch_${page}`).setStyle(ButtonStyle.Secondary).setLabel(`${page + 1} / ${totalPages}`).setDisabled(true),
      new ButtonBuilder().setCustomId(`srchpg|${query.slice(0, 80)}|${page + 1}`).setStyle(ButtonStyle.Secondary).setLabel("Next ▶").setDisabled(page >= totalPages - 1),
    ));
  }
  return { embeds: [embed], components: rows };
}

// Gospel embed — paginated
function buildGospelEmbed(page = 0) {
  const g = GOSPEL_PAGES[page];
  const embed = new EmbedBuilder()
    .setTitle(g.title)
    .setDescription(g.desc)
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: `KJB Reader • Page ${page + 1} of ${GOSPEL_PAGES.length} • kingjamesbiblereader.com` });

  const rows = [];
  if (GOSPEL_PAGES.length > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gospel|${page - 1}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev").setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`nopg_gospel_${page}`).setStyle(ButtonStyle.Secondary).setLabel(`${page + 1} / ${GOSPEL_PAGES.length}`).setDisabled(true),
      new ButtonBuilder().setCustomId(`gospel|${page + 1}`).setStyle(ButtonStyle.Secondary).setLabel("Next ▶").setDisabled(page >= GOSPEL_PAGES.length - 1),
    ));
  }

  // Verse buttons for cited references on this page (openverse| pattern)
  const refs = g.refs || [];
  if (refs.length) {
    const verseButtons = refs.map(r =>
      new ButtonBuilder()
        .setCustomId(`openverse|${r}`.slice(0, 100))
        .setStyle(ButtonStyle.Primary)
        .setLabel(`📖 ${r.length > 28 ? r.slice(0, 25) + "..." : r}`)
    );
    for (let i = 0; i < verseButtons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(...verseButtons.slice(i, i + 5)));
    }
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 TOC"),
  ));
  return { embeds: [embed], components: rows };
}

// ============ CLIENT ============

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message],
  presence: { status: "online" },
});

const GUILD_CHANNEL_MAP = new Map();

client.on("ready", async () => {
  console.log(`✅ KJB Reader online as ${client.user.tag}`);
  // Sync any guilds not yet in servers.json (catches guilds added while offline, or a locally-lost record after a restart/redeploy).
  // IMPORTANT: always silent — never re-send the @everyone welcome/announcement here. A real first-time install
  // is handled exclusively by the guildCreate event below. This path only exists to quietly rebuild a missing
  // local record (e.g. after a redeploy) without spamming a server that's already been set up.
  try {
    const guilds = [...client.guilds.cache.values()];
    const servers = loadServers();
    for (const guild of guilds) {
      const existing = servers.find(s => s.guild_id === guild.id);
      if (!existing) {
        console.log(`📝 Silently re-syncing guild missing from local record: ${guild.id}`);
        await onboardGuild(guild, { silent: true });
      }
    }
  } catch (e) { console.error("ready sync:", e.message); }
});

// ── Guild Onboarding (matches original discordGuildJoin behavior) ─────────────
async function ensureDailyVerseChannel(guild) {
  const channels = [...guild.channels.cache.values()];
  // 1. Prefer existing #daily-verse / #bible-verse / #devotion channel
  const existing = channels.find(c => /daily.?verse|bible.?verse|devotion|scripture/i.test(c.name) && c.isTextBased());
  if (existing) return { channel: existing, isNew: false };
  // 2. Try announcement channel (requires Community mode)
  const firstCategory = channels.find(c => c.type === 4);
  let channel;
  try {
    const createOpts = { name: "daily-verse", topic: "Daily King James Bible verse — powered by KJB Reader", type: 5 };
    if (firstCategory) createOpts.parentId = firstCategory.id;
    channel = await guild.channels.create(createOpts);
    return { channel, isNew: true };
  } catch (e) {
    // 3. Fall back to regular text channel
    const textOpts = { name: "daily-verse", topic: "Daily King James Bible verse — powered by KJB Reader", type: 0 };
    if (firstCategory) textOpts.parentId = firstCategory.id;
    channel = await guild.channels.create(textOpts);
    return { channel, isNew: true };
  }
}

async function ensureUpdatesChannel(guild) {
  const channels = [...guild.channels.cache.values()];
  // Check if kjb-bot-updates channel already exists
  const existing = channels.find(c => /kjb.?bot.?update|bot.?update/i.test(c.name) && c.isTextBased());
  if (existing) return;
  const firstCategory = channels.find(c => c.type === 4);
  try {
    const opts = { name: "kjb-bot-updates", topic: "KJB Reader bot updates — new features and announcements", type: 5 };
    if (firstCategory) opts.parentId = firstCategory.id;
    await guild.channels.create(opts);
  } catch (e) {
    const opts = { name: "kjb-bot-updates", topic: "KJB Reader bot updates — new features and announcements", type: 0 };
    if (firstCategory) opts.parentId = firstCategory.id;
    try { await guild.channels.create(opts); } catch {}
  }
}

function buildWelcomeEmbed() {
  return new EmbedBuilder()
    .setAuthor({ name: "KJB Reader", iconURL: KJB_LOGO })
    .setTitle("📖 Welcome to KJB Reader!")
    .setDescription([
      "Daily Bible verses from the **King James Bible**, delivered to **#daily-verse** at **12:00 PM UTC** and pinging **@everyone**.",
      "",
      "**⚙️ Setup (admins)**",
      "Type `setup` to configure:",
      "• `setup channel` — Change the daily verse channel",
      "• `setup time 8` — Set delivery hour (0-23, UTC). Default is 12 (12 PM UTC)",
      "• `setup timezone` — Set your timezone (e.g. America/Chicago)",
      "• `setup role` — Change the ping role (or @everyone)",
      "• `setup enable` / `setup disable` — Pause or resume delivery",
      "• `setup status` — View current configuration",
      "• `fix` — Repair webhook (keeps your schedule)",
      "",
      "**📖 Commands — just type (no slash needed):**",
      "`John 3:16` — Verse lookup",
      "`Psalm 23` — Full chapter",
      "`daily` — Today's verse",
      "`random` — Random verse or chapter",
      "`search faith` — Search by keyword",
      "`toc` — Browse the Bible",
      "`gospel` — How to be saved",
      "`help` — Full command list",
      "",
      "**🔀 Navigation**",
      "◀ **Prev Vs** / **Next Vs ▶** — Browse verses without retyping",
      "📖 **Read Chapter** — Jump to the full chapter",
      "◀ **Prev Ch** / **Next Ch ▶** — Navigate between chapters",
      "📋 **Copy** — Copy verse or chapter text",
      "",
      "**📬 Channels**",
      "**#daily-verse** — Daily Bible verse delivery",
      "**#kjb-bot-updates** — Bot announcements & feature updates",
      "",
      "**Install KJB Reader:**",
      "📱 **[Add to your account](https://discord.com/oauth2/authorize?client_id=1529303667348606996&scope=applications.commands&integration_type=1)** — DMs, group DMs, any server",
      "🏠 **[Add to a server](https://discord.com/oauth2/authorize?client_id=1529303667348606996&scope=bot+applications.commands&permissions=378494381072)** — Daily verse delivery",
      "",
      "**Support**",
      "Join our Discord support server: **[kingjamesbiblereader.com/discord](https://kingjamesbiblereader.com/discord)**",
      "📧 Email: **[Kingjamesbiblereader@outlook.sg](mailto:Kingjamesbiblereader@outlook.sg)**",
    ].join("\n"))
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
}

async function onboardGuild(guild, { silent = false } = {}) {
  try {
    // 1. Create #daily-verse channel (or use existing)
    const { channel: dailyChannel, isNew } = await ensureDailyVerseChannel(guild);
    // 2. Create #kjb-bot-updates channel for announcements
    await ensureUpdatesChannel(guild);

    if (!dailyChannel?.send) {
      console.error("onboardGuild: no daily-verse channel available");
      return;
    }

    // 3. Create webhook in daily-verse channel with KJB logo
    let webhookUrl = "";
    try {
      const webhook = await dailyChannel.createWebhook({ name: "KJB Reader", avatar: KJB_LOGO });
      webhookUrl = webhook.url;
    } catch (e) { console.error("onboardGuild webhook:", e.message); }

    // 4. Save to servers.json with defaults — 12 PM UTC, @everyone ping
    updateServer(guild.id, {
      guild_id: guild.id,
      guild_name: null,
      webhook_url: webhookUrl,
      channel_name: dailyChannel.name,
      role_id: "everyone",
      setup_by: "auto (bot join)",
      active: true,
      photo_enabled: false,
      verse_time: "12:00",
      timezone: "UTC",
      updates_ready: true,
    });

    // 5. Post welcome message with @everyone ping to #daily-verse — ONLY for a genuine first-time install, never on a silent resync.
    if (!silent) {
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: "@everyone", embeds: [buildWelcomeEmbed()] }),
          });
        } catch (e) { console.error("onboardGuild welcome:", e.message); }
      } else {
        // Fallback: send via channel directly
        await dailyChannel.send({ content: "@everyone", embeds: [buildWelcomeEmbed()] });
      }
    } else {
      console.log(`🔇 Skipped welcome ping for guild ${guild.id} (silent resync, not a new install)`);
    }

    // 6. Post a brief announcement in #kjb-bot-updates — also skipped on a silent resync.
    if (!silent) try {
      const updatesChannel = [...guild.channels.cache.values()].find(c => /kjb.?bot.?update/i.test(c.name) && c.isTextBased());
      if (updatesChannel?.send) {
        const announceEmbed = new EmbedBuilder()
          .setAuthor({ name: "KJB Reader", iconURL: KJB_LOGO })
          .setTitle("✅ KJB Reader is now active!")
          .setDescription([
            "Daily verses are delivered to **#daily-verse** at **12:00 PM UTC** (pinging @everyone).",
            "",
            "This channel is for bot announcements and feature updates.",
            "",
            "Type `help` anywhere to see all commands.",
          ].join("\n"))
          .setColor(0xC8922E)
          .setThumbnail(KJB_LOGO)
          .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
        await updatesChannel.send({ embeds: [announceEmbed] });
      }
    } catch (e) { console.error("onboardGuild announce:", e.message); }

    console.log(`✅ Onboarded guild ${guild.id}: #${dailyChannel.name} (new=${isNew})`);
  } catch (e) { console.error("onboardGuild:", e.message); }
}

client.on("guildCreate", async (guild) => {
  try { await onboardGuild(guild); } catch (e) { console.error("guildCreate:", e?.message || e); }
});

// ── Build interactive setup embed ────────────────────────────────────────────
const COMMON_TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "US Eastern (EST)", value: "America/New_York" },
  { label: "US Central (CST)", value: "America/Chicago" },
  { label: "US Mountain (MST)", value: "America/Denver" },
  { label: "US Pacific (PST)", value: "America/Los_Angeles" },
  { label: "Alaska (AKST)", value: "America/Anchorage" },
  { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
  { label: "Brazil (BRT)", value: "America/Sao_Paulo" },
  { label: "Argentina (ART)", value: "America/Argentina/Buenos_Aires" },
  { label: "Mexico City (CST)", value: "America/Mexico_City" },
  { label: "UK (GMT/BST)", value: "Europe/London" },
  { label: "Central Europe (CET)", value: "Europe/Berlin" },
  { label: "Eastern Europe (EET)", value: "Europe/Athens" },
  { label: "Moscow (MSK)", value: "Europe/Moscow" },
  { label: "Dubai (GST)", value: "Asia/Dubai" },
  { label: "Pakistan (PKT)", value: "Asia/Karachi" },
  { label: "India (IST)", value: "Asia/Kolkata" },
  { label: "Bangladesh (BST)", value: "Asia/Dhaka" },
  { label: "Thailand/Vietnam (ICT)", value: "Asia/Bangkok" },
  { label: "Singapore/Philippines (SGT)", value: "Asia/Singapore" },
  { label: "Hong Kong/China (HKT)", value: "Asia/Hong_Kong" },
  { label: "Japan/Korea (JST)", value: "Asia/Tokyo" },
  { label: "Australia East (AEST)", value: "Australia/Sydney" },
  { label: "New Zealand (NZST)", value: "Pacific/Auckland" },
];

function buildSetupEmbed(guildId) {
  const server = getServer(guildId) || {};
  const channelName = server.channel_name || "Not set";
  const webhookStatus = server.webhook_url ? "\u2705 Configured" : "\u274C Not set";
  const [h] = (server.verse_time || "12:00").split(":").map(Number);
  const tz = server.timezone || "UTC";
  const roleLabel = !server.role_id || server.role_id === "everyone" ? "@everyone" : "<@&" + server.role_id + ">";
  const activeStatus = server.active ? "\u2705 Active" : "\u274C Paused";

  const embed = new EmbedBuilder()
    .setAuthor({ name: "KJB Reader", iconURL: KJB_LOGO })
    .setTitle("\u2699\uFE0F KJB Reader Setup")
    .setDescription([
      "Configure daily verse delivery below.",
      "",
      "**Channel:** #" + channelName,
      "**Webhook:** " + webhookStatus,
      "**Delivery Time:** " + h + ":00 UTC (" + tz + ")",
      "**Ping Role:** " + roleLabel,
      "**Status:** " + activeStatus,
      "",
      "Select a channel, role, timezone, or time below to update.",
    ].join("\n"))
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });

  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("setup_channel")
      .setPlaceholder("Channel: #" + channelName)
      .addChannelTypes(0, 5, 10, 11, 12)
  );

  const roleRow = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId("setup_role")
      .setPlaceholder("Select a ping role...")
      .setMinValues(1)
      .setMaxValues(1)
  );
  const tzRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("setup_tz")
      .setPlaceholder("Timezone: " + tz)
      .addOptions(COMMON_TIMEZONES.map(t => ({
        label: t.label,
        value: t.value,
        default: t.value === tz,
      })))
      .addOptions({
        label: "\u270f\uFE0F Custom timezone...",
        value: "__custom__",
        default: false,
      })
  );

  // Time as dropdown — 24 options in one row instead of 24 buttons in 4 rows
  const timeRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("setup_time")
      .setPlaceholder("Delivery time: " + h + ":00 UTC")
      .addOptions(Array.from({ length: 24 }, (_, hr) => ({
        label: hr + ":00 UTC",
        value: String(hr),
        default: h === hr,
      })))
  );

  // Everyone / Enable / Disable / Fix Webhook buttons — merged into one row to stay within Discord's 5-action-row limit
  const toggleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup_everyone")
      .setLabel("Use @everyone")
      .setStyle(server.role_id === "everyone" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("setup_enable")
      .setLabel("Enable")
      .setStyle(server.active ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(server.active),
    new ButtonBuilder()
      .setCustomId("setup_disable")
      .setLabel("Disable")
      .setStyle(!server.active ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(!server.active),
    new ButtonBuilder()
      .setCustomId("setup_fix")
      .setLabel("🔧 Fix Webhook")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [channelRow, roleRow, tzRow, timeRow, toggleRow],
    allowedMentions: { parse: [] },
  };
}

// Extract searchable text from a message's content PLUS any embeds it carries —
// covers link-unfurl embeds, webhook-posted embeds, and Discord "Forward" message snapshots,
// so a verse reference sitting inside an embed (not just plain text) still gets detected.
function extractSearchableText(message) {
  const parts = [message.content || ""];

  const pullEmbed = (embed) => {
    if (!embed) return;
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    if (Array.isArray(embed.fields)) {
      for (const f of embed.fields) {
        if (f.name) parts.push(f.name);
        if (f.value) parts.push(f.value);
      }
    }
    if (embed.footer?.text) parts.push(embed.footer.text);
    if (embed.author?.name) parts.push(embed.author.name);
  };

  for (const embed of message.embeds || []) pullEmbed(embed);

  // Forwarded messages (Discord "Forward" feature) carry their content in messageSnapshots
  const snapshots = message.messageSnapshots;
  if (snapshots) {
    const list = typeof snapshots.values === "function" ? [...snapshots.values()] : Array.isArray(snapshots) ? snapshots : [];
    for (const snap of list) {
      const m = snap.message || snap;
      if (m?.content) parts.push(m.content);
      for (const embed of m?.embeds || []) pullEmbed(embed);
    }
  }

  return parts.filter(Boolean).join("\n");
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  try {
  const content = extractSearchableText(message);
  const isMention = message.mentions.users.has(client.user.id);
  const cleaned = content.replace(/<@!?\d+>/g, "").trim();
  const isShort = isMention || cleaned.length <= 80;
  const text = cleaned.toLowerCase();

  // Help command
  if (isShort && /^(help|commands)\s*$/i.test(text)) {
    const helpEmbed = new EmbedBuilder()
      .setTitle("📖 KJB Reader — Help")
      .setDescription([
        "**No slash commands or @mention needed!**",
        "",
        "**Type a verse reference in any channel:**",
        "• `John 3:16` — Instant verse lookup",
        "• `Psalm 23` — Read a full chapter",
        "• `1 Corinthians 15:1-4` — Verse range",
        "",
        "**Or just type a command:**",
        "• `read John 3:16` — Same as typing the reference directly",
        "• `daily` — Today's verse",
        "• `random` — Random verse",
        "• `random chapter` — Random chapter",
        "• `search faith` — Search by keyword",
        "• `search love hope` — Multi-word search",
        "• `toc` — Browse the Bible table of contents",
        "• `gospel` — How to be saved",
        "• `help` — This message",
        "",
        "**You can also @mention the bot** or use `kjb` prefix with any command.",
        "",
        "**Server admin? Type `setup` to configure daily verse delivery.**",
        "",
        "**Support:**",
        "Join our Discord: **[kingjamesbiblereader.com/discord](https://kingjamesbiblereader.com/discord)**",
        "📧 Email: **[Kingjamesbiblereader@outlook.sg](mailto:Kingjamesbiblereader@outlook.sg)**",
        "",
        "Bible App powered by **[kingjamesbiblereader.com](https://kingjamesbiblereader.com)**",
      ].join("\n"))
      .setColor(0xC8922E)
      .setThumbnail(KJB_LOGO)
      .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
    await message.reply({ embeds: [helpEmbed] });
    return;
  }

  // Daily verse
  if (isShort && /^daily\s*$/i.test(text)) {
    try {
      const now = new Date();
      const data = await callBibleApi({ action: "daily_verse", clientDate: `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}` });
      const v = data?.verse || data;
      if (v?.text) {
        await message.reply(buildDailyVerseEmbed(v));
      }
    } catch (e) { console.error("daily:", e.message); }
    return;
  }

  // Random verse (supports optional testament: "random ot" / "random nt")
  if (isShort && /^random\s*(ot|nt|old|new)?\s*$/i.test(text)) {
    try {
      const testamentMatch = text.match(/^random\s+(ot|nt|old|new)\s*$/i);
      const testament = testamentMatch ? (testamentMatch[1].toUpperCase().startsWith("O") || testamentMatch[1].toUpperCase() === "OT" ? "OT" : "NT") : null;
      const apiParams = { action: "random_verse" };
      if (testament) apiParams.testament = testament;
      const data = await callBibleApi(apiParams);
      if (data?.verse) {
        await message.reply(buildVerseEmbed([data.verse]));
      }
    } catch (e) { console.error("random:", e.message); }
    return;
  }

  // Random chapter (supports optional testament: "random chapter ot" / "random chapter nt")
  if (isShort && /^random\s+chapter\s*(ot|nt|old|new)?\s*$/i.test(text)) {
    try {
      const testamentMatch = text.match(/^random\s+chapter\s+(ot|nt|old|new)\s*$/i);
      const testament = testamentMatch ? (testamentMatch[1].toUpperCase().startsWith("O") || testamentMatch[1].toUpperCase() === "OT" ? "OT" : "NT") : null;
      const pool = testament ? (testament === "OT" ? OT_BOOKS : NT_BOOKS) : ALL_BOOKS;
      const book = pool[Math.floor(Math.random() * pool.length)];
      const chapter = Math.floor(Math.random() * KJV_BOOKS[book]) + 1;
      const data = await callBibleApi({ action: "getChapter", book, chapter });
      if (data?.verses?.length) {
        await message.reply(buildChapterEmbed(book, chapter, data.verses, data.colophon, data.bookFullName));
      }
    } catch (e) { console.error("random chapter:", e.message); }
    return;
  }

  // Search (paginated, 5 per page, full verse text with highlighting)
  // Supports: "search faith", "search faith ot", "search faith nt",
  //           "search faith whole", "search faith ot whole", "search faith, hope nt"
  if (isShort && /^search\s+/i.test(text)) {
    let raw = text.replace(/^search\s+/i, "").trim();
    if (!raw) return;
    try {
      // Extract optional testament and match mode from the query
      let testament = null;
      let wholeWord = false;
      // Check for "whole" / "exact" keyword
      const wholeMatch = raw.match(/\b(whole|exact)\s*(?:word)?\b/i);
      if (wholeMatch) {
        wholeWord = true;
        raw = raw.replace(wholeMatch[0], "").trim();
      }
      // Check for testament
      const testamentMatch = raw.match(/\b(ot|nt|old\s*testament|new\s*testament|old\s*test|new\s*test)\b\s*$/i);
      if (testamentMatch) {
        const t = testamentMatch[1].toLowerCase();
        testament = (t.startsWith("o") || t === "ot") ? "OT" : "NT";
        raw = raw.replace(testamentMatch[0], "").trim();
      }
      const query = raw;
      const words = query.toLowerCase().split(/[,;\s]+/).filter(Boolean).map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
      if (!words.length) return;

      function filterTestament(verses) {
        if (!testament) return verses;
        return verses.filter(v => testament === "OT" ? OT_SET.has(v.book) : !OT_SET.has(v.book));
      }

      let results;
      if (words.length === 1) {
        const searchData = await callBibleApi({ action: "search", query: words[0], offset: 0, wholeWord });
        let verses = searchData?.results || [];
        verses = filterTestament(verses);
        results = { total: verses.length, verses };
      } else {
        // Smart multi-word: fetch only the rarest word fully, then text-match the rest
        const firstPages = await Promise.all(words.map(w =>
          callBibleApi({ action: "search", query: w, offset: 0, wholeWord }).catch(() => null)
        ));
        if (firstPages.some(p => !p || !p.total)) {
          results = { total: 0, verses: [] };
        } else {
        let minIdx = 0;
        for (let i = 1; i < words.length; i++) {
          if ((firstPages[i]?.total || 0) < (firstPages[minIdx]?.total || 0)) minIdx = i;
        }
        const baseResults = [...(firstPages[minIdx]?.results || [])];
        const total = firstPages[minIdx]?.total || 0;
        for (let off = 100; off < total && off < 5000; off += 100) {
          const d = await callBibleApi({ action: "search", query: words[minIdx], offset: off, wholeWord });
          const batch = d?.results || [];
          if (!batch.length) break;
          baseResults.push(...batch);
        }
        const otherWords = words.filter((_, i) => i !== minIdx);
        const otherRegexes = otherWords.map(w => new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"));
        let intersected = baseResults.filter(v => {
          const text = (v.text || "").toLowerCase();
          return otherRegexes.every(re => re.test(text));
        });
        intersected = filterTestament(intersected);
        results = { total: intersected.length, verses: intersected };
        }
      }
      if (!results.total) {
        let hint = "";
        if (testament) hint += ` in the ${testament === "OT" ? "Old" : "New"} Testament`;
        if (wholeWord) hint += " (whole word match)";
        await message.reply({ content: `❌ No verses found for "**${query}**"${hint}.`, allowedMentions: { repliedUser: false } });
        return;
      }
      const searchTitle = `${query}${testament ? ` (${testament === "OT" ? "Old" : "New"} Testament)` : ""}${wholeWord ? " · whole word" : ""}`;
      await message.reply(buildSearchEmbed(searchTitle, words, results.total, results.verses, 0));
    } catch (e) {
      console.error("search:", e.message);
      await message.reply({ content: "❌ Search failed. Try again!", allowedMentions: { repliedUser: false } });
    }
    return;
  }

  // Gospel (paginated)
  if (isShort && /^gospel\s*$/i.test(text)) {
    await message.reply(buildGospelEmbed(0));
    return;
  }

  // TOC (Table of Contents)
  if (isShort && /^(toc|chapters|books|table of contents)\s*$/i.test(text)) {
    await message.reply(buildBibleTocEmbed(0));
    return;
  }

  // Setup command — interactive configuration with Discord components
  // ── Setup subcommands ──────────────────────────────────────────────────────
  if (isShort && /^setup\s+/i.test(text) && message.guild) {
    if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply({ content: "❌ You need **Manage Server** permission to use setup.", allowedMentions: { repliedUser: false } });
      return;
    }

    const sub = text.replace(/^setup\s+/i, "").trim();
    const server = getServer(message.guild.id) || {};

    // setup channel — show interactive panel (channel select)
    if (/^channel\s*$/i.test(sub)) {
      await message.reply(buildSetupEmbed(message.guild.id));
      return;
    }

    // setup time <hour> — set delivery hour directly
    if (/^time\s+(\d{1,2})$/i.test(sub)) {
      const hr = parseInt(sub.match(/^time\s+(\d{1,2})$/i)[1]);
      if (isNaN(hr) || hr < 0 || hr > 23) {
        await message.reply({ content: "❌ Time must be 0-23 (UTC). Example: `setup time 8`", allowedMentions: { repliedUser: false } });
        return;
      }
      updateServer(message.guild.id, { verse_time: String(hr).padStart(2, "0") + ":00" });
      await message.reply({ content: "✅ Delivery time set to **" + hr + ":00 UTC**.", allowedMentions: { repliedUser: false } });
      return;
    }

    // setup time — show interactive time buttons
    if (/^time\s*$/i.test(sub)) {
      await message.reply(buildSetupEmbed(message.guild.id));
      return;
    }

    // setup timezone <tz> — set timezone directly
    if (/^timezone\s+(.+)$/i.test(sub)) {
      const tzInput = sub.match(/^timezone\s+(.+)$/i)[1].trim();
      const TZ_ALIASES = {
        "SGT": "Asia/Singapore", "JST": "Asia/Tokyo", "HKT": "Asia/Hong_Kong",
        "IST": "Asia/Kolkata", "GST": "Asia/Dubai", "CET": "Europe/Berlin",
        "GMT": "Europe/London", "BST": "Europe/London", "UTC": "UTC",
        "EST": "America/New_York", "CST": "America/Chicago", "MST": "America/Denver",
        "PST": "America/Los_Angeles", "BRT": "America/Sao_Paulo", "AEST": "Australia/Sydney",
      };
      const resolved = TZ_ALIASES[tzInput.toUpperCase()] || tzInput;
      try {
        Intl.DateTimeFormat("en-US", { timeZone: resolved });
      } catch {
        await message.reply({ content: "❌ Invalid timezone. Try `SGT`, `EST`, `PST`, or an IANA name like `America/Chicago`.", allowedMentions: { repliedUser: false } });
        return;
      }
      updateServer(message.guild.id, { timezone: resolved });
      const label = tzInput.toUpperCase() !== resolved ? tzInput.toUpperCase() + " → " + resolved : resolved;
      await message.reply({ content: "✅ Timezone set to **" + label + "**.", allowedMentions: { repliedUser: false } });
      return;
    }

    // setup timezone — show interactive timezone select
    if (/^timezone\s*$/i.test(sub)) {
      await message.reply(buildSetupEmbed(message.guild.id));
      return;
    }

    // setup role — show interactive role select
    if (/^role\s*$/i.test(sub)) {
      await message.reply(buildSetupEmbed(message.guild.id));
      return;
    }

    // setup role @role — set role by mention
    if (/^role\s+<@&(\d+)>$/i.test(sub)) {
      const roleId = sub.match(/^role\s+<@&(\d+)>$/i)[1];
      updateServer(message.guild.id, { role_id: roleId });
      await message.reply({ content: "✅ Ping role set to <@&" + roleId + ">.", allowedMentions: { repliedUser: false } });
      return;
    }

    // setup role everyone
    if (/^role\s+everyone$/i.test(sub)) {
      updateServer(message.guild.id, { role_id: "everyone" });
      await message.reply({ content: "✅ Ping role set to **@everyone**.", allowedMentions: { repliedUser: false } });
      return;
    }

    // setup enable
    if (/^enable\s*$/i.test(sub)) {
      if (!server.webhook_url) {
        await message.reply({ content: "❌ No channel configured. Type `setup` first.", allowedMentions: { repliedUser: false } });
        return;
      }
      updateServer(message.guild.id, { active: true });
      await message.reply({ content: "✅ Daily verse delivery **enabled**.", allowedMentions: { repliedUser: false } });
      return;
    }

    // setup disable
    if (/^disable\s*$/i.test(sub)) {
      updateServer(message.guild.id, { active: false });
      await message.reply({ content: "✅ Daily verse delivery **disabled**.", allowedMentions: { repliedUser: false } });
      return;
    }

    // setup status
    if (/^status\s*$/i.test(sub)) {
      await message.reply(buildSetupEmbed(message.guild.id));
      return;
    }

    // Unknown subcommand
    await message.reply({ content: "❌ Unknown setup command. Try: `setup`, `setup channel`, `setup time 8`, `setup timezone SGT`, `setup role`, `setup enable`, `setup disable`, `setup status`.", allowedMentions: { repliedUser: false } });
    return;
  }

  // setup (no args) — show interactive panel
  if (isShort && /^setup\s*$/i.test(text)) {
    if (!message.guild) {
      await message.reply({ content: "❌ Setup can only be used in a server.", allowedMentions: { repliedUser: false } });
      return;
    }
    if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply({ content: "❌ You need **Manage Server** permission to use setup.", allowedMentions: { repliedUser: false } });
      return;
    }
    await message.reply(buildSetupEmbed(message.guild.id));
    return;
  }

  // Enable daily delivery
  if (isShort && /^enable\s*$/i.test(text) && message.guild) {
    if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return;
    const server = getServer(message.guild.id);
    if (!server?.webhook_url) {
      await message.reply({ content: "❌ No channel configured. Type `setup` first.", allowedMentions: { repliedUser: false } });
      return;
    }
    updateServer(message.guild.id, { active: true });
    await message.reply({ content: "✅ Daily verse delivery **enabled**.", allowedMentions: { repliedUser: false } });
    return;
  }

  // Disable daily delivery
  if (isShort && /^disable\s*$/i.test(text) && message.guild) {
    if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return;
    updateServer(message.guild.id, { active: false });
    await message.reply({ content: "✅ Daily verse delivery **disabled**.", allowedMentions: { repliedUser: false } });
    return;
  }

  // Status — show current config
  if (isShort && /^status\s*$/i.test(text) && message.guild) {
    if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return;
    const server = getServer(message.guild.id);
    if (!server) {
      await message.reply({ content: "❌ No configuration found. Type `setup` to get started.", allowedMentions: { repliedUser: false } });
      return;
    }
    const tzLabel = server.timezone || "UTC";
    const [h] = (server.verse_time || "12:00").split(":").map(Number);
    const roleLabel = !server.role_id || server.role_id === "everyone" ? "@everyone" : `<@&${server.role_id}>`;
    const embed = new EmbedBuilder()
      .setTitle("📖 KJB Reader — Server Status")
      .setDescription([
        `**Channel:** ${server.channel_name || "Not set"}`,
        `**Webhook:** ${server.webhook_url ? "✅ Configured" : "❌ Not set"}`,
        `**Delivery Time:** ${h}:00 ${tzLabel}`,
        `**Ping Role:** ${roleLabel}`,
        `**Active:** ${server.active ? "✅ Yes" : "❌ No"}`,
        `**Last Sent:** ${server.last_sent_date || "Never"}`,
        "",
        "Type `setup` to reconfigure, `enable`/`disable` to toggle.",
      ].join("\n"))
      .setColor(0xC8922E).setThumbnail(KJB_LOGO)
      .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    return;
  }

  // Fix — repair webhook only (no daily verse delivery)
  if (isShort && /^fix\s*$/i.test(text)) {
    if (!message.guild) {
      await message.reply({ content: "\u274C Fix can only be used in a server.", allowedMentions: { repliedUser: false } });
      return;
    }
    if (!message.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply({ content: "\u274C You need **Manage Server** permission to use fix.", allowedMentions: { repliedUser: false } });
      return;
    }
    const server = getServer(message.guild.id);
    if (!server) {
      await message.reply({ content: "\u274C No configuration found. Type `setup` to get started.", allowedMentions: { repliedUser: false } });
      return;
    }

    const steps = [];

    // 1. Repair webhook — test existing, recreate if dead
    let webhookUrl = server.webhook_url;
    let channelName = server.channel_name;
    try {
      if (webhookUrl) {
        const testRes = await fetch(webhookUrl, { method: "GET" });
        if (testRes.status === 404 || testRes.status === 410) {
          webhookUrl = ""; // Dead, need to recreate
          steps.push("\u26A0\uFE0F Existing webhook was dead");
        } else {
          // Webhook alive — patch avatar
          await patchWebhookAvatar(webhookUrl);
          steps.push("\u2705 Webhook OK (avatar patched)");
        }
      }

      if (!webhookUrl) {
        const { channel } = await ensureDailyVerseChannel(message.guild);
        if (channel?.createWebhook) {
          const webhook = await channel.createWebhook({ name: "KJB Reader", avatar: KJB_LOGO });
          webhookUrl = webhook.url;
          channelName = channel.name;
          updateServer(message.guild.id, { webhook_url: webhookUrl, channel_name: channelName, active: true });
          steps.push("\u2705 New webhook created in #" + channelName);
        }
      }
    } catch (e) {
      console.error("fix webhook repair:", e.message);
      steps.push("\u274C Webhook repair failed: " + e.message);
    }

    // 2. Ensure updates channel exists
    try {
      await ensureUpdatesChannel(message.guild);
      steps.push("\u2705 Updates channel OK");
    } catch (e) {
      steps.push("\u274C Updates channel check failed: " + e.message);
    }

    const fixResult = new EmbedBuilder()
      .setAuthor({ name: "KJB Reader", iconURL: KJB_LOGO })
      .setTitle("\u2699\uFE0F Fix Complete")
      .setDescription(steps.join("\n"))
      .setColor(0xC8922E)
      .setThumbnail(KJB_LOGO)
      .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
    await message.reply({ embeds: [fixResult], allowedMentions: { repliedUser: false } });
    return;
  }

  // "read" prefix — treat as a verse/chapter reference (alias for just typing the reference)
  let refText = text;
  if (isShort && /^read\s+/i.test(text)) {
    const stripped = cleaned.replace(/^read\s+/i, "").trim();
    if (stripped) refText = stripped.toLowerCase();
  }

  // Try to parse as Bible reference(s) — supports comma/semicolon separated multi-ref
  
  // Check for multiple references separated by commas or semicolons
  // e.g. "John 3:16, Romans 5:8" or "John 3:16; Romans 5:8; Rev 3:20"
  const multiRefPattern = /\b((?:[123]\s*)?[A-Za-z]{2,}(?:\s[A-Za-z]+)?)\s+(\d+):(\d+)(?:([,-])(\d+))?\b/g;
  const allMatches = [...content.matchAll(multiRefPattern)].filter(m => {
    const book = tryResolveBook(m[1]);
    return book && KJV_BOOKS[book] && parseInt(m[2]) >= 1 && parseInt(m[2]) <= KJV_BOOKS[book];
  });

  if (allMatches.length > 1) {
    // Multiple verse references — fetch all and show in one embed
    // Allow up to 5000-char messages with multi-refs; cap total verses at 200
    if (!isMention && content.length > 5000) return;
    try {
      // Build all refs and fetch in parallel batches
      const allRefs = [];
      for (const m of allMatches) {
        const book = tryResolveBook(m[1]);
        const chapter = parseInt(m[2]);
        const vsStart = parseInt(m[3]);
        const delim = m[4]; // '-' = range, ',' = specific verses
        const vsEnd = m[5] ? parseInt(m[5]) : null;
        if (vsEnd) {
          if (delim === '-') {
            // Dash range: fetch all verses from start to end
            for (let v = vsStart; v <= vsEnd; v++) allRefs.push(`${book} ${chapter}:${v}`);
          } else {
            // Comma: fetch just the two specific verses
            allRefs.push(`${book} ${chapter}:${vsStart}`);
            allRefs.push(`${book} ${chapter}:${vsEnd}`);
          }
        } else {
          allRefs.push(`${book} ${chapter}:${vsStart}`);
        }
      }
      const MAX_VERSES = 200;
      if (allRefs.length > MAX_VERSES) {
        await message.reply({ content: `❌ That's ${allRefs.length} verses — please limit to ${MAX_VERSES} at a time.`, allowedMentions: { repliedUser: false } });
        return;
      }
      const allVerses = await fetchVersesBatch(allRefs);
      // Deduplicate by ref, preserve user input order
      const seen = new Set();
      const deduped = allVerses.filter(v => {
        const ref = `${v.book} ${v.chapter}:${v.verse}`;
        if (seen.has(ref)) return false;
        seen.add(ref);
        return true;
      });
      
      const validDeduped = deduped.filter(isValidVerse);
      if (validDeduped.length) {
        await message.reply(buildVerseEmbed(validDeduped));
      } else {
        await message.reply({ content: "❌ Verses not found.", allowedMentions: { repliedUser: false } });
      }
    } catch (e) {
      console.error("multi-ref:", e.message);
      await message.reply({ content: "❌ Something went wrong looking up those verses.", allowedMentions: { repliedUser: false } });
    }
    return;
  }

  const parsed = parseRef(refText);

  // Also try matching a single reference anywhere in the message (inline detection)
  // Uses matchAll with the global regex to get proper capture groups
  let inlineRef = null;
  if (!parsed) {
    const inlineMatches = [...content.matchAll(multiRefPattern)].filter(m => {
      const book = tryResolveBook(m[1]);
      return book && KJV_BOOKS[book] && parseInt(m[2]) >= 1 && parseInt(m[2]) <= KJV_BOOKS[book];
    });
    if (inlineMatches.length) {
      const m = inlineMatches[0]; // take the first valid match
      const book = tryResolveBook(m[1]);
      const chapter = parseInt(m[2]);
      inlineRef = { book, chapter, verseStart: parseInt(m[3]), verseEnd: m[5] ? parseInt(m[5]) : null };
    } else {
      // Fallback: chapter-only reference (no ":verse") anywhere in the message, e.g.
      // "Psalm 23 is beautiful" or "I love Psalm 23" — previously this only worked when
      // the ENTIRE message was exactly the reference (via parseRef above).
      const chapterOnlyPattern = /\b((?:[123]\s*)?[A-Za-z]{2,}(?:\s[A-Za-z]+)?)\s+(\d+)\b/g;
      const chapterMatches = [...content.matchAll(chapterOnlyPattern)].filter(m => {
        const book = resolveBookCapitalized(m[1]);
        return book && KJV_BOOKS[book] && parseInt(m[2]) >= 1 && parseInt(m[2]) <= KJV_BOOKS[book];
      });
      if (chapterMatches.length) {
        const m = chapterMatches[0];
        const book = resolveBookCapitalized(m[1]);
        const chapter = parseInt(m[2]);
        inlineRef = { book, chapter, verseStart: null, verseEnd: null };
      }
    }
  }

  const ref = parsed || inlineRef;
  if (!ref) return;

  // Only skip very long messages that don't contain a valid reference match
  // (the ref was already validated above, so we allow it through)
  if (!isMention && content.length > 5000 && !inlineRef && !parsed) return;

  try {
    // Verse lookup
    if (ref.verseStart !== null) {
      const refs = [];
      if (ref.verseEnd) {
        for (let v = ref.verseStart; v <= ref.verseEnd; v++) refs.push(`${ref.book} ${ref.chapter}:${v}`);
      } else {
        refs.push(`${ref.book} ${ref.chapter}:${ref.verseStart}`);
      }
      const results = await Promise.all(refs.map(r => callBibleApi({ action: "resolve_refs", refs: [r] }).then(d => d?.verses?.[0]).catch(() => null)));
      const verses = results.filter(isValidVerse);
      if (verses.length) {
        await message.reply(buildVerseEmbed(verses));
      } else {
        await message.reply({ content: `❌ "${refText}" not found in the KJB.`, allowedMentions: { repliedUser: false } });
      }
    }
    // Chapter lookup
    else {
      const data = await callBibleApi({ action: "getChapter", book: ref.book, chapter: ref.chapter });
      if (data?.verses?.length) {
        await message.reply(buildChapterEmbed(ref.book, ref.chapter, data.verses, data.colophon, data.bookFullName));
      } else {
        await message.reply({ content: `❌ ${ref.book} ${ref.chapter} not found.`, allowedMentions: { repliedUser: false } });
      }
    }
  } catch (e) {
    console.error("ref lookup:", e.message);
    await message.reply({ content: "❌ Something went wrong. Try again!", allowedMentions: { repliedUser: false } });
  }
  } catch (e) {
    console.error("messageCreate error:", e?.message || e);
    try { await message.reply({ content: "❌ Something went wrong. Try again!", allowedMentions: { repliedUser: false } }); } catch {}
  }
});

// ============ BUTTON HANDLERS ============

client.on("interactionCreate", async (interaction) => {
  try {
  // Handle select menus (setup)
  if (interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
    const id = interaction.customId;
    
    if (id === "setup_channel") {
      const channel = interaction.channels.first();
      if (!channel) return interaction.reply({ content: "❌ No channel selected.", flags: 64 });
      try {
        // Create webhook for the channel
        const webhook = await channel.createWebhook({ name: "KJB Reader", avatar: KJB_LOGO });
        updateServer(interaction.guild.id, { channel_name: channel.name, webhook_url: webhook.url, updates_ready: true });
        await interaction.update(buildSetupEmbed(interaction.guild.id));
        await interaction.followUp({ content: `✅ Channel set to **#${channel.name}** with webhook.`, flags: 64 });
      } catch (e) {
        console.error("setup_channel:", e.message);
        interaction.reply({ content: "❌ Could not create webhook. Ensure I have **Manage Webhooks** permission.", flags: 64 }).catch(() => {});
      }
      return;
    }
    
    if (id === "setup_role") {
      const role = interaction.roles.first();
      const roleId = role ? role.id : "everyone";
      updateServer(interaction.guild.id, { role_id: roleId });
      await interaction.update(buildSetupEmbed(interaction.guild.id));
      if (role) await interaction.followUp({ content: `✅ Ping role set to **@${role.name}**.`, flags: 64 });
      else await interaction.followUp({ content: `✅ Ping role set to **@everyone**.`, flags: 64 });
      return;
    }
    
    if (id === "setup_tz") {
      const tz = interaction.values[0];
      if (tz === "__custom__") {
        const modal = new ModalBuilder()
          .setCustomId("setup_tz_custom")
          .setTitle("Enter IANA Timezone");
        const input = new TextInputBuilder()
          .setCustomId("tz_value")
          .setLabel("e.g. Asia/Tokyo, America/New_York, Europe/London")
          .setStyle(1)
          .setMinLength(2)
          .setMaxLength(40)
          .setPlaceholder("Enter a valid IANA timezone name")
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        return;
      }
      updateServer(interaction.guild.id, { timezone: tz });
      await interaction.update(buildSetupEmbed(interaction.guild.id));
      await interaction.followUp({ content: "\u2705 Timezone set to **" + tz + "**.", flags: 64 });
      return;
    }

    if (id === "setup_time") {
      const hr = parseInt(interaction.values[0]);
      if (isNaN(hr) || hr < 0 || hr > 23) return;
      updateServer(interaction.guild.id, { verse_time: String(hr).padStart(2, "0") + ":00" });
      await interaction.update(buildSetupEmbed(interaction.guild.id));
      await interaction.followUp({ content: "\u2705 Delivery time set to **" + hr + ":00 UTC**.", flags: 64 });
      return;
    }
    
    return;
  }

  // Handle setup time buttons
  // Handle custom timezone modal submit
  if (interaction.isModalSubmit() && interaction.customId === "setup_tz_custom") {
    let tzValue = interaction.fields.getTextInputValue("tz_value").trim();
    const TZ_ALIASES = {
      "SGT": "Asia/Singapore", "JST": "Asia/Tokyo", "KST": "Asia/Seoul",
      "HKT": "Asia/Hong_Kong", "IST": "Asia/Kolkata", "GST": "Asia/Dubai",
      "PKT": "Asia/Karachi", "BST": "Asia/Dhaka", "ICT": "Asia/Bangkok",
      "PHT": "Asia/Manila", "CET": "Europe/Berlin", "EET": "Europe/Athens",
      "MSK": "Europe/Moscow", "GMT": "Europe/London", "BST_UK": "Europe/London",
      "UTC": "UTC", "EST": "America/New_York", "CST": "America/Chicago",
      "MST": "America/Denver", "PST": "America/Los_Angeles",
      "AKST": "America/Anchorage", "HST": "Pacific/Honolulu",
      "BRT": "America/Sao_Paulo", "ART": "America/Argentina/Buenos_Aires",
      "AEST": "Australia/Sydney", "NZST": "Pacific/Auckland",
    };
    const resolved = TZ_ALIASES[tzValue.toUpperCase()] || tzValue;
    try {
      Intl.DateTimeFormat("en-US", { timeZone: resolved });
    } catch (e) {
      await interaction.reply({ content: "\u274C **" + tzValue + "** is not a valid timezone.\nTry abbreviations like \`SGT\`, \`EST\`, \`PST\`, or an IANA name like \`Asia/Singapore\`, \`America/New_York\`.", flags: 64 });
      return;
    }
    updateServer(interaction.guild.id, { timezone: resolved });
    await interaction.reply({ content: "\u2705 Timezone set to **" + resolved + "**" + (resolved !== tzValue ? " (" + tzValue.toUpperCase() + ")" : "") + ".", flags: 64 });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup_everyone") {
    updateServer(interaction.guild.id, { role_id: "everyone" });
    await interaction.update(buildSetupEmbed(interaction.guild.id));
    await interaction.followUp({ content: "\u2705 Ping role set to **@everyone**.", flags: 64 });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup_enable") {
    updateServer(interaction.guild.id, { active: true });
    await interaction.update(buildSetupEmbed(interaction.guild.id));
    await interaction.followUp({ content: "\u2705 Daily verse delivery **enabled**.", flags: 64 });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup_disable") {
    updateServer(interaction.guild.id, { active: false });
    await interaction.update(buildSetupEmbed(interaction.guild.id));
    await interaction.followUp({ content: "\u2705 Daily verse delivery **disabled**.", flags: 64 });
    return;
  }

  if (interaction.isButton() && interaction.customId === "setup_fix") {
    await interaction.deferReply({ flags: 64 });
    const server = getServer(interaction.guild.id) || {};
    let webhookUrl = server.webhook_url;
    let channelName = server.channel_name;
    const steps = [];
    try {
      if (webhookUrl) {
        const testRes = await fetch(webhookUrl, { method: "GET" });
        if (testRes.status === 404 || testRes.status === 410) {
          webhookUrl = "";
          steps.push("\u26A0\uFE0F Existing webhook was dead");
        } else {
          await patchWebhookAvatar(webhookUrl);
          steps.push("\u2705 Webhook OK (avatar patched)");
        }
      }
      if (!webhookUrl) {
        const { channel } = await ensureDailyVerseChannel(interaction.guild);
        if (channel?.createWebhook) {
          const webhook = await channel.createWebhook({ name: "KJB Reader", avatar: KJB_LOGO });
          webhookUrl = webhook.url;
          channelName = channel.name;
          updateServer(interaction.guild.id, { webhook_url: webhookUrl, channel_name: channelName, active: true });
          steps.push("\u2705 New webhook created in #" + channelName);
        }
      }
    } catch (e) {
      steps.push("\u274C Webhook repair failed: " + e.message);
    }
    await interaction.editReply({ content: steps.join("\n"), flags: 64 });
    return;
  }

  // ============ SLASH COMMANDS ============
  if (interaction.isAutocomplete()) {
    try {
      const focused = interaction.options.getFocused(true);
      if (focused.name === "book") {
        const q = (focused.value || "").toLowerCase();
        const matches = ALL_BOOKS.filter(b => b.toLowerCase().includes(q)).slice(0, 25);
        await interaction.respond(matches.map(b => ({ name: b, value: b })));
      } else {
        await interaction.respond([]);
      }
    } catch (e) { console.error("autocomplete:", e.message); }
    return;
  }

  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    try {
      if (commandName === "read") {
        const refText = interaction.options.getString("reference");
        if (!refText) { await interaction.reply(buildBibleTocEmbed(0)); return; }
        const parsed = parseRef(refText);
        if (!parsed) {
          // Try resolving as a book name alone (e.g. "John" -> show chapter list)
          const book = resolveBook(refText);
          if (book && KJV_BOOKS[book]) { const r = buildBookTocEmbed(book, 0); await interaction.reply(r || { content: `❌ ${book} not found.`, flags: 64 }); return; }
          await interaction.reply({ content: `❌ Couldn't understand "${refText}".`, flags: 64 }); return;
        }
        if (parsed.verseStart) {
          const verses = (await resolveRefRange(refText)).filter(isValidVerse);
          if (verses.length) await interaction.reply(buildVerseEmbed(verses));
          else await interaction.reply({ content: `❌ "${refText}" not found in the KJB.`, flags: 64 });
        } else {
          const data = await callBibleApi({ action: "getChapter", book: parsed.book, chapter: parsed.chapter });
          if (data?.verses?.length) await interaction.reply(buildChapterEmbed(parsed.book, parsed.chapter, data.verses, data.colophon, data.bookFullName));
          else await interaction.reply({ content: `❌ ${parsed.book} ${parsed.chapter} not found.`, flags: 64 });
        }
        return;
      }

      if (commandName === "random") {
        const type = interaction.options.getString("type") || "verse";
        const testament = interaction.options.getString("testament"); // "OT" or "NT"
        if (type === "chapter") {
          // For chapter, filter by testament if specified
          const pool = testament ? (testament === "OT" ? OT_BOOKS : NT_BOOKS) : ALL_BOOKS;
          const book = pool[Math.floor(Math.random() * pool.length)];
          const chapter = Math.floor(Math.random() * KJV_BOOKS[book]) + 1;
          const data = await callBibleApi({ action: "getChapter", book, chapter });
          if (data?.verses?.length) await interaction.reply(buildChapterEmbed(book, chapter, data.verses, data.colophon, data.bookFullName));
          else await interaction.reply({ content: "❌ Could not fetch a random chapter.", flags: 64 });
        } else {
          // API supports testament filtering for random_verse
          const apiParams = { action: "random_verse" };
          if (testament) apiParams.testament = testament;
          const data = await callBibleApi(apiParams);
          if (data?.verse) await interaction.reply(buildVerseEmbed([data.verse]));
          else await interaction.reply({ content: "❌ Could not fetch a random verse.", flags: 64 });
        }
        return;
      }

      if (commandName === "daily") {
        const now = new Date();
        const data = await callBibleApi({ action: "daily_verse", clientDate: `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}` });
        const v = data?.verse || data;
        if (v?.text) await interaction.reply(buildDailyVerseEmbed(v));
        else await interaction.reply({ content: "❌ Could not fetch today's verse.", flags: 64 });
        return;
      }

      if (commandName === "gospel") { await interaction.reply(buildGospelEmbed(0)); return; }

      if (commandName === "toc") {
        const bookInput = interaction.options.getString("book");
        if (!bookInput) { await interaction.reply(buildBibleTocEmbed(0)); return; }
        const book = resolveBook(bookInput);
        const r = book ? buildBookTocEmbed(book, 0) : null;
        await interaction.reply(r || { content: `❌ Unknown book "${bookInput}".`, flags: 64 });
        return;
      }

      if (commandName === "search") {
        const query = interaction.options.getString("keyword")?.trim();
        const testament = interaction.options.getString("testament"); // "OT" or "NT"
        const matchMode = interaction.options.getString("match"); // "whole" or "partial"
        if (!query) { await interaction.reply({ content: "❌ Please provide a keyword.", flags: 64 }); return; }
        await interaction.deferReply();
        const wholeWord = matchMode === "whole";
        const words = query.toLowerCase().split(/[,;\s]+/).filter(Boolean).map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
        if (!words.length) { await interaction.editReply({ content: "❌ Please provide a keyword." }); return; }
        console.log(`[search] query="${query}" words=${JSON.stringify(words)} testament=${testament} wholeWord=${wholeWord}`);
        
        // Use existing OT_SET for client-side testament filtering
        function filterTestament(verses) {
          if (!testament) return verses;
          return verses.filter(v => testament === "OT" ? OT_SET.has(v.book) : !OT_SET.has(v.book));
        }
        
        let results;
        if (words.length === 1) {
          const searchData = await callBibleApi({ action: "search", query: words[0], offset: 0, wholeWord });
          let verses = searchData?.results || [];
          verses = filterTestament(verses);
          results = { total: verses.length, verses };
        } else {
          // Smart multi-word: fetch only the rarest word fully, then text-match the rest
          // 1) Get total counts for each word via first page
          const firstPages = await Promise.all(words.map(w =>
            callBibleApi({ action: "search", query: w, offset: 0, wholeWord }).catch(() => null)
          ));
          // If any word has 0 results, no intersection possible
          if (firstPages.some(p => !p || !p.total)) {
            results = { total: 0, verses: [] };
          } else {
          // Find rarest word (fewest total results)
          let minIdx = 0;
          for (let i = 1; i < words.length; i++) {
            if ((firstPages[i]?.total || 0) < (firstPages[minIdx]?.total || 0)) minIdx = i;
          }
          // 2) Fetch ALL results for the rarest word
          const baseResults = [...(firstPages[minIdx]?.results || [])];
          const total = firstPages[minIdx]?.total || 0;
          for (let off = 100; off < total && off < 5000; off += 100) {
            const d = await callBibleApi({ action: "search", query: words[minIdx], offset: off, wholeWord });
            const batch = d?.results || [];
            if (!batch.length) break;
            baseResults.push(...batch);
          }
          // 3) Build list of other words to check in verse text (word-boundary match)
          const otherWords = words.filter((_, i) => i !== minIdx);
          const otherRegexes = otherWords.map(w => new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"));
          // 4) Filter base results: verse text must contain all other words
          let intersected = baseResults.filter(v => {
            const text = (v.text || "").toLowerCase();
            return otherRegexes.every(re => re.test(text));
          });
          intersected = filterTestament(intersected);
          results = { total: intersected.length, verses: intersected };
          }
        }
        console.log(`[search] results: total=${results.total} verses=${results.verses.length}`);
        if (!results.total) {
          let hint = "";
          if (testament) hint += ` in the ${testament === "OT" ? "Old" : "New"} Testament`;
          if (wholeWord) hint += " (whole word match)";
          await interaction.editReply({ content: `❌ No verses found for "**${query}**"${hint}.` });
          return;
        }
        const searchTitle = `${query}${testament ? ` (${testament === "OT" ? "Old" : "New"} Testament)` : ""}${wholeWord ? " · whole word" : ""}`;
        await interaction.editReply(buildSearchEmbed(searchTitle, words, results.total, results.verses, 0));
        return;
      }

      if (commandName === "help") {
        // DMs have no server context — hide server-admin-only commands (/setup) and
        // the "type naturally" tip (a guild-channel convenience) so DM users only see
        // what actually works for them there.
        const inGuild = !!interaction.guild;
        const helpLines = [
          "**Slash commands:**",
          "• `/read [reference]` — Verse, range, or chapter (e.g. `John 3:16`, `Psalm 23`, `1 Corinthians 15:1-4`) or Table of Contents",
          "• `/random [type]` — Random verse or chapter",
          "• `/daily` — Today's daily verse",
          "• `/search [keyword]` — Search verses by keyword",
          "• `/toc [book]` — Browse the Bible table of contents",
          "• `/gospel` — How to be saved",
        ];
        if (inGuild) {
          helpLines.push("• `/setup` — (Server admin) Configure daily verse delivery");
        }
        helpLines.push("");
        if (inGuild) {
          helpLines.push(
            "**Or just type naturally** in any channel — no slash needed:",
            "`John 3:16`, `Psalm 23`, `random`, `search faith`, `daily`, `toc`, `gospel`",
            "",
          );
        }
        helpLines.push(
          "**Install KJB Reader:**",
          "📱 **[Add to your account](https://discord.com/oauth2/authorize?client_id=1529303667348606996&scope=applications.commands&integration_type=1)** — DMs, group DMs, any server",
          "🏠 **[Add to a server](https://discord.com/oauth2/authorize?client_id=1529303667348606996&scope=bot+applications.commands&permissions=378494381072)** — Daily verse delivery",
        );
        helpLines.push(
          "",
          "**Support:**",
          "Join our Discord: **[kingjamesbiblereader.com/discord](https://kingjamesbiblereader.com/discord)**",
          "📧 Email: **[Kingjamesbiblereader@outlook.sg](mailto:Kingjamesbiblereader@outlook.sg)**",
          "",
          "Bible App powered by **[kingjamesbiblereader.com](https://kingjamesbiblereader.com)**",
        );
        const helpEmbed = new EmbedBuilder()
          .setTitle("📖 KJB Reader — Help")
          .setDescription(helpLines.join("\n"))
          .setColor(0xC8922E).setThumbnail(KJB_LOGO)
          .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
        await interaction.reply({ embeds: [helpEmbed] });
        return;
      }

      if (commandName === "setup") {
        if (!interaction.guild) { await interaction.reply({ content: "❌ Setup can only be used in a server.", flags: 64 }); return; }
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
          await interaction.reply({ content: "❌ You need **Manage Server** permission to use setup.", flags: 64 });
          return;
        }
        await interaction.reply(buildSetupEmbed(interaction.guild.id));
        return;
      }

      if (commandName === "fix") {
        if (!interaction.guild) { await interaction.reply({ content: "❌ Fix can only be used in a server.", flags: 64 }); return; }
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
          await interaction.reply({ content: "❌ You need **Manage Server** permission to use this.", flags: 64 });
          return;
        }
        await interaction.deferReply({ flags: 64 });
        const steps = [];
        let server = getServer(interaction.guild.id) || {};
        let webhookUrl = server.webhook_url;
        try {
          if (webhookUrl) {
            const testRes = await fetch(webhookUrl, { method: "GET" });
            if (testRes.status === 404 || testRes.status === 410) {
              webhookUrl = "";
              steps.push("⚠️ Existing webhook was dead");
            } else {
              await patchWebhookAvatar(webhookUrl);
              steps.push("✅ Webhook OK (avatar patched)");
            }
          }
          if (!webhookUrl) {
            const { channel } = await ensureDailyVerseChannel(interaction.guild);
            if (channel?.createWebhook) {
              const webhook = await channel.createWebhook({ name: "KJB Reader", avatar: KJB_LOGO });
              webhookUrl = webhook.url;
              updateServer(interaction.guild.id, { webhook_url: webhookUrl, channel_name: channel.name });
              steps.push(`✅ Created webhook in #${channel.name}`);
            } else {
              steps.push("❌ Could not create webhook — check my **Manage Webhooks** permission.");
            }
          }
        } catch (e) {
          steps.push("❌ Webhook repair failed: " + e.message);
        }
        await interaction.editReply({ content: steps.join("\n") });
        return;
      }
    } catch (e) {
      console.error(`slash command ${commandName}:`, e.message);
      const errPayload = { content: "❌ Something went wrong. Try again!", flags: 64 };
      if (interaction.deferred || interaction.replied) await interaction.editReply(errPayload).catch(() => {});
      else await interaction.reply(errPayload).catch(() => {});
    }
    return;
  }

  if (!interaction.isButton()) return;
  const customId = interaction.customId;

  // Copy verse button
  if (customId.startsWith("copyref|")) {
    const ref = customId.slice("copyref|".length);
    try {
      const chapterOnly = !ref.includes(":") && ref.match(/^(.+?)\s+(\d+)$/);
      let copyText = "";
      if (chapterOnly) {
        const d = await callBibleApi({ action: "getChapter", book: chapterOnly[1].trim(), chapter: parseInt(chapterOnly[2]) });
        const verses = d?.verses || [];
        if (!verses.length) return interaction.reply({ content: "❌ Not found.", flags: 64 });
        copyText = `${chapterOnly[1].trim()} ${chapterOnly[2]} (KJB)\n` + verses.map(v => `[${v.verse}] ${stripMd(v.text)}`).join("\n");
        if (d.colophon) copyText += `\n¶ ${stripMd(d.colophon)}`;
      } else {
        const verses = (await resolveRefRange(ref)).filter(isValidVerse);
        if (!verses.length) return interaction.reply({ content: "❌ Verse not found.", flags: 64 });
        const first = verses[0], last = verses[verses.length - 1];
        const refLabel = verses.length > 1 ? `${first.book} ${first.chapter}:${first.verse}-${last.verse}` : `${first.book} ${first.chapter}:${first.verse}`;
        copyText = `${refLabel} (KJB) — ` + verses.map(v => stripMd(v.text)).join(" ");
      }
      const chunks = [];
      const lines = copyText.split("\n");
      let cur = "";
      for (const line of lines) { const add = (cur ? "\n" : "") + line; if (cur.length + add.length > 1800) { chunks.push(cur); cur = line; } else cur += add; }
      if (cur) chunks.push(cur);
      if (chunks.length === 1) return interaction.reply({ content: "```\n" + chunks[0] + "\n```", flags: 64 });
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) await interaction.reply({ content: "```\n" + chunks[i] + "\n```", flags: 64 });
        else await interaction.followUp({ content: "```\n" + chunks[i] + "\n```", flags: 64 });
      }
    } catch (e) { console.error("copy:", e.message); interaction.reply({ content: "❌ Could not fetch.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Copy chapter button
  if (customId.startsWith("chcopy|")) {
    const rest = customId.slice("chcopy|".length);
    const sep = rest.indexOf("||");
    if (sep === -1) return interaction.reply({ content: "❌ Invalid.", flags: 64 });
    const book = rest.slice(0, sep), chapter = parseInt(rest.slice(sep + 2));
    try {
      const d = await callBibleApi({ action: "getChapter", book, chapter });
      const verses = d?.verses || [];
      if (!verses.length) return interaction.reply({ content: "❌ Not found.", flags: 64 });
      let copyText = `${book} ${chapter} (KJB)\n` + verses.map(v => `[${v.verse}] ${stripMd(v.text)}`).join("\n");
      if (d.colophon) copyText += `\n¶ ${stripMd(d.colophon)}`;
      const chunks = [];
      const lines = copyText.split("\n");
      let cur = "";
      for (const line of lines) { const add = (cur ? "\n" : "") + line; if (cur.length + add.length > 1800) { chunks.push(cur); cur = line; } else cur += add; }
      if (cur) chunks.push(cur);
      if (chunks.length === 1) return interaction.reply({ content: "```\n" + chunks[0] + "\n```", flags: 64 });
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) await interaction.reply({ content: "```\n" + chunks[i] + "\n```", flags: 64 });
        else await interaction.followUp({ content: "```\n" + chunks[i] + "\n```", flags: 64 });
      }
    } catch (e) { console.error("chcopy:", e.message); interaction.reply({ content: "❌ Could not fetch.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Chapter page navigation
  if (customId.startsWith("chpg|")) {
    const parts = customId.slice("chpg|".length).split("|");
    try {
      const d = await callBibleApi({ action: "getChapter", book: parts[0], chapter: parseInt(parts[1]) });
      if (d?.verses?.length) {
        await interaction.update(buildChapterEmbed(parts[0], parseInt(parts[1]), d.verses, d.colophon, d.bookFullName, parseInt(parts[2]) || 0));
      }
    } catch (e) { console.error("chpg:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Prev/Next chapter navigation
  if (customId.startsWith("prevch|") || customId.startsWith("nextch|")) {
    const parts = customId.slice(customId.indexOf("|") + 1).split("||");
    try {
      const d = await callBibleApi({ action: "getChapter", book: parts[0], chapter: parseInt(parts[1]) });
      if (d?.verses?.length) {
        await interaction.update(buildChapterEmbed(parts[0], parseInt(parts[1]), d.verses, d.colophon, d.bookFullName, 0));
      }
    } catch (e) { console.error("nav:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
    return;
  }

  // TOC chapter selection
  if (customId.startsWith("toc_ch|")) {
    const parts = customId.slice("toc_ch|".length).split("||");
    try {
      const d = await callBibleApi({ action: "getChapter", book: parts[0], chapter: parseInt(parts[1]) });
      if (d?.verses?.length) {
        await interaction.update(buildChapterEmbed(parts[0], parseInt(parts[1]), d.verses, d.colophon, d.bookFullName, 0));
      }
    } catch (e) { console.error("toc_ch:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Read Chapter from verse (dv) — opens chapter at the verse's page
  if (customId.startsWith("dv|")) {
    const parts = customId.slice("dv|".length).split("||");
    const book = parts[0], chapter = parseInt(parts[1]), hlVerse = parseInt(parts[2]) || 0;
    try {
      const d = await callBibleApi({ action: "getChapter", book, chapter });
      if (d?.verses?.length) {
        // Find which page the highlighted verse is on
        const pageSize = 20;
        let targetPage = 0;
        if (hlVerse > 0) {
          for (let p = 0; p * pageSize < d.verses.length; p++) {
            const pageVerses = d.verses.slice(p * pageSize, (p + 1) * pageSize);
            if (pageVerses.some(v => v.verse === hlVerse)) { targetPage = p; break; }
          }
        }
        await interaction.update(buildChapterEmbed(book, chapter, d.verses, d.colophon, d.bookFullName, targetPage));
      }
    } catch (e) { console.error("dv:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Prev/Next verse navigation
  if (customId.startsWith("prevvs|") || customId.startsWith("nextvs|")) {
    const isNext = customId.startsWith("nextvs|");
    const parts = customId.split("||");
    const book = parts[0].slice(isNext ? "nextvs|".length : "prevvs|".length);
    const chapter = parseInt(parts[1]);
    const verse = parseInt(parts[2]);
    try {
      let targetBook = book, targetCh = chapter, targetVs = verse;
      if (isNext) {
        const d = await callBibleApi({ action: "getChapter", book, chapter });
        const verses = d?.verses || [];
        const idx = verses.findIndex(v => v.verse === verse);
        if (idx >= 0 && idx < verses.length - 1) {
          targetVs = verses[idx + 1].verse;
        } else {
          // Next chapter, verse 1
          const next = getNextCh(book, chapter);
          if (!next) return interaction.reply({ content: "❌ Already at the end.", flags: 64 });
          targetBook = next.book; targetCh = next.chapter; targetVs = 1;
        }
      } else {
        if (verse > 1) {
          targetVs = verse - 1;
        } else {
          // Prev chapter, last verse
          const prev = getPrevCh(book, chapter);
          if (!prev) return interaction.reply({ content: "❌ Already at the beginning.", flags: 64 });
          targetBook = prev.book; targetCh = prev.chapter;
          const d = await callBibleApi({ action: "getChapter", book: prev.book, chapter: prev.chapter });
          const verses = d?.verses || [];
          targetVs = verses.length ? verses[verses.length - 1].verse : 1;
        }
      }
      const d = await callBibleApi({ action: "resolve_refs", refs: [`${targetBook} ${targetCh}:${targetVs}`] });
      const v = d?.verses?.[0];
      if (v && isValidVerse(v)) {
        await interaction.update(buildVerseEmbed([v]));
      } else {
        interaction.reply({ content: "❌ Verse not found.", flags: 64 }).catch(() => {});
      }
    } catch (e) { console.error("prevvs/nextvs:", e.message); interaction.reply({ content: "❌ Verse not found.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Verse embed pagination (long verse ranges / multi-refs that don't fit in one embed)
  if (customId.startsWith("vspg|")) {
    const parts = customId.slice("vspg|".length).split("|");
    const cacheId = parts[0];
    const page = parseInt(parts[1]) || 0;
    const entry = verseEmbedCache.get(cacheId);
    if (!entry) {
      return interaction.reply({ content: "❌ This lookup expired — please run the verse command again.", flags: 64 }).catch(() => {});
    }
    try {
      await interaction.update(buildVerseEmbed(entry.verses, page, cacheId));
    } catch (e) { console.error("vspg:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Download the full passage as a .txt file (shown when a verse lookup spans multiple pages)
  if (customId.startsWith("vsfile|")) {
    const cacheId = customId.slice("vsfile|".length);
    const entry = verseEmbedCache.get(cacheId);
    if (!entry) {
      return interaction.reply({ content: "❌ This lookup expired — please run the verse command again.", flags: 64 }).catch(() => {});
    }
    try {
      const attachment = new AttachmentBuilder(Buffer.from(entry.fullText, "utf-8"), { name: `${entry.title.replace(/[^\w\- ]/g, "").slice(0, 60) || "verses"}.txt` });
      await interaction.reply({ files: [attachment], flags: 64 });
    } catch (e) { console.error("vsfile:", e.message); interaction.reply({ content: "❌ Error generating file.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Open verse from search results — posts a NEW PUBLIC message (visible to everyone
  // in the channel), unlike the private openverse| lookups used elsewhere.
  if (customId.startsWith("srchverse|")) {
    const ref = customId.slice("srchverse|".length);
    try {
      const verses = (await resolveRefRange(ref)).filter(isValidVerse);
      if (verses.length) {
        await interaction.reply(buildVerseEmbed(verses));
      } else {
        interaction.reply({ content: "❌ Verse not found.", flags: 64 }).catch(() => {});
      }
    } catch (e) { console.error("srchverse:", e.message); interaction.reply({ content: "❌ Verse not found.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Open verse from gospel citations / multi-ref group buttons — private lookup
  if (customId.startsWith("openverse|")) {
    const ref = customId.slice("openverse|".length);
    try {
      const verses = (await resolveRefRange(ref)).filter(isValidVerse);
      if (verses.length) {
        await interaction.reply({ ...buildVerseEmbed(verses), flags: 64 });
      } else {
        interaction.reply({ content: "❌ Verse not found.", flags: 64 }).catch(() => {});
      }
    } catch (e) { console.error("openverse:", e.message); interaction.reply({ content: "❌ Verse not found.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Daily verse button
  if (customId.startsWith("dailyverse|")) {
    try {
      const now = new Date();
      const data = await callBibleApi({ action: "daily_verse", clientDate: `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}` });
      const v = data?.verse || data;
      if (v?.text) {
        await interaction.reply(buildDailyVerseEmbed(v));
      } else {
        interaction.reply({ content: "❌ Could not fetch daily verse.", flags: 64 }).catch(() => {});
      }
    } catch (e) { console.error("dailyverse:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Testament browser
  if (customId.startsWith("testament|")) {
    const parts = customId.split("|");
    const test = parts[1] || "OT";
    const page = parseInt(parts[2]) || 0;
    await interaction.update(buildTestamentEmbed(test, page));
    return;
  }

  // Gospel pagination
  if (customId.startsWith("gospel|")) {
    const page = parseInt(customId.split("|")[1]) || 0;
    if (page < 0 || page >= GOSPEL_PAGES.length) return;
    await interaction.update(buildGospelEmbed(page));
    return;
  }

  // Book TOC (chapter selector)
  if (customId.startsWith("toc|")) {
    const parts = customId.slice("toc|".length).split("||");
    const book = parts[0];
    const pageIdx = parseInt(parts[1]) || 0;
    const result = buildBookTocEmbed(book, pageIdx);
    if (!result) return;
    await interaction.update(result);
    return;
  }

  // Full Bible TOC
  if (customId.startsWith("bibletoc|")) {
    const page = parseInt(customId.split("|")[1]) || 0;
    await interaction.update(buildBibleTocEmbed(page));
    return;
  }

  // Search page navigation
  if (customId.startsWith("srchpg|")) {
    const parts = customId.slice("srchpg|".length).split("|");
    const query = parts.slice(0, -1).join("|");
    const page = parseInt(parts[parts.length - 1]) || 0;
    if (page < 0) return;
    try {
      await interaction.deferUpdate();
      const words = query.toLowerCase().split(/[,;\s]+/).filter(Boolean).map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
      let verses, total;
      let sliceStart = page * 5;
      if (words.length === 1) {
        // Single word: fetch the 100-item chunk that contains this page, then let
        // buildSearchEmbed slice the exact 5-item window (via sliceStart) — do NOT
        // pre-slice here, or the page gets sliced twice and comes back empty.
        const off = Math.floor((page * 5) / 100) * 100;
        const searchData = await callBibleApi({ action: "search", query: words[0], offset: off });
        verses = searchData?.results || [];
        total = searchData?.total || 0;
        sliceStart = (page * 5) - off;
      } else {
        // Smart multi-word: same approach as initial search
        const firstPages = await Promise.all(words.map(w =>
          callBibleApi({ action: "search", query: w, offset: 0 }).catch(() => null)
        ));
        if (firstPages.some(p => !p || !p.total)) {
          return interaction.editReply({ content: "❌ No results.", embeds: [], components: [] });
        }
        let minIdx = 0;
        for (let i = 1; i < words.length; i++) {
          if ((firstPages[i]?.total || 0) < (firstPages[minIdx]?.total || 0)) minIdx = i;
        }
        const baseResults = [...(firstPages[minIdx]?.results || [])];
        const totalCount = firstPages[minIdx]?.total || 0;
        for (let off = 100; off < totalCount && off < 5000; off += 100) {
          const d = await callBibleApi({ action: "search", query: words[minIdx], offset: off });
          const batch = d?.results || [];
          if (!batch.length) break;
          baseResults.push(...batch);
        }
        const otherWords = words.filter((_, i) => i !== minIdx);
        const otherRegexes = otherWords.map(w => new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"));
        verses = baseResults.filter(v => {
          const text = (v.text || "").toLowerCase();
          return otherRegexes.every(re => re.test(text));
        });
        total = verses.length;
        sliceStart = page * 5;
      }
      if (!total) return interaction.editReply({ content: "❌ No results.", embeds: [], components: [] });
      await interaction.editReply(buildSearchEmbed(query, words, total, verses, page, sliceStart));
    } catch (e) {
      console.error("srchpg:", e.message);
      // deferUpdate() was already called above, so the interaction is acknowledged —
      // must use editReply here, not reply(), or Discord shows "app didn't respond".
      interaction.editReply({ content: "❌ Error loading that page.", embeds: [], components: [] }).catch(() => {});
    }
    return;
  }
  } catch (e) {
    console.error("interactionCreate error:", e?.message || e);
    try { if (!interaction.deferred && !interaction.replied) await interaction.reply({ content: "❌ Something went wrong.", flags: 64 }); } catch {}
  }
});

// Hourly cron: daily verse delivery check (runs at :00 each hour)
cron.schedule("0 * * * *", () => {
  console.log(`[${new Date().toISOString()}] Running hourly daily verse check...`);
  deliverDailyVerse().catch(e => console.error("Daily delivery error:", e));
});

// Log startup
console.log(`KJB Reader gateway bot starting...`);
console.log(`Servers configured: ${loadServers().length}`);

// Heartbeat — log every 5 min so we can see if the bot is alive
setInterval(() => {
  console.log(`[${new Date().toISOString()}] Heartbeat — ${client.guilds.cache.size} guilds, ${client.ws.ping}ms ping`);
}, 300000);

client.login(process.env.DISCORD_BOT_TOKEN);
