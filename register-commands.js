// One-time (or as-needed) global slash command registration for KJB Reader.
// Run manually: node register-commands.js
// Public commands: contexts [0,1,2] (guild, DM, group DM) + integration_types [0,1] (guild install, user install)
//   -> works in servers with the bot, in DMs with the bot, in group DMs, and in OTHER servers
//      where the bot itself isn't installed but the user has personally added it (user install).
// Admin commands (/setup, /fix): guild-only, since they configure a specific server's delivery.

const APP_ID = process.env.DISCORD_APP_ID || "1529303667348606996";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN env var.");
  process.exit(1);
}

const PUBLIC = { contexts: [0, 1, 2], integration_types: [0, 1] };
const ADMIN = { contexts: [0], integration_types: [0] };

const commands = [
  {
    name: "read",
    description: "Look up a verse, range, or chapter — leave blank for the table of contents",
    options: [
      { name: "reference", description: "e.g. John 3:16, Psalm 23, 1 Corinthians 15:1-4", type: 3, required: false, autocomplete: true },
    ],
    ...PUBLIC,
  },
  {
    name: "random",
    description: "Get a random verse or chapter",
    options: [
      { name: "type", description: "Verse or chapter", type: 3, required: false,
        choices: [{ name: "Verse", value: "verse" }, { name: "Chapter", value: "chapter" }] },
    ],
    ...PUBLIC,
  },
  { name: "daily", description: "Show today's daily verse", ...PUBLIC },
  {
    name: "search",
    description: "Search verses by keyword",
    options: [
      { name: "keyword", description: "Word(s) to search for", type: 3, required: true },
    ],
    ...PUBLIC,
  },
  {
    name: "toc",
    description: "Browse the Bible table of contents",
    options: [
      { name: "book", description: "Book name", type: 3, required: false, autocomplete: true },
    ],
    ...PUBLIC,
  },
  { name: "gospel", description: "How to be saved — the Gospel", ...PUBLIC },
  { name: "help", description: "Show all commands and how to use the bot", ...PUBLIC },
  { name: "setup", description: "(Server admin) Configure daily verse delivery", ...ADMIN },
  { name: "fix", description: "(Server admin) Repair webhook and reset delivery schedule", ...ADMIN },
];

(async () => {
  const res = await fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
    method: "PUT",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error("Registration failed:", res.status, JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log(`✅ Registered ${body.length} global commands.`);
  body.forEach(c => console.log(` - /${c.name}  contexts=${JSON.stringify(c.contexts)} integration_types=${JSON.stringify(c.integration_types)}`));
})();
