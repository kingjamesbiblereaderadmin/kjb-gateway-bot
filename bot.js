import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const BIBLE_API = "https://kingjamesbiblereader.com/api/functions/bibleApi";
const KJB_LOGO = "https://cdn.discordapp.com/avatars/1529303667348606996/0dd9efc7dc75c3bfe0eda43d99d6ed4e.png?size=256";

const OT_BOOKS = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi"];
const NT_BOOKS = ["Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];
const ALL_BOOKS = [...OT_BOOKS, ...NT_BOOKS];

const KJV_BOOKS = { "Genesis":50,"Exodus":40,"Leviticus":27,"Numbers":36,"Deuteronomy":34,"Joshua":24,"Judges":21,"Ruth":4,"1 Samuel":31,"2 Samuel":24,"1 Kings":22,"2 Kings":25,"1 Chronicles":29,"2 Chronicles":36,"Ezra":10,"Nehemiah":13,"Esther":10,"Job":42,"Psalms":150,"Proverbs":31,"Ecclesiastes":12,"Song of Solomon":8,"Isaiah":66,"Jeremiah":52,"Lamentations":5,"Ezekiel":48,"Daniel":12,"Hosea":14,"Joel":3,"Amos":9,"Obadiah":1,"Jonah":4,"Micah":7,"Nahum":3,"Habakkuk":3,"Zephaniah":3,"Haggai":2,"Zechariah":14,"Malachi":4,"Matthew":28,"Mark":16,"Luke":24,"John":21,"Acts":28,"Romans":16,"1 Corinthians":16,"2 Corinthians":13,"Galatians":6,"Ephesians":6,"Philippians":4,"Colossians":4,"1 Thessalonians":5,"2 Thessalonians":3,"1 Timothy":6,"2 Timothy":4,"Titus":3,"Philemon":1,"Hebrews":13,"James":5,"1 Peter":5,"2 Peter":3,"1 John":5,"2 John":1,"3 John":1,"Jude":1,"Revelation":22 };
const BOOK_ORDER = Object.keys(KJV_BOOKS);

const KJV_FULL_TITLES = { "Genesis":"The First Book of Moses, called Genesis","Exodus":"The Second Book of Moses, called Exodus","Leviticus":"The Third Book of Moses, called Leviticus","Numbers":"The Fourth Book of Moses, called Numbers","Deuteronomy":"The Fifth Book of Moses, called Deuteronomy","Joshua":"The Book of Joshua","Judges":"The Book of Judges","Ruth":"The Book of Ruth","1 Samuel":"The First Book of Samuel, Otherwise called, The First Book Of The Kings","2 Samuel":"The Second Book of Samuel, Otherwise called, The Second Book Of The Kings","1 Kings":"The First Book Of The Kings, Commonly called, The Third Book Of The Kings","2 Kings":"The Second Book Of The Kings, Commonly called, The Fourth Book Of The Kings","1 Chronicles":"The First Book of the Chronicles","2 Chronicles":"The Second Book of the Chronicles","Ezra":"Ezra","Nehemiah":"The Book of Nehemiah","Esther":"The Book of Esther","Job":"The Book of Job","Psalms":"The Book of Psalms","Proverbs":"The Proverbs","Ecclesiastes":"Ecclesiastes; or, the Preacher","Song of Solomon":"The Song of Solomon","Isaiah":"The Book of the Prophet Isaiah","Jeremiah":"The Book of the Prophet Jeremiah","Lamentations":"The Lamentations of Jeremiah","Ezekiel":"The Book of the Prophet Ezekiel","Daniel":"The Book of Daniel","Hosea":"Hosea","Joel":"Joel","Amos":"Amos","Obadiah":"Obadiah","Jonah":"Jonah","Micah":"Micah","Nahum":"Nahum","Habakkuk":"Habakkuk","Zephaniah":"Zephaniah","Haggai":"Haggai","Zechariah":"Zechariah","Malachi":"Malachi","Matthew":"The Gospel According to Saint Matthew","Mark":"The Gospel According to Saint Mark","Luke":"The Gospel According to Saint Luke","John":"The Gospel According to Saint John","Acts":"The Acts of the Apostles","Romans":"The Epistle of Paul the Apostle to the Romans","1 Corinthians":"The First Epistle of Paul the Apostle to the Corinthians","2 Corinthians":"The Second Epistle of Paul the Apostle to the Corinthians","Galatians":"The Epistle of Paul the Apostle to the Galatians","Ephesians":"The Epistle of Paul the Apostle to the Ephesians","Philippians":"The Epistle of Paul the Apostle to the Philippians","Colossians":"The Epistle of Paul the Apostle to the Colossians","1 Thessalonians":"The First Epistle of Paul the Apostle to the Thessalonians","2 Thessalonians":"The Second Epistle of Paul the Apostle to the Thessalonians","1 Timothy":"The First Epistle of Paul the Apostle to Timothy","2 Timothy":"The Second Epistle of Paul the Apostle to Timothy","Titus":"The Epistle of Paul to Titus","Philemon":"The Epistle of Paul to Philemon","Hebrews":"The Epistle of Paul the Apostle to the Hebrews","James":"The General Epistle of James","1 Peter":"The First Epistle General of Peter","2 Peter":"The Second Epistle General of Peter","1 John":"The First Epistle General of John","2 John":"The Second Epistle of John","3 John":"The Third Epistle of John","Jude":"The General Epistle of Jude","Revelation":"The Revelation of Saint John the Divine" };

const ALIASES = { "gen":"Genesis","ge":"Genesis","gn":"Genesis","exo":"Exodus","ex":"Exodus","lev":"Leviticus","le":"Leviticus","num":"Numbers","nu":"Numbers","deu":"Deuteronomy","de":"Deuteronomy","dt":"Deuteronomy","jos":"Joshua","josh":"Joshua","jdg":"Judges","judg":"Judges","rut":"Ruth","ru":"Ruth","1sa":"1 Samuel","1sam":"1 Samuel","2sa":"2 Samuel","2sam":"2 Samuel","1ki":"1 Kings","1kgs":"1 Kings","2ki":"2 Kings","2kgs":"2 Kings","1ch":"1 Chronicles","1chr":"1 Chronicles","2ch":"2 Chronicles","2chr":"2 Chronicles","ezr":"Ezra","neh":"Nehemiah","ne":"Nehemiah","est":"Esther","es":"Esther","job":"Job","jb":"Job","psa":"Psalms","ps":"Psalms","psalm":"Psalms","pss":"Psalms","pro":"Proverbs","pr":"Proverbs","prv":"Proverbs","ecc":"Ecclesiastes","ec":"Ecclesiastes","son":"Song of Solomon","sos":"Song of Solomon","sng":"Song of Solomon","song":"Song of Solomon","isa":"Isaiah","is":"Isaiah","jer":"Jeremiah","je":"Jeremiah","lam":"Lamentations","la":"Lamentations","eze":"Ezekiel","ezk":"Ezekiel","dan":"Daniel","da":"Daniel","hos":"Hosea","ho":"Hosea","joe":"Joel","jl":"Joel","amo":"Amos","am":"Amos","oba":"Obadiah","ob":"Obadiah","jon":"Jonah","mic":"Micah","mi":"Micah","nah":"Nahum","na":"Nahum","hab":"Habakkuk","hb":"Habakkuk","zep":"Zephaniah","hag":"Haggai","hg":"Haggai","zec":"Zechariah","zch":"Zechariah","mal":"Malachi","ml":"Malachi","mat":"Matthew","mt":"Matthew","matt":"Matthew","mar":"Mark","mk":"Mark","mr":"Mark","luk":"Luke","lk":"Luke","joh":"John","jn":"John","jhn":"John","act":"Acts","ac":"Acts","rom":"Romans","ro":"Romans","rm":"Romans","1co":"1 Corinthians","1cor":"1 Corinthians","2co":"2 Corinthians","2cor":"2 Corinthians","gal":"Galatians","ga":"Galatians","eph":"Ephesians","ep":"Ephesians","php":"Philippians","phi":"Philippians","phil":"Philippians","col":"Colossians","1th":"1 Thessalonians","1thes":"1 Thessalonians","2th":"2 Thessalonians","2thes":"2 Thessalonians","1ti":"1 Timothy","1tim":"1 Timothy","2ti":"2 Timothy","2tim":"2 Timothy","tit":"Titus","ti":"Titus","phm":"Philemon","pm":"Philemon","heb":"Hebrews","he":"Hebrews","jam":"James","jas":"James","1pe":"1 Peter","1pet":"1 Peter","2pe":"2 Peter","2pet":"2 Peter","1jo":"1 John","1jn":"1 John","1jhn":"1 John","2jo":"2 John","2jn":"2 John","3jo":"3 John","3jn":"3 John","jud":"Jude","jude":"Jude","rev":"Revelation","re":"Revelation","rv":"Revelation" };

function resolveBook(input) {
  const norm = input.trim();
  for (const full of ALL_BOOKS) { if (full.toLowerCase() === norm.toLowerCase()) return full; }
  const key = norm.toLowerCase().replace(/\s+/g, "");
  if (ALIASES[key]) return ALIASES[key];
  return null;
}

function parseRef(text) {
  const m = text.trim().match(/^((?:[123]\s+)?[A-Za-z][A-Za-z\s]*?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
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

function getPrevCh(book, ch) { if (ch > 1) return { book, chapter: ch - 1 }; const idx = BOOK_ORDER.indexOf(book); if (idx <= 0) return null; const p = BOOK_ORDER[idx - 1]; return { book: p, chapter: KJV_BOOKS[p] }; }
function getNextCh(book, ch) { if (ch < KJV_BOOKS[book]) return { book, chapter: ch + 1 }; const idx = BOOK_ORDER.indexOf(book); if (idx >= BOOK_ORDER.length - 1) return null; const n = BOOK_ORDER[idx + 1]; return { book: n, chapter: 1 }; }

async function callBibleApi(payload) {
  const r = await fetch(BIBLE_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return await r.json();
}

function buildVerseEmbed(verses) {
  const first = verses[0], last = verses[verses.length - 1];
  const title = verses.length > 1 ? `${first.book} ${first.chapter}:${first.verse}–${last.verse}` : `${first.book} ${first.chapter}:${first.verse}`;
  let desc = (first.verse === 1 && first.superscription) ? `¶ ${formatKJV(first.superscription)}\n\n` : "";
  desc += verses.length === 1 ? `"${formatKJV(verses[0].text)}"` : verses.map(v => `**[${v.verse}]** ${formatKJV(v.text)}`).join("\n\n");
  if (desc.length > 4000) desc = desc.slice(0, 3997) + "...";

  const embed = new EmbedBuilder()
    .setTitle(`📖 ${title}`)
    .setDescription(desc)
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });

  const rows = [];
  const prev = getPrevCh(first.book, first.chapter);
  const next = getNextCh(first.book, first.chapter);
  const navBtns = [];
  if (prev) navBtns.push(new ButtonBuilder().setCustomId(`prevch|${prev.book}||${prev.chapter}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev Ch"));
  if (next) navBtns.push(new ButtonBuilder().setCustomId(`nextch|${next.book}||${next.chapter}`).setStyle(ButtonStyle.Secondary).setLabel("Next Ch ▶"));
  if (navBtns.length) rows.push(new ActionRowBuilder().addComponents(...navBtns));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`copyref|${first.book} ${first.chapter}:${first.verse}${first.verse !== last.verse ? `-${last.verse}` : ""}`).setStyle(ButtonStyle.Secondary).setLabel("📋 Copy"),
    new ButtonBuilder().setCustomId(`toc|${first.book}||0`).setStyle(ButtonStyle.Secondary).setLabel("📖 Chapters"),
    new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 TOC"),
  ));
  return { embeds: [embed], components: rows };
}

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
  if (prev) navBtns.push(new ButtonBuilder().setCustomId(`prevch|${prev.book}||${prev.chapter}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev Ch"));
  else navBtns.push(new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 TOC"));
  if (next) navBtns.push(new ButtonBuilder().setCustomId(`nextch|${next.book}||${next.chapter}`).setStyle(ButtonStyle.Secondary).setLabel("Next Ch ▶"));
  else navBtns.push(new ButtonBuilder().setCustomId(`toc_ch|Genesis||1`).setStyle(ButtonStyle.Primary).setLabel("📖 Bible Start"));
  rows.push(new ActionRowBuilder().addComponents(...navBtns));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`chcopy|${book}||${chapter}`).setStyle(ButtonStyle.Secondary).setLabel("📋 Copy"),
    new ButtonBuilder().setCustomId(`toc|${book}||0`).setStyle(ButtonStyle.Secondary).setLabel("📖 Chapters"),
    new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 TOC"),
  ));
  return { embeds: [embed], components: rows };
}

function buildBibleTocEmbed(page = 0) {
  const pageSize = 15;
  const start = page * pageSize;
  const books = ALL_BOOKS.slice(start, start + pageSize);
  const totalPages = Math.ceil(ALL_BOOKS.length / pageSize);
  const btns = books.map(b => new ButtonBuilder().setCustomId(`toc|${b}||0`).setStyle(ButtonStyle.Secondary).setLabel(b));
  const rows = [];
  for (let i = 0; i < btns.length; i += 5) rows.push(new ActionRowBuilder().addComponents(...btns.slice(i, i + 5)));
  const navBtns = [];
  if (page > 0) navBtns.push(new ButtonBuilder().setCustomId(`bibletoc|${page - 1}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev Page"));
  navBtns.push(new ButtonBuilder().setCustomId(`nop_btnav_${page}`).setStyle(ButtonStyle.Secondary).setLabel(`Page ${page + 1} / ${totalPages}`).setDisabled(true));
  if (page < totalPages - 1) navBtns.push(new ButtonBuilder().setCustomId(`bibletoc|${page + 1}`).setStyle(ButtonStyle.Secondary).setLabel("Next Page ▶"));
  rows.push(new ActionRowBuilder().addComponents(...navBtns));
  const embed = new EmbedBuilder()
    .setTitle("📖 King James Bible — Table of Contents")
    .setDescription(`**All 66 Books**\n\nClick any book to see its chapters.\nPage ${page + 1} of ${totalPages}`)
    .setColor(0xC8922E).setThumbnail(KJB_LOGO)
    .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
  return { embeds: [embed], components: rows };
}

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});


// Auto-create #kjb-bot-updates channel in a guild
async function ensureUpdatesChannel(guildId) {
  try {
    const chRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    });
    if (!chRes.ok) return false;
    const channels = await chRes.json();
    const existing = channels.find(c => [0, 5].includes(c.type) && /kjb.?bot.?update|bot.?update/i.test(c.name));
    if (existing) return true;
    const firstCategory = channels.find(c => c.type === 4);
    // Try announcement channel first (type 5), fall back to text (type 0)
    const body = { name: "kjb-bot-updates", type: 5, topic: "KJB Reader bot updates — new features and announcements" };
    if (firstCategory) body.parent_id = firstCategory.id;
    const announceRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      method: "POST",
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (announceRes.ok) { console.log(`  ✅ Created #kjb-bot-updates in ${guildId}`); return true; }
    // Fall back to text channel
    body.type = 0;
    const textRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      method: "POST",
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (textRes.ok) { console.log(`  ✅ Created #kjb-bot-updates (text) in ${guildId}`); return true; }
    console.log(`  ⚠️ Could not create #kjb-bot-updates in ${guildId} (need Manage Channels)`);
    return false;
  } catch (e) { console.error("ensureUpdatesChannel:", e.message); return false; }
}

client.once("ready", async () => {
  console.log(`✅ KJB Gateway Bot online as ${client.user.tag}`);
  console.log(`   Listening for Bible references in ${client.guilds.cache.size} servers`);
  client.user.setActivity("KJB Reader | type a verse or command", { type: 3 });
  // Auto-create #kjb-bot-updates in all guilds
  for (const [gid, guild] of client.guilds.cache) {
    await ensureUpdatesChannel(gid);
  }
});

// Auto-create #kjb-bot-updates when joining a new guild
client.on("guildCreate", async (guild) => {
  console.log(`📥 Joined new guild: ${guild.id}`);
  await ensureUpdatesChannel(guild.id);
});



// Build paginated search embed (10 results per page)
function buildSearchEmbed(query, words, total, verses, page) {
  const perPage = 10;
  const totalPages = Math.ceil(total / perPage);
  const start = page * perPage;
  const show = verses.slice(start, start + perPage);
  let desc = show.map(v => {
    const textSnippet = stripMd(v.text || "").slice(0, 120);
    const ellipsis = v.text && v.text.length > 120 ? "..." : "";
    return `**${v.book} ${v.chapter}:${v.verse}** — ${textSnippet}${ellipsis}`;
  }).join("\n\n");
  if (desc.length > 4000) desc = desc.slice(0, 3997) + "...";
  const embed = new EmbedBuilder()
    .setTitle(`🔍 Search: "${query}"`)
    .setDescription(desc)
    .setColor(0xC8922E)
    .setThumbnail(KJB_LOGO)
    .setFooter({ text: `KJB Reader • ${total} result${total !== 1 ? "s" : ""} • Page ${page + 1}/${totalPages} • kingjamesbiblereader.com` });
  const rows = [];
  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`srchpg|${query.slice(0, 80)}|${page - 1}`).setStyle(ButtonStyle.Secondary).setLabel("◀ Prev").setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`nopg_srch_${page}`).setStyle(ButtonStyle.Secondary).setLabel(`${page + 1} / ${totalPages}`).setDisabled(true),
      new ButtonBuilder().setCustomId(`srchpg|${query.slice(0, 80)}|${page + 1}`).setStyle(ButtonStyle.Secondary).setLabel("Next ▶").setDisabled(page >= totalPages - 1),
    ));
  }
  return { embeds: [embed], components: rows };
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const isMention = message.mentions.has(client.user);
  const cleanContent = content.replace(/<@!?\d+>/g, "").trim();
  
  // All commands work without any prefix — just type the command
  // But we use cleanContent (mention stripped) so @mention still works too
  const text = cleanContent || content;
  
  // Only treat as a command if the message is reasonably short (avoid false triggers in long messages)
  const isShort = text.length <= 200;

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
        "**Slash commands still work too:**",
        "`/verse`, `/chapter`, `/search`, `/random`, `/daily`, `/gospel`, `/toc`",
        "",
        "**Support:**",
        "Join our Discord: **[kingjamesbiblereader.com/discord](https://kingjamesbiblereader.com/discord)**",
        "📧 Email: **Kingjamesbiblereader@outlook.sg**",
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
        const fullTitle = KJV_FULL_TITLES[v.book] || v.book;
        const ref = `${fullTitle} — ${v.chapter}:${v.verse}`;
        let desc = `**${ref}**\n\n`;
        if (v.verse === 1 && v.superscription) desc += `¶ ${formatKJV(v.superscription)}\n\n`;
        desc += `> "${formatKJV(v.text)}"`;
        const embed = new EmbedBuilder().setTitle(`📖 Daily Verse — ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`).setDescription(desc).setColor(0xC8922E).setThumbnail(KJB_LOGO).setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
        await message.reply({ embeds: [embed] });
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

  // Search (paginated)
  if (isShort && /^search\s+/i.test(text)) {
    const query = text.replace(/^search\s+/i, "").trim();
    if (!query) return;
    try {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean).map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
      // Fetch results — single word uses API offset; multi-word fetches all pages then filters
      let results;
      if (words.length === 1) {
        // Single word: just fetch first page, API offset handles the rest
        const searchData = await callBibleApi({ action: "search", query: words[0], offset: 0 });
        results = { total: searchData?.total || 0, verses: searchData?.results || [] };
      } else {
        // Multi-word: fetch up to 5 API pages (500 results) and filter client-side
        const allResults = [];
        let total = 0;
        for (let off = 0; off < 500; off += 100) {
          const searchData = await callBibleApi({ action: "search", query: words[0], offset: off });
          const batch = searchData?.results || [];
          if (!batch.length) break;
          total = searchData?.total || total;
          allResults.push(...batch);
        }
        const filtered = allResults.filter(v => {
          const txt = (v.text || "").toLowerCase();
          return words.slice(1).every(w => txt.includes(w));
        });
        results = { total: filtered.length, verses: filtered };
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

  // Gospel
  if (isShort && /^gospel\s*$/i.test(text)) {
    const embed = new EmbedBuilder()
      .setTitle("✝️ HOW TO BE SAVED")
      .setDescription("The Gospel is the glad tidings of the Lord Jesus Christ:\n\n**Trust he is God, died, shed his blood, buried and rose again on the third day for our sins according to the scriptures.**\n\n📖 Read the full gospel:\nhttps://kingjamesbiblereader.com/gospel")
      .setColor(0xC8922E).setThumbnail(KJB_LOGO)
      .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
    await message.reply({ embeds: [embed] });
    return;
  }

  // TOC (Table of Contents)
  if (isShort && /^(toc|chapters|books|table of contents)\s*$/i.test(text)) {
    await message.reply(buildBibleTocEmbed(0));
    return;
  }

  // Try to parse as Bible reference
  let refText = text;
  const parsed = parseRef(refText);

  // Also try matching a reference anywhere in the message (inline detection)
  let inlineRef = null;
  if (!parsed) {
    const inlineMatch = content.match(/\b((?:[123]\s)?[A-Za-z]{2,}(?:\s[A-Za-z]+)?)\s+(\d+):(\d+)(?:-(\d+))?\b/);
    if (inlineMatch) {
      const book = resolveBook(inlineMatch[1]);
      if (book) {
        const chapter = parseInt(inlineMatch[2]);
        if (KJV_BOOKS[book] && chapter >= 1 && chapter <= KJV_BOOKS[book]) {
          inlineRef = { book, chapter, verseStart: parseInt(inlineMatch[3]), verseEnd: inlineMatch[4] ? parseInt(inlineMatch[4]) : null };
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
      const verses = results.filter(Boolean);
      if (verses.length) {
        await message.reply(buildVerseEmbed(verses));
      } else {
        if (isMention) await message.reply({ content: `❌ "${refText}" not found in the KJB.`, allowedMentions: { repliedUser: false } });
      }
    }
    // Chapter lookup
    else {
      const data = await callBibleApi({ action: "getChapter", book: ref.book, chapter: ref.chapter });
      if (data?.verses?.length) {
        await message.reply(buildChapterEmbed(ref.book, ref.chapter, data.verses, data.colophon, data.bookFullName));
      } else {
        if (isMention) await message.reply({ content: `❌ ${ref.book} ${ref.chapter} not found.`, allowedMentions: { repliedUser: false } });
      }
    }
  } catch (e) {
    console.error("ref lookup:", e.message);
    if (isMention) await message.reply({ content: "❌ Something went wrong. Try again!", allowedMentions: { repliedUser: false } });
  }
});

// Handle button interactions
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  const customId = interaction.customId;

  // Copy buttons
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

  if (customId.startsWith("dv|")) {
    const parts = customId.slice("dv|".length).split("||");
    try {
      const d = await callBibleApi({ action: "getChapter", book: parts[0], chapter: parseInt(parts[1]) });
      if (d?.verses?.length) {
        await interaction.update(buildChapterEmbed(parts[0], parseInt(parts[1]), d.verses, d.colophon, d.bookFullName, 0));
      }
    } catch (e) { console.error("dv:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
    return;
  }

  if (customId.startsWith("toc|")) {
    const parts = customId.slice("toc|".length).split("||");
    const book = parts[0];
    const totalChapters = KJV_BOOKS[book] || 0;
    if (totalChapters === 0) return;
    const pageSize = 20;
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
      const words = query.toLowerCase().split(/\s+/).filter(Boolean).map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
      let verses, total;
      if (words.length === 1) {
        // Single word: fetch the specific page from API
        const off = page * 10;
        const searchData = await callBibleApi({ action: "search", query: words[0], offset: off });
        verses = searchData?.results || [];
        total = searchData?.total || 0;
        // API returns 100 at a time, but we only need 10 — slice
        // However API offset works in 100-chunks, so we need to fetch the right chunk
        if (off % 100 !== 0 || verses.length > 10) {
          // Fetch the 100-chunk containing our page
          const chunkStart = Math.floor(off / 100) * 100;
          const chunkData = await callBibleApi({ action: "search", query: words[0], offset: chunkStart });
          verses = (chunkData?.results || []).slice((off - chunkStart), (off - chunkStart) + 10);
          total = chunkData?.total || 0;
        } else {
          verses = verses.slice(0, 10);
        }
      } else {
        // Multi-word: fetch all pages and filter
        const allResults = [];
        for (let off = 0; off < 500; off += 100) {
          const searchData = await callBibleApi({ action: "search", query: words[0], offset: off });
          const batch = searchData?.results || [];
          if (!batch.length) break;
          allResults.push(...batch);
        }
        verses = allResults.filter(v => {
          const txt = (v.text || "").toLowerCase();
          return words.slice(1).every(w => txt.includes(w));
        });
        total = verses.length;
      }
      if (!total) return interaction.editReply({ content: "❌ No results.", embeds: [], components: [] });
      await interaction.editReply(buildSearchEmbed(query, words, total, verses, page));
    } catch (e) { console.error("srchpg:", e.message); interaction.reply({ content: "❌ Error.", flags: 64 }).catch(() => {}); }
    return;
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
