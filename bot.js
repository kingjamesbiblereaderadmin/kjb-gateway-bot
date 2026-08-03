import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

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

const ALIASES = { "gen":"Genesis","ge":"Genesis","gn":"Genesis","exo":"Exodus","ex":"Exodus","lev":"Leviticus","le":"Leviticus","num":"Numbers","nu":"Numbers","deu":"Deuteronomy","de":"Deuteronomy","dt":"Deuteronomy","jos":"Joshua","josh":"Joshua","jdg":"Judges","judg":"Judges","rut":"Ruth","ru":"Ruth","1sa":"1 Samuel","1sam":"1 Samuel","2sa":"2 Samuel","2sam":"2 Samuel","1ki":"1 Kings","1kgs":"1 Kings","2ki":"2 Kings","2kgs":"2 Kings","1ch":"1 Chronicles","1chr":"1 Chronicles","2ch":"2 Chronicles","2chr":"2 Chronicles","ezr":"Ezra","neh":"Nehemiah","ne":"Nehemiah","est":"Esther","es":"Esther","job":"Job","jb":"Job","psa":"Psalms","ps":"Psalms","psalm":"Psalms","pss":"Psalms","pro":"Proverbs","pr":"Proverbs","prv":"Proverbs","ecc":"Ecclesiastes","ec":"Ecclesiastes","son":"Song of Solomon","sos":"Song of Solomon","sng":"Song of Solomon","song":"Song of Solomon","isa":"Isaiah","is":"Isaiah","jer":"Jeremiah","je":"Jeremiah","lam":"Lamentations","la":"Lamentations","eze":"Ezekiel","ezk":"Ezekiel","dan":"Daniel","da":"Daniel","hos":"Hosea","ho":"Hosea","joe":"Joel","jl":"Joel","amo":"Amos","am":"Amos","oba":"Obadiah","ob":"Obadiah","jon":"Jonah","mic":"Micah","mi":"Micah","nah":"Nahum","na":"Nahum","hab":"Habakkuk","hb":"Habakkuk","zep":"Zephaniah","hag":"Haggai","hg":"Haggai","zec":"Zechariah","zch":"Zechariah","mal":"Malachi","ml":"Malachi","mat":"Matthew","mt":"Matthew","matt":"Matthew","mar":"Mark","mk":"Mark","mr":"Mark","luk":"Luke","lk":"Luke","joh":"John","jn":"John","jhn":"John","act":"Acts","ac":"Acts","rom":"Romans","ro":"Romans","rm":"Romans","1co":"1 Corinthians","1cor":"1 Corinthians","2co":"2 Corinthians","2cor":"2 Corinthians","gal":"Galatians","ga":"Galatians","eph":"Ephesians","ep":"Ephesians","php":"Philippians","phi":"Philippians","phil":"Philippians","col":"Colossians","1th":"1 Thessalonians","1thes":"1 Thessalonians","2th":"2 Thessalonians","2thes":"2 Thessalonians","1ti":"1 Timothy","1tim":"1 Timothy","2ti":"2 Timothy","2tim":"2 Timothy","tit":"Titus","ti":"Titus","phm":"Philemon","pm":"Philemon","heb":"Hebrews","he":"Hebrews","jam":"James","jas":"James","1pe":"1 Peter","1pet":"1 Peter","2pe":"2 Peter","2pet":"2 Peter","1jo":"1 John","1jn":"1 John","1jhn":"1 John","2jo":"2 John","2jn":"2 John","3jo":"3 John","3jn":"3 John","jud":"Jude","jude":"Jude","rev":"Revelation","re":"Revelation","rv":"Revelation" };

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
  const r = await fetch(BIBLE_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return await r.json();
}

// ============ EMBED BUILDERS ============

// Verse embed — matches V3: Prev Vs / Next Vs + Read Chapter + TOC + Copy
function buildVerseEmbed(verses) {
  const first = verses[0], last = verses[verses.length - 1];
  const fullTitle = KJV_FULL_TITLES[first.book] || first.book;
  
  // Check if verses span multiple books or chapters
  const sameBook = verses.every(v => v.book === first.book);
  const sameChapter = sameBook && verses.every(v => v.chapter === first.chapter);
  const isMultiRef = !sameChapter; // different books or different chapters
  
  let title, desc;
  
  if (sameBook && sameChapter && verses.length > 1) {
    // Dash range in same chapter (e.g., John 3:16-18) — show verses TOGETHER
    title = `${fullTitle} — ${first.chapter}:${first.verse}–${last.verse}`;
    desc = (first.verse === 1 && first.superscription) ? `¶ ${formatKJV(first.superscription)}\n\n` : "";
    desc += verses.map(v => `**[${v.verse}]** ${formatKJV(v.text)}`).join("\n\n");
  } else if (verses.length === 1) {
    // Single verse
    title = `${fullTitle} — ${first.chapter}:${first.verse}`;
    desc = (first.verse === 1 && first.superscription) ? `¶ ${formatKJV(first.superscription)}\n\n` : "";
    desc += `"${formatKJV(verses[0].text)}"`;
  } else if (sameBook && !sameChapter) {
    // Same book, different chapters
    title = fullTitle;
    desc = verses.map(v => `**${v.chapter}:${v.verse}**\n"${formatKJV(v.text)}"`).join("\n\n");
  } else {
    // Multiple books (e.g., 1 Cor 15:1-4, Romans 3:25, Eph 1:13)
    title = "Multiple Verses";
    desc = verses.map(v => {
      const vTitle = KJV_FULL_TITLES[v.book] || v.book;
      return `**${vTitle} — ${v.chapter}:${v.verse}**\n"${formatKJV(v.text)}"`;
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
    const shortRef = verses.length > 1 
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
    // Multi-ref: NO Prev/Next, individual Copy buttons + TOC
    // Row 1: TOC + up to 4 Copy buttons (5 buttons max per row)
    const copyButtons = verses.slice(0, 4).map(v => {
      const ref = `${v.book} ${v.chapter}:${v.verse}`;
      return new ButtonBuilder().setCustomId(`copyref|${ref}`.slice(0, 100)).setStyle(ButtonStyle.Secondary).setLabel(`📋 ${ref}`);
    });
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bibletoc|0`).setStyle(ButtonStyle.Secondary).setLabel("📖 TOC"),
      ...copyButtons
    ));
    
    // If more than 4 verses, add remaining copy buttons in row 2
    if (verses.length > 4) {
      const copyButtons2 = verses.slice(4, 9).map(v => {
        const ref = `${v.book} ${v.chapter}:${v.verse}`;
        return new ButtonBuilder().setCustomId(`copyref|${ref}`.slice(0, 100)).setStyle(ButtonStyle.Secondary).setLabel(`📋 ${ref}`);
      });
      rows.push(new ActionRowBuilder().addComponents(...copyButtons2));
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

client.on("ready", () => console.log(`✅ KJB Reader online as ${client.user.tag}`));

client.on("guildCreate", async (guild) => {
  try {
    let channel = guild.channels.cache.find(c => c.name === "kjb-bot-updates" && c.isTextBased());
    if (!channel) channel = guild.channels.cache.find(c => /daily.?verse|bible.?verse|devotion/i.test(c.name) && c.isTextBased());
    if (!channel) {
      channel = await guild.channels.create({ name: "kjb-bot-updates", topic: "KJB Reader — Daily Bible verses & updates", type: 0 });
    }
    if (channel?.send) {
      const embed = new EmbedBuilder()
        .setTitle("📖 KJB Reader — Ready!")
        .setDescription(["**Welcome!** KJB Reader is now active.", "", "**No slash commands needed — just type:**", "• `John 3:16` — Verse lookup", "• `Psalm 23` — Full chapter", "• `daily` — Today's verse", "• `search faith` — Search by keyword", "• `toc` — Browse the Bible", "• `gospel` — How to be saved", "• `help` — Full command list", "", "**Slash commands also work:** `/verse`, `/chapter`, `/search`, `/random`, `/daily`, `/gospel`, `/toc`", "", "**Support:** [kingjamesbiblereader.com/discord](https://kingjamesbiblereader.com/discord)", "📧 Kingjamesbiblereader@outlook.sg"].join("\n"))
        .setColor(0xC8922E).setThumbnail(KJB_LOGO)
        .setFooter({ text: "KJB Reader • kingjamesbiblereader.com" });
      await channel.send({ embeds: [embed] });
    }
  } catch (e) { console.error("guildCreate:", e.message); }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
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

  // Try to parse as Bible reference(s) — supports comma/semicolon separated multi-ref
  let refText = text;
  
  // Check for multiple references separated by commas or semicolons
  // e.g. "John 3:16, Romans 5:8" or "John 3:16; Romans 5:8; Rev 3:20"
  const multiRefPattern = /\b((?:[123]\s)?[A-Za-z]{2,}(?:\s[A-Za-z]+)?)\s+(\d+):(\d+)(?:-(\d+))?\b/g;
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
      }
      if (allVerses.length) {
        await message.reply(buildVerseEmbed(allVerses));
      } else {
        if (isMention) await message.reply({ content: "❌ Verses not found.", allowedMentions: { repliedUser: false } });
      }
    } catch (e) {
      console.error("multi-ref:", e.message);
      if (isMention) await message.reply({ content: "❌ Something went wrong.", allowedMentions: { repliedUser: false } });
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

// ============ BUTTON HANDLERS ============

client.on("interactionCreate", async (interaction) => {
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
});

client.login(process.env.DISCORD_BOT_TOKEN);
