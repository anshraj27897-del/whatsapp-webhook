import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const {
  VERIFY_TOKEN,
  PHONE_NUMBER_ID,
  CLIENTS_SHEET_WEBHOOK_URL,
  ADMIN_LEADS_WEBHOOK_URL
} = process.env;

/* ================= IN-MEMORY ================= */
global.processedMessages ??= new Set();
global.seenUsers ??= new Set();

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
  if (t === "1" || t.includes("price") || t.includes("cost")) return cfg.reply_price;
  if (t === "2" || t.includes("demo") || t.includes("trial")) return cfg.reply_demo;
  if (t === "3" || t.includes("help") || t.includes("support")) return cfg.reply_help;

  return cfg.reply_default;
}

/* ================= LEAD REASON ================= */
function getLeadReason(text) {
  const t = text.toLowerCase().trim();

  if (t === "1" || t.includes("price") || t.includes("cost")) return "Pricing";
  if (t === "2" || t.includes("demo") || t.includes("trial")) return "Demo";
  if (t === "3" || t.includes("help") || t.includes("support")) return "Support";

  return "General";
}

/* ================= MESSAGE HANDLER ================= */
app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message?.text?.body) return res.sendStatus(200);

    const messageId = message.id;
    const from = message.from;
    const text = message.text.body;

    /* ===== DEDUP ===== */
    if (global.processedMessages.has(messageId)) {
      return res.sendStatus(200);
    }
    global.processedMessages.add(messageId);

    console.log("📩 Incoming:", from, text);

    /* ===== CLIENT CONFIG ===== */
    const client = await getClientConfig();
    if (!client?.whatsapp_token) {
      console.log("❌ Client config missing");
      return res.sendStatus(200);
    }

    /* ===== REPLY ===== */
    const replyText = getReply(text, client);

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

    console.log("✅ WhatsApp sent");

    /* ===== CLIENT SHEET LOG ===== */
    if (client.sheet_webhook) {
      axios.post(client.sheet_webhook, {
        timestamp: new Date().toISOString(),
        user_phone: from,
        user_message: text,
        bot_reply: replyText
      }).catch(() => {});
    }

    /* ===== ADMIN MASTER LEAD ===== */
    const leadReason = getLeadReason(text);

    if (ADMIN_LEADS_WEBHOOK_URL) {
      axios.post(ADMIN_LEADS_WEBHOOK_URL, {
        timestamp: new Date().toISOString(),
        client_phone_number_id: PHONE_NUMBER_ID,
        user_phone: from,
        user_message: text,
        bot_reply: replyText,
        lead_reason: leadReason
      }).catch(() => {});
    }

    global.seenUsers.add(from);
    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return res.sendStatus(200);
  }
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
