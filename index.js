import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

/* Health check */
app.get("/", (req, res) => {
  res.send("WhatsApp webhook server is running");
});

/* Webhook verification */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/* Incoming messages */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body?.toLowerCase();

    let reply = "";

    if (text.includes("hi") || text.includes("hello")) {
      reply =
        "👋 Hi! Welcome 🙌\n\n" +
        "Reply with:\n" +
        "1️⃣ PRICE – to know pricing\n" +
        "2️⃣ DEMO – to see demo\n" +
        "3️⃣ HELP – for support";
    } 
    else if (text.includes("price")) {
      reply =
        "💰 *Pricing Details*\n\n" +
        "Basic Plan: ₹999\n" +
        "Pro Plan: ₹1999\n\n" +
        "Reply DEMO to see how it works 🚀";
    } 
    else if (text.includes("demo")) {
      reply =
        "🎥 *Demo Access*\n\n" +
        "This system auto-replies to customers on WhatsApp.\n\n" +
        "Perfect for online selling 🛒\n\n" +
        "Reply PRICE to continue 💰";
    } 
    else {
      reply =
        "❓ I didn’t understand that.\n\n" +
        "Reply with PRICE or DEMO";
    }

    await fetch(
      `https://graph.facebook.com/v24.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply },
        }),
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
