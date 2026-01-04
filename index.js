import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const processedMessages = new Set(); // 🔒 duplicate protection

const {
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  VERIFY_TOKEN,
  GOOGLE_SHEET_WEBHOOK_URL,
  REPLY_HI,
  REPLY_PRICE,
  REPLY_DEMO,
  REPLY_HELP,
  REPLY_DEFAULT,
} = process.env;

/* ===============================
   META VERIFY
================================ */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* ===============================
   WEBHOOK POST
================================ */
app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const messageId = message.id;

    // 🔒 BLOCK DUPLICATE MESSAGE
    if (processedMessages.has(messageId)) {
      console.log("Duplicate message ignored:", messageId);
      return res.sendStatus(200);
    }

    processedMessages.add(messageId);

    const from = message.from;
    const text = message.text?.body?.toLowerCase() || "";

    let reply = REPLY_DEFAULT;
    if (text.includes("hi") || text.includes("hello")) reply = REPLY_HI;
    else if (text.includes("price")) reply = REPLY_PRICE;
    else if (text.includes("demo")) reply = REPLY_DEMO;
    else if (text.includes("help")) reply = REPLY_HELP;

    /* SEND WHATSAPP MESSAGE */
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        text: { body: reply },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    /* LOG TO GOOGLE SHEET */
    if (GOOGLE_SHEET_WEBHOOK_URL) {
      await axios.post(GOOGLE_SHEET_WEBHOOK_URL, {
        phone: from,
        message: text,
        reply,
        time: new Date().toISOString(),
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

/* ===============================
   START SERVER
================================ */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
