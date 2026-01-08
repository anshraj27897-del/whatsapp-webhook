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

/* ================= DEDUP ================= */
const processedMessages = new Set();

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
  const res = await axios.post(CLIENTS_SHEET_WEBHOOK_URL, {
    phone_number_id: PHONE_NUMBER_ID
  });
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

    if (!message?.text?.body) {
      return res.sendStatus(200);
    }

    const messageId = message.id;
    const userPhone = message.from;
    const userText = message.text.body;

    if (processedMessages.has(messageId)) {
      console.log("🔁 Duplicate ignored");
      return res.sendStatus(200);
    }
    processedMessages.add(messageId);

    console.log("📩 Incoming:", userPhone, userText);

    /* ===== CLIENT CONFIG ===== */
    const client = await getClientConfig();
    if (!client?.whatsapp_token) {
      console.log("❌ Client config missing");
      return res.sendStatus(200);
    }

    /* ===== DECIDE REPLY ===== */
    const botReply = getReply(userText, client);

    /* ===== SEND WHATSAPP MESSAGE ===== */
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: userPhone,
        text: { body: botReply }
      },
      {
        headers: {
          Authorization: `Bearer ${client.whatsapp_token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ WhatsApp reply sent");

    /* ===== CLIENT SHEET LOG ===== */
    if (client.sheet_webhook) {
      await axios.post(client.sheet_webhook, {
        user_phone: userPhone,
        user_message: userText,
        bot_reply: botReply
      });
      console.log("📊 Client sheet logged");
    }

    /* ===== ADMIN MASTER LOG ===== */
    if (ADMIN_LEADS_WEBHOOK_URL) {
      await axios.post(ADMIN_LEADS_WEBHOOK_URL, {
        client_phone_number_id: PHONE_NUMBER_ID,
        user_phone: userPhone,
        user_message: userText,
        bot_reply: botReply
      });
      console.log("🔔 Admin lead logged");
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
  console.log(`🚀 Server running on port ${PORT}`);
});
