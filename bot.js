import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, PermissionsBitField, ModalBuilder, TextInputBuilder } from "discord.js";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

// Gospel pages (paginated)
const GOSPEL_PAGES = [
  { title: "✝️ HOW TO BE SAVED — Page 1/4", desc: "**The Gospel of the Lord Jesus Christ**\n\nFor I delivered unto you first of all that which I also received, how that **Christ died for our sins according to the scriptures;**\n\nAnd that **he was buried,** and that **he rose again the third day according to the scriptures:** (1 Corinthians 15:3-4)\n\n📖 *Continue reading...*" },
  { title: "✝️ HOW TO BE SAVED — Page 2/4", desc: "**All have sinned**\n\nFor all have sinned, and come short of the glory of God. (Romans 3:23)\n\nWherefore, as by one man sin entered into the world, and death by sin; and so death passed upon all men, for that all have sinned. (Romans 5:12)\n\n**The wages of sin is death; but the gift of God is eternal life through Jesus Christ our Lord.** (Romans 6:23)\n\n📖 *Continue reading...*" },
  { title: "✝️ HOW TO BE SAVED — Page 3/4", desc: "**God's Gift — Salvation by Grace through Faith**\n\nFor by grace are ye saved through faith; and that not of yourselves: it is the gift of God: Not of works, lest any man should boast. (Ephesians 2:8-9)\n\n**That if thou shalt confess with thy mouth the Lord Jesus, and shalt believe in thine heart that God hath raised him from the dead, thou shalt be saved.** (Romans 10:9)\n\nFor whosoever shall call upon the name of the Lord shall be saved. (Romans 10:13)\n\n📖 *Continue reading...*" },
  { title: "✝️ HOW TO BE SAVED — Page 4/4", desc: "**Believe on the Lord Jesus Christ**\n\nFor God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. (John 3:16)\n\nVerily, verily, I say unto you, He that heareth my word, and believeth on him that sent me, hath everlasting life, and shall not come into condemnation; but is passed from death unto life. (John 5:24)\n\n**Trust Jesus Christ as your Saviour today!**\n\n📖 Full gospel: https://kingjamesbiblereader.com/gospel" },
];

function resolveBook(input) {
  const norm = input.trim();
  for (const full of ALL_BOOKS) { if (full.toLowerCase() === norm.toLowerCase()) return full; }
  const key = norm.toLowerCase().replace(/\s+/g, "");
  if (ALIASES[key]) return ALIASES[key];
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
function isValidVerse(v) {
  return v && v.text != null && v.book != null && v.chapter != null && v.verse != null;
}

function buildVerseEmbed(verses) {
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
  
  let title, desc;
  
  if (sameBook && sameChapter && valid.length > 1) {
    // Dash range in same chapter (e.g., John 3:16-18) — show verses TOGETHER
    title = `${fullTitle} — ${first.chapter}:${first.verse}–${last.verse}`;
    desc = (first.verse === 1 && first.superscription) ? `¶ ${formatKJV(first.superscription)}\n\n` : "";
    desc += verses.map(v => `**[${v.verse}]** ${formatKJV(v.text)}`).join("\n\n");
  } else if (valid.length === 1) {
    // Single verse
    title = `${fullTitle} — ${first.chapter}:${first.verse}`;
    desc = (first.verse === 1 && first.superscription) ? `¶ ${formatKJV(first.superscription)}\n\n` : "";
    desc += `"${formatKJV(valid[0].text)}"`;
  } else if (sameBook && !sameChapter) {
    // Same book, different chapters
    title = fullTitle;
    desc = verses.map(v => `**${v.chapter}:${v.verse}**\n"${formatKJV(v.text)}"`).join("\n\n");
  } else {
    // Multiple books or refs (e.g., 1 Cor 15:1-4, Romans 3:25, Eph 1:13)
    title = "Multiple Verses";
    desc = groups.map(g => {
      const gTitle = KJV_FULL_TITLES[g[0].book] || g[0].book;
      if (g.length === 1) {
        return `**${gTitle} — ${g[0].chapter}:${g[0].verse}**\n"${formatKJV(g[0].text)}"`;
      } else {
        const ref = `${g[0].chapter}:${g[0].verse}–${g[g.length - 1].verse}`;
        const text = g.map(v => `**[${v.verse}]** ${formatKJV(v.text)}`).join(" ");
        return `**${gTitle} — ${ref}**\n${text}`;
      }
    }).join("\n\n");
  }
  
  if (desc.length > 4000) desc = desc.slice(0, 3997) + "...";

  const embed = new EmbedBuilder()
    .setTitle(`📖 ${title}`)
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
    // Multi-ref: grouped Copy buttons (one per range/group) + TOC
    // Row 1: TOC + up to 4 group Copy buttons
    const groupButtons = groups.slice(0, 4).map(g => {
      const gFirst = g[0], gLast = g[g.length - 1];
      const ref = g.length === 1
        ? `${gFirst.book} ${gFirst.chapter}:${gFirst.verse}`
        : `${gFirst.book} ${gFirst.chapter}:${gFirst.verse}-${gLast.verse}`;
      const label = g.length === 1
        ? `📋 ${gFirst.book} ${gFirst.chapter}:${gFirst.verse}`
        : `📋 ${gFirst.book} ${gFirst.chapter}:${gFirst.verse}-${gLast.verse}`;
      return new ButtonBuilder().setCustomId(`copyref|${ref}`.slice(0, 100)).setStyle(ButtonStyle.Secondary).setLabel(label);
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
          ? `📋 ${gFirst.book} ${gFirst.chapter}:${gFirst.verse}`
          : `📋 ${gFirst.book} ${gFirst.chapter}:${gFirst.verse}-${gLast.verse}`;
        return new ButtonBuilder().setCustomId(`copyref|${ref}`.slice(0, 100)).setStyle(ButtonStyle.Secondary).setLabel(label);
      });
      rows.push(new ActionRowBuilder().addComponents(...groupButtons2));
    }
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
  text += pageVerses.map(v => `[${v.verse}] ${formatKJV(v.text)}`).join("\n\n");
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
function buildSearchEmbed(query, keywords, total, verses, page) {
  const perPage = 5;
  const totalPages = Math.ceil(total / perPage);
  const start = page * perPage;
  const show = verses.slice(start, start + perPage);
  let desc = show.map(v => {
    const ref = v.ref || `${v.book} ${v.chapter}:${v.verse}`;
    return `**${ref}**\n${highlightKeywords(v.text, keywords)}`;
  }).join("\n\n");
  if (desc.length > 4000) desc = desc.slice(0, 3997) + "...";

  const embed = new EmbedBuilder()
    .setTitle(`🔍 Search: "${query}"`)
    .setDescription(desc || "No results found.")
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: `KJB Reader • Page ${page + 1} of ${Math.max(1, totalPages)} (${total} result${total !== 1 ? "s" : ""}) • kingjamesbiblereader.com` });

  const rows = [];
  // Row 1: Per-result openverse buttons
  if (show.length > 0) {
    const resultBtns = show.map(v => {
      const ref = v.ref || `${v.book} ${v.chapter}:${v.verse}`;
      return new ButtonBuilder().setCustomId(`openverse|${ref}`.slice(0, 100)).setStyle(ButtonStyle.Secondary).setLabel(ref);
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
  return { embeds: [embed], components: rows };
}

// ============ CLIENT ============

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], presence: { status: "online" } });

const GUILD_CHANNEL_MAP = new Map();

client.on("ready", async () => {
  console.log(`✅ KJB Reader online as ${client.user.tag}`);
  // Sync any guilds not yet in servers.json (catches guilds added while offline)
  try {
    const guilds = [...client.guilds.cache.values()];
    const servers = loadServers();
    for (const guild of guilds) {
      const existing = servers.find(s => s.guild_id === guild.id);
      if (!existing) {
        console.log(`📝 Syncing new guild: ${guild.id}`);
        await onboardGuild(guild);
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
      "• `fix` — Repair webhook & reset delivery schedule",
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
      "**Support**",
      "Join our Discord support server: **[kingjamesbiblereader.com/discord](https://kingjamesbiblereader.com/discord)**",
      "📧 Email: **[Kingjamesbiblereader@outlook.sg](mailto:Kingjamesbiblereader@outlook.sg)**",
    ].join("\n"))
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
}

async function onboardGuild(guild) {
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

    // 5. Post welcome message with @everyone ping to #daily-verse
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

    // 6. Post a brief announcement in #kjb-bot-updates
    try {
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
  const everyoneRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup_everyone")
      .setLabel("Use @everyone")
      .setStyle(server.role_id === "everyone" ? ButtonStyle.Success : ButtonStyle.Secondary)
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

  // Enable/Disable buttons
  const toggleRow = new ActionRowBuilder().addComponents(
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
    components: [channelRow, roleRow, everyoneRow, tzRow, timeRow, toggleRow],
    allowedMentions: { parse: [] },
  };
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  try {
  const content = message.content;
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

  // Random verse
  if (isShort && /^random\s*$/i.test(text)) {
    try {
      const data = await callBibleApi({ action: "random_verse" });
      if (data?.verse) {
        await message.reply(buildVerseEmbed([data.verse]));
      }
    } catch (e) { console.error("random:", e.message); }
    return;
  }

  // Random chapter
  if (isShort && /^random\s+chapter\s*$/i.test(text)) {
    try {
      const book = ALL_BOOKS[Math.floor(Math.random() * ALL_BOOKS.length)];
      const chapter = Math.floor(Math.random() * KJV_BOOKS[book]) + 1;
      const data = await callBibleApi({ action: "getChapter", book, chapter });
      if (data?.verses?.length) {
        await message.reply(buildChapterEmbed(book, chapter, data.verses, data.colophon, data.bookFullName));
      }
    } catch (e) { console.error("random chapter:", e.message); }
    return;
  }

  // Search (paginated, 5 per page, full verse text with highlighting)
  if (isShort && /^search\s+/i.test(text)) {
    const query = text.replace(/^search\s+/i, "").trim();
    if (!query) return;
    try {
      const words = query.toLowerCase().split(/[,;\s]+/).filter(Boolean).map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
      if (!words.length) return;

      let results;
      if (words.length === 1) {
        const searchData = await callBibleApi({ action: "search", query: words[0], offset: 0 });
        results = { total: searchData?.total || 0, verses: searchData?.results || [] };
      } else {
        // Multi-word intersection: fetch all results for each keyword, find intersection
        const allSets = await Promise.all(words.map(async w => {
          const all = [];
          for (let off = 0; off < 1000; off += 100) {
            const d = await callBibleApi({ action: "search", query: w, offset: off });
            const batch = d?.results || [];
            if (!batch.length) break;
            all.push(...batch);
          }
          return all;
        }));
        // Use smallest set as base, filter by intersection on ref
        let minIdx = 0;
        for (let i = 1; i < allSets.length; i++) { if (allSets[i].length < allSets[minIdx].length) minIdx = i; }
        const otherSets = allSets.filter((_, i) => i !== minIdx).map(s => new Set(s.map(v => v.ref || `${v.book} ${v.chapter}:${v.verse}`)));
        results = {
          total: 0,
          verses: allSets[minIdx].filter(v => {
            const ref = v.ref || `${v.book} ${v.chapter}:${v.verse}`;
            return otherSets.every(s => s.has(ref));
          })
        };
        results.total = results.verses.length;
      }
      if (!results.total) {
        await message.reply({ content: `❌ No verses found for "**${query}**".`, allowedMentions: { repliedUser: false } });
        return;
      }
      await message.reply(buildSearchEmbed(query, words, results.total, results.verses, 0));
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

    // 3. Reset last_sent_date so next scheduled delivery will fire
    try {
      updateServer(message.guild.id, { last_sent_date: "" });
      steps.push("\u2705 Delivery schedule reset");
    } catch (e) {
      steps.push("\u274C Could not reset schedule: " + e.message);
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

  // Try to parse as Bible reference(s) — supports comma/semicolon separated multi-ref
  let refText = text;
  
  // Check for multiple references separated by commas or semicolons
  // e.g. "John 3:16, Romans 5:8" or "John 3:16; Romans 5:8; Rev 3:20"
  const multiRefPattern = /\b((?:[123]\s*)?[A-Za-z]{2,}(?:\s[A-Za-z]+)?)\s+(\d+):(\d+)(?:-(\d+))?\b/g;
  const allMatches = [...content.matchAll(multiRefPattern)].filter(m => {
    const book = resolveBook(m[1]);
    return book && KJV_BOOKS[book] && parseInt(m[2]) >= 1 && parseInt(m[2]) <= KJV_BOOKS[book];
  });

  if (allMatches.length > 1) {
    // Multiple verse references — fetch all and show in one embed
    if (!isMention && content.length > 150) return;
    try {
      const allVerses = [];
      for (const m of allMatches) {
        try {
          const book = resolveBook(m[1]);
          const chapter = parseInt(m[2]);
          const vsStart = parseInt(m[3]);
          const vsEnd = m[4] ? parseInt(m[4]) : null;
          if (vsEnd) {
            for (let v = vsStart; v <= vsEnd; v++) {
              const d = await callBibleApi({ action: "resolve_refs", refs: [`${book} ${chapter}:${v}`] });
              if (d?.verses?.[0]) allVerses.push(d.verses[0]);
            }
          } else {
            const d = await callBibleApi({ action: "resolve_refs", refs: [`${book} ${chapter}:${vsStart}`] });
            if (d?.verses?.[0]) allVerses.push(d.verses[0]);
          }
        } catch (verseErr) {
          console.error("multi-ref verse fetch failed:", verseErr.message);
        }
      }
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
  let inlineRef = null;
  if (!parsed) {
    const inlineMatch = content.match(multiRefPattern);
    if (inlineMatch) {
      const m = inlineMatch[0];
      const book = resolveBook(m[1] || m);
      if (book) {
        const chapter = parseInt(m[2]);
        if (KJV_BOOKS[book] && chapter >= 1 && chapter <= KJV_BOOKS[book]) {
          inlineRef = { book, chapter, verseStart: parseInt(m[3]), verseEnd: m[4] ? parseInt(m[4]) : null };
        }
      }
    }
  }

  const ref = parsed || inlineRef;
  if (!ref) return;

  // Ignore if message is too long (probably not a Bible reference query)
  if (!isMention && content.length > 100) return;

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
    updateServer(interaction.guild.id, { last_sent_date: "" });
    steps.push("\u2705 Delivery schedule reset");
    await interaction.editReply({ content: steps.join("\n"), flags: 64 });
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
        const d = await callBibleApi({ action: "resolve_refs", refs: [ref] });
        const verses = d?.verses || [];
        if (!verses.length || verses[0]?.text == null) return interaction.reply({ content: "❌ Verse not found.", flags: 64 });
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
      if (v) {
        await interaction.update(buildVerseEmbed([v]));
      } else {
        interaction.reply({ content: "❌ Verse not found.", flags: 64 }).catch(() => {});
      }
    } catch (e) { console.error("prevvs/nextvs:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
    return;
  }

  // Open verse from search results
  if (customId.startsWith("openverse|")) {
    const ref = customId.slice("openverse|".length);
    try {
      const d = await callBibleApi({ action: "resolve_refs", refs: [ref] });
      const verses = d?.verses || [];
      if (verses.length) {
        await interaction.reply({ ...buildVerseEmbed(verses), flags: 64 });
      } else {
        interaction.reply({ content: "❌ Verse not found.", flags: 64 }).catch(() => {});
      }
    } catch (e) { console.error("openverse:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
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
    const totalChapters = KJV_BOOKS[book] || 0;
    if (totalChapters === 0) return;
    const pageSize = 25;
    const pageIdx = parseInt(parts[1]) || 0;
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
    await interaction.update({ embeds: [embed], components: rows });
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
      if (words.length === 1) {
        // Single word: fetch the right 100-chunk from API, slice 5 for this page
        const off = Math.floor((page * 5) / 100) * 100;
        const searchData = await callBibleApi({ action: "search", query: words[0], offset: off });
        const allResults = searchData?.results || [];
        total = searchData?.total || 0;
        const sliceStart = (page * 5) - off;
        verses = allResults.slice(sliceStart, sliceStart + 5);
      } else {
        // Multi-word intersection
        const allSets = await Promise.all(words.map(async w => {
          const all = [];
          for (let o = 0; o < 1000; o += 100) {
            const d = await callBibleApi({ action: "search", query: w, offset: o });
            const batch = d?.results || [];
            if (!batch.length) break;
            all.push(...batch);
          }
          return all;
        }));
        let minIdx = 0;
        for (let i = 1; i < allSets.length; i++) { if (allSets[i].length < allSets[minIdx].length) minIdx = i; }
        const otherSets = allSets.filter((_, i) => i !== minIdx).map(s => new Set(s.map(v => v.ref || `${v.book} ${v.chapter}:${v.verse}`)));
        verses = allSets[minIdx].filter(v => {
          const ref = v.ref || `${v.book} ${v.chapter}:${v.verse}`;
          return otherSets.every(s => s.has(ref));
        });
        total = verses.length;
      }
      if (!total) return interaction.editReply({ content: "❌ No results.", embeds: [], components: [] });
      await interaction.editReply(buildSearchEmbed(query, words, total, verses, page));
    } catch (e) { console.error("srchpg:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
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
