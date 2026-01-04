import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const {
  VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  GOOGLE_SHEET_WEBHOOK_URL,

  REPLY_HI,
  REPLY_PRICE,
  REPLY_DEMO,
  REPLY_HELP,
  REPLY_DEFAULT,
} = process.env;

/* ================= IN-MEMORY DEDUP ================= */
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

/* ================= SMART REPLY ENGINE ================= */
function getReply(text) {
  const t = text.toLowerCase();

  // greetings
  if (["hi", "hello", "hey", "hii", "hy"].includes(t)) {
    return REPLY_HI;
  }

  // numeric menu
  if (t === "1" || t.includes("price") || t.includes("cost")) {
    return REPLY_PRICE;
  }

  if (t === "2" || t.includes("demo") || t.includes("trial")) {
    return REPLY_DEMO;
  }

  if (t === "3" || t.includes("help") || t.includes("support")) {
    return REPLY_HELP;
  }

  // fallback
  return REPLY_DEFAULT;
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
    const text = message.text?.body?.trim() || "";

    /* ===== DUPLICATE PROTECTION ===== */
    if (global.processedMessages.has(messageId)) {
      console.log("⏭️ Duplicate ignored:", messageId);
      return res.sendStatus(200);
    }
    global.processedMessages.add(messageId);

    /* ===== DECIDE SMART REPLY ===== */
    const replyText = getReply(text);

    /* ===== SEND WHATSAPP MESSAGE ===== */
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: replyText },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    /* ===== LOG TO GOOGLE SHEET ===== */
    if (GOOGLE_SHEET_WEBHOOK_URL) {
      await axios.post(GOOGLE_SHEET_WEBHOOK_URL, {
        phone: from,
        message: text,
        reply: replyText,
        status: "REPLIED",
        timestamp: new Date().toISOString(),
      });
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return res.sendStatus(200);
  }
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
