import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const {
  VERIFY_TOKEN,
  PHONE_NUMBER_ID,                 // Meta phone_number_id (ENV)
  CLIENTS_SHEET_WEBHOOK_URL,       // Clients master sheet webhook
  ADMIN_LEADS_WEBHOOK_URL          // 🔔 ADMIN_MASTER_LEADS webhook (NEW)
} = process.env;

if (!VERIFY_TOKEN || !PHONE_NUMBER_ID || !CLIENTS_SHEET_WEBHOOK_URL) {
  console.error("❌ Missing ENV variables");
}

/* ================= DEDUP ================= */
global.processedMessages ??= new Set();

/* ================= META VERIFY ================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

/* ================= FETCH CLIENT CONFIG ================= */
/*
Expected columns in Clients sheet:
phone_number_id | client_name | whatsapp_token | sheet_webhook | reply_hi | reply_price | reply_demo | reply_help | reply_default
*/
async function getClientConfig() {
  const res = await axios.post(
    CLIENTS_SHEET_WEBHOOK_URL,
    { phone_number_id: PHONE_NUMBER_ID },
    { timeout: 10000 }
  );

  return res.data;
}

/* ================= REPLY ENGINE ================= */
function getReply(text, cfg) {
  const t = text.toLowerCase().trim();

  if (["hi", "hello", "hey", "hii", "hy"].includes(t)) return cfg.reply_hi;
  if (t === "1" || t.includes("price")) return cfg.reply_price;
  if (t === "2" || t.includes("demo")) return cfg.reply_demo;
  if (t === "3" || t.includes("help") || t.includes("support")) return cfg.reply_help;

  return cfg.reply_default;
}

/* ================= MESSAGE HANDLER ================= */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const messageId = message.id;
    const from = message.from;
    const text = message.text?.body || "";

    /* ===== DUPLICATE CHECK ===== */
    if (global.processedMessages.has(messageId)) {
      return res.sendStatus(200);
    }
    global.processedMessages.add(messageId);

    /* ===== FETCH CLIENT CONFIG ===== */
    const client = await getClientConfig();
    if (!client || !client.whatsapp_token) return res.sendStatus(200);

    /* ===== DECIDE REPLY ===== */
    const replyText = getReply(text, client);

    /* ===== SEND WHATSAPP MESSAGE ===== */
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: replyText }
      },
      {
        headers: {
          Authorization: `Bearer ${client.whatsapp_token}`,
          "Content-Type": "application/json"
        }
      }
    );

    /* ================= CLIENT LOG ================= */
    if (client.sheet_webhook) {
      axios.post(client.sheet_webhook, {
        timestamp: new Date().toISOString(),
        user_phone: from,
        user_message: text,
        bot_reply: replyText
      }).catch(() => {});
    }

    /* ================= ADMIN MASTER LEADS LOG ================= */
    if (ADMIN_LEADS_WEBHOOK_URL) {
      axios.post(ADMIN_LEADS_WEBHOOK_URL, {
        timestamp: new Date().toISOString(),
        client_phone_number_id: PHONE_NUMBER_ID,
        user_phone: from,
        user_message: text,
        bot_reply: replyText
      }).catch(() => {});
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return res.sendStatus(200);
  }
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});
