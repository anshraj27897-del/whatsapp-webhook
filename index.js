import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Webhook verification
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "my_verify_token";

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

// Receive messages
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body?.toLowerCase().trim();

    console.log("📩 Message received:", text);

    let reply = "";

    if (text === "hi" || text === "hello") {
      reply =
        "👋 *Welcome!* \n\nThis is an automated WhatsApp Cloud API platform.\n\n👉 Type:\n• *price* – to know pricing\n• *demo* – to see demo details";
    } 
    else if (text === "price") {
      reply =
        "💰 *Pricing*\n\nStarter Platform:\n₹25,000 – ₹40,000 (one-time)\n\nIncludes:\n✅ WhatsApp Cloud API\n✅ Auto reply system\n✅ Hosting setup\n\n_Type demo to see live demo_";
    } 
    else if (text === "demo") {
      reply =
        "🧪 *Live Demo*\n\nYou are currently chatting with the demo bot 🤖\n\nFeatures:\n✅ Instant auto-reply\n✅ Cloud hosted\n✅ Custom commands\n\nFor purchase & customization, contact admin.";
    } 
    else {
      reply =
        "❓ *Command not found*\n\nType *hi* to start\nType *price* for pricing\nType *demo* for demo info";
    }

    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Reply sent");
    res.sendStatus(200);

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    res.sendStatus(200);
  }
});

app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
