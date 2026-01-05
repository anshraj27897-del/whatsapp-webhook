import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const {
  VERIFY_TOKEN,
  PHONE_NUMBER_ID,
  CLIENTS_SHEET_WEBHOOK_URL,
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

  console.log("❌ Webhook verification failed");
  return res.sendStatus(403);
});

/* ================= FETCH CLIENT ================= */
async function getClientConfig(phoneNumberId) {
  const response = await axios.post(
    CLIENTS_SHEET_WEBHOOK_URL,
    { phone_number_id: phoneNumberId },
    { timeout: 10000 }
  );
  return response.data;
}

/* ================= REPLY ENGINE ================= */
function getReply(text, cfg) {
  const t = text.toLowerCase();

  if (["hi", "hello", "hey", "hii", "hy"].includes(t)) {
    return cfg.reply_hi;
  }

  if (t === "1" || t.includes("price")) {
    return cfg.reply_price;
  }

  if (t === "2" || t.includes("demo")) {
    return cfg.reply_demo;
  }

  if (t === "3" || t.includes("help")) {
    return cfg.reply_help;
  }

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
    const text = message.text?.body?.trim() || "";

    /* ===== DUPLICATE CHECK ===== */
    if (global.processedMessages.has(messageId)) {
      console.log("⏭️ Duplicate ignored:", messageId);
      return res.sendStatus(200);
    }
    global.processedMessages.add(messageId);

    /* ===== FETCH CLIENT ===== */
    const client = await getClientConfig(PHONE_NUMBER_ID);

    if (!client) {
      console.error("❌ Client not found in sheet");
      return res.sendStatus(200);
    }

    if (!client.whatsapp_token) {
      console.error("❌ whatsapp_token missing in sheet");
      return res.sendStatus(200);
    }

    /* ===== DECIDE REPLY ===== */
    const replyText = getReply(text, client);

    /* ===== SEND MESSAGE ===== */
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: replyText },
        },
        {
          headers: {
            Authorization: `Bearer ${client.whatsapp_token}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (err) {
      console.error(
        "❌ WhatsApp API error:",
        err.response?.status,
        err.response?.data || err.message
      );
      return res.sendStatus(200);
    }

    /* ===== LOG TO SHEET ===== */
    if (client.sheet_webhook) {
      try {
        await axios.post(client.sheet_webhook, {
          phone: from,
          message: text,
          reply: replyText,
          status: "REPLIED",
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("⚠️ Log sheet failed:", e.message);
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook crash:", err.message);
    return res.sendStatus(200);
  }
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
