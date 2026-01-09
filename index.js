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

  console.log("🔎 VERIFY HIT");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ VERIFY SUCCESS");
    return res.status(200).send(challenge);
  }

  console.log("❌ VERIFY FAILED");
  return res.sendStatus(403);
});

/* ================= CLIENT CONFIG ================= */

async function getClientConfig() {
  console.log("📄 Fetching client config...");
  const res = await axios.post(CLIENTS_SHEET_WEBHOOK_URL, {
    phone_number_id: PHONE_NUMBER_ID
  });
  console.log("✅ Client config loaded");
  return res.data;
}

/* ================= BOT REPLY ================= */

function getReply(text, cfg) {
  const t = text.toLowerCase().trim();

  if (["hi", "hello", "hey", "hii"].includes(t)) return cfg.reply_hi;
  if (t === "1" || t.includes("price")) return cfg.reply_price;
  if (t === "2" || t.includes("demo")) return cfg.reply_demo;
  if (t === "3" || t.includes("help") || t.includes("support")) return cfg.reply_help;

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
    console.log("📩 WEBHOOK HIT");

    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) {
      console.log("⚠️ No text message");
      return res.sendStatus(200);
    }

    const messageId = msg.id;
    const userPhone = msg.from;
    const userText = msg.text.body.trim();

    console.log("👤 From:", userPhone);
    console.log("💬 Message:", userText);

    if (processedMessages.has(messageId)) {
      console.log("♻️ Duplicate ignored");
      return res.sendStatus(200);
    }
    processedMessages.add(messageId);

    const client = await getClientConfig();
    const botReply = getReply(userText, client);
    const leadReason = getLeadReason(userText);

    /* ===== SEND WHATSAPP REPLY ===== */

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

    console.log("📤 Reply sent");

    /* ===== CLIENT SHEET LOG ===== */

    if (client.sheet_webhook) {
      await axios.post(client.sheet_webhook, {
        timestamp: new Date().toISOString(),
        user_phone: userPhone,
        user_message: userText,
        bot_reply: botReply
      });
      console.log("🧾 Client sheet logged");
    }

    /* ===== ADMIN SMART LOGIC ===== */

    let sendToAdmin = false;
    const isGreeting = ["hi", "hello", "hey", "hii"].includes(userText.toLowerCase());

    // Rule 1: First time number → once only
    if (!adminLoggedNumbers.has(userPhone)) {
      adminLoggedNumbers.add(userPhone);
      sendToAdmin = true;
      console.log("🆕 First time number → admin alert");
    }

    // Rule 2: High intent → always
    if (["Pricing", "Demo", "Support"].includes(leadReason)) {
      sendToAdmin = true;
      console.log("🎯 Intent alert:", leadReason);
    }

    // Rule 3: Context message (non-hi, meaningful)
    if (leadReason === "General" && !isGreeting && userText.length > 3) {
      sendToAdmin = true;
      console.log("🧠 Context alert");
    }

    /* ===== ADMIN ALERT (WHATSAPP + EMAIL) ===== */

    if (sendToAdmin && ADMIN_LEADS_WEBHOOK_URL) {
      const adminMessage = `
🔔 NEW WHATSAPP LEAD

📞 User Number: +${userPhone}
📲 Bot Number ID: ${PHONE_NUMBER_ID}

💬 User Message:
${userText}

🤖 Bot Reply:
${botReply}

🎯 Lead Type: ${leadReason}
🕒 Time: ${new Date().toLocaleString("en-IN")}
`;

      await axios.post(ADMIN_LEADS_WEBHOOK_URL, {
        channel: "whatsapp+email",
        message: adminMessage,
        user_phone: userPhone,
        lead_reason: leadReason,
        bot_number_id: PHONE_NUMBER_ID,
        timestamp: new Date().toISOString()
      });

      console.log("🚨 Admin alert sent (WhatsApp + Email)");
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    return res.sendStatus(200);
  }
});

/* ================= SERVER ================= */

app.listen(process.env.PORT || 10000, () => {
  console.log("🚀 Server Live & Listening");
});
