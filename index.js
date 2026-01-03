import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ================= ENV CONFIG =================
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ================= AUTO REPLIES =================
const REPLIES = {
  hi:
    process.env.REPLY_HI ||
    "👋 Hi! Welcome\n\nReply with:\n1️⃣ PRICE – to know pricing\n2️⃣ DEMO – to see demo\n3️⃣ HELP – to talk to support",
  price:
    process.env.REPLY_PRICE ||
    "💰 Our pricing starts from ₹25,000.\n\nReply YES to continue.",
  demo:
    process.env.REPLY_DEMO ||
    "🎥 Demo will be shared shortly.\nOur team will contact you.",
  help:
    process.env.REPLY_HELP ||
    "🧑‍💻 Please tell us how we can help you.",
  default:
    process.env.REPLY_DEFAULT ||
    "🙏 Thank you for messaging us.\nPlease reply:\n1️⃣ PRICE\n2️⃣ DEMO\n3️⃣ HELP",
};

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  res.send("WhatsApp webhook server is running");
});

// ================= WEBHOOK VERIFY =================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ================= SEND MESSAGE =================
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

// ================= MESSAGE HANDLER =================
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    // 🔒 Ignore status / delivery / non-text messages
    if (!message || message.type !== "text") {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body?.toLowerCase().trim() || "";

    let reply;

    if (["hi", "hello", "hey"].includes(text)) {
      reply = REPLIES.hi;
    } else if (text === "price" || text === "1") {
      reply = REPLIES.price;
    } else if (text === "demo" || text === "2") {
      reply = REPLIES.demo;
    } else if (text === "help" || text === "3") {
      reply = REPLIES.help;
    } else {
      reply = REPLIES.default;
    }

    await sendMessage(from, reply);
    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(200);
  }
});

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
