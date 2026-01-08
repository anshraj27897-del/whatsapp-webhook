import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const {
  VERIFY_TOKEN,
  PHONE_NUMBER_ID,
  CLIENTS_SHEET_WEBHOOK_URL,
  ADMIN_LEADS_WEBHOOK_URL
} = process.env;

/* ================= MEMORY ================= */

const processedMessages = new Set();
const adminLoggedNumbers = new Set();

/* ================= VERIFY ================= */

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* ================= CLIENT CONFIG ================= */

async function getClientConfig() {
  const res = await axios.post(CLIENTS_SHEET_WEBHOOK_URL, {
    phone_number_id: PHONE_NUMBER_ID
  });
  return res.data;
}

/* ================= BOT REPLY ================= */

function getReply(text, cfg) {
  const t = text.toLowerCase();

  if (["hi", "hello", "hey", "hii"].includes(t)) return cfg.reply_hi;
  if (t.includes("price") || t === "1") return cfg.reply_price;
  if (t.includes("demo") || t === "2") return cfg.reply_demo;
  if (t.includes("help") || t.includes("support") || t === "3") return cfg.reply_help;

  return cfg.reply_default;
}

/* ================= SMART INTENT ================= */

function getLeadReason(text) {
  const t = text.toLowerCase();

  if (/price|pricing|cost|fees|charge|kitna/.test(t)) return "Pricing";
  if (/demo|trial|test|dekh|use/.test(t)) return "Demo";
  if (/help|support|issue|problem|error|fail|nahi/.test(t)) return "Support";

  return "General";
}

/* ================= WEBHOOK ================= */

app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return res.sendStatus(200);

    const messageId = msg.id;
    const userPhone = msg.from;
    const userText = msg.text.body;

    if (processedMessages.has(messageId)) return res.sendStatus(200);
    processedMessages.add(messageId);

    const client = await getClientConfig();
    const botReply = getReply(userText, client);
    const leadReason = getLeadReason(userText);

    /* ===== SEND WHATSAPP ===== */
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

    /* ===== CLIENT LOG ===== */
    if (client.sheet_webhook) {
      await axios.post(client.sheet_webhook, {
        user_phone: userPhone,
        user_message: userText,
        bot_reply: botReply
      });
    }

    /* ===== ADMIN SMART RULE ===== */

    let sendToAdmin = false;

    // Rule 1: first time number
    if (!adminLoggedNumbers.has(userPhone)) {
      sendToAdmin = true;
      adminLoggedNumbers.add(userPhone);
    }

    // Rule 2: intent based (always important)
    if (["Pricing", "Demo", "Support"].includes(leadReason)) {
      sendToAdmin = true;
    }

    if (sendToAdmin && ADMIN_LEADS_WEBHOOK_URL) {
      await axios.post(ADMIN_LEADS_WEBHOOK_URL, {
        timestamp: new Date().toISOString(),
        client_phone_number_id: PHONE_NUMBER_ID,
        user_phone: userPhone,
        user_message: userText,
        bot_reply: botReply,
        lead_reason: leadReason
      });
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.sendStatus(200);
  }
});

app.listen(process.env.PORT || 10000, () =>
  console.log("🚀 Server Live")
);
