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

/* ================= FETCH CLIENT CONFIG (SAFE) ================= */
async function getClientConfig(phoneNumberId) {
  try {
    if (!CLIENTS_SHEET_WEBHOOK_URL) {
      console.log("⚠️ CLIENTS_SHEET_WEBHOOK_URL missing");
      return null;
    }

    const res = await axios.post(CLIENTS_SHEET_WEBHOOK_URL, {
      phone_number_id: phoneNumberId,
    });

    return res.data || null;
  } catch (err) {
    console.log("⚠️ Client sheet fetch failed:", err.message);
    return null;
  }
}

/* ================= SMART REPLY ENGINE ================= */
function getReply(text, cfg) {
  const t = text.toLowerCase();

  if (["hi", "hello", "hey", "hii", "hy"].includes(t)) {
    return cfg?.reply_hi || "Hi 👋 Welcome!";
  }

  if (t === "1" || t.includes("price")) {
    return cfg?.reply_price || "Pricing will be shared soon.";
  }

  if (t === "2" || t.includes("demo")) {
    return cfg?.reply_demo || "Demo will be shared shortly.";
  }

  if (t === "3" || t.includes("help")) {
    return cfg?.reply_help || "Please tell us your issue.";
  }

  return cfg?.reply_default || "Thanks for contacting us 😊";
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

    /* ===== LOAD CLIENT CONFIG ===== */
    const client = await getClientConfig(PHONE_NUMBER_ID);

    /* ===== DECIDE REPLY ===== */
    const replyText = getReply(text, client);

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
          Authorization: `Bearer ${
            client?.whatsapp_token || process.env.WHATSAPP_TOKEN
          }`,
          "Content-Type": "application/json",
        },
      }
    );

    /* ===== LOG TO CLIENT SHEET (OPTIONAL) ===== */
    if (client?.sheet_webhook) {
      try {
        await axios.post(client.sheet_webhook, {
          phone: from,
          message: text,
          reply: replyText,
          status: "REPLIED",
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.log("⚠️ Sheet log failed");
      }
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
