import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ================= ENV =================
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ================= MEMORY (DEDUP) =================
const processedMessages = new Set();

// ================= AUTO REPLIES =================
const REPLIES = {
  hi:
    "👋 Hi! Welcome\n\nReply with:\n1️⃣ PRICE – to know pricing\n2️⃣ DEMO – to see demo\n3️⃣ HELP – to talk to support",
  price:
    "💰 Our pricing starts from ₹25,000.\n\nReply YES to continue.",
  demo:
    "🎥 Demo will be shared shortly.\nOur team will contact you.",
  help:
    "🧑‍💻 Please tell us how we can help you.",
  default:
    "🙏 Thank you for messaging us.\nPlease reply:\n1️⃣ PRICE\n2️⃣ DEMO\n3️⃣ HELP",
};

// ================= HEALTH =================
app.get("/", (req, res) => {
  res.send("WhatsApp webhook server running ✅");
});

// ================= VERIFY =================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ================= SEND MSG =================
async function sendMessage(to, text) {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    }),
  });
}

// ================= WEBHOOK =================
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    // ❌ Ignore non-text / status / delivery
    if (!message || message.type !== "text") {
      return res.sendStatus(200);
    }

    // 🔐 DUPLICATE PROTECTION
    if (processedMessages.has(message.id)) {
      return res.sendStatus(200);
    }
    processedMessages.add(message.id);

    const from = message.from;
    const text = message.text.body.toLowerCase().trim();

    let reply;
    if (["hi", "hello", "hey"].includes(text)) reply = REPLIES.hi;
    else if (text === "price" || text === "1") reply = REPLIES.price;
    else if (text === "demo" || text === "2") reply = REPLIES.demo;
    else if (text === "help" || text === "3") reply = REPLIES.help;
    else reply = REPLIES.default;

    await sendMessage(from, reply);
    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(200);
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
