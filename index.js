import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

// 🚫 duplicate stop memory
const processedMessages = new Set();

/* ================= VERIFY WEBHOOK ================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

/* ================= RECEIVE MESSAGE ================= */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const msgId = message.id;

    // 🚫 stop duplicate reply
    if (processedMessages.has(msgId)) {
      console.log("⚠️ Duplicate message ignored");
      return res.sendStatus(200);
    }
    processedMessages.add(msgId);

    const from = message.from;
    const text = message.text?.body || "";
    const name = value?.contacts?.[0]?.profile?.name || "Friend";

    console.log(`📩 ${from} -> ${text}`);

    /* ===== AUTO REPLY ===== */
    const reply = `👋 Hi ${name}! Welcome to our platform

Reply with:
1️⃣ PRICE – pricing details
2️⃣ DEMO – product demo
3️⃣ HELP – support`;

    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    /* ===== GOOGLE SHEET LOG ===== */
    await axios.post(process.env.SHEET_WEBHOOK_URL, {
      name,
      phone: from,
      message: text,
      status: "Received",
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
