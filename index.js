import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const {
  VERIFY_TOKEN,
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID,
  SHEET_WEBHOOK,
  REPLY_DEFAULT,
  REPLY_HI,
  REPLY_PRICE,
  REPLY_DEMO,
  REPLY_HELP,
} = process.env;

/* -------------------- VERIFY WEBHOOK -------------------- */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* -------------------- RECEIVE MESSAGE -------------------- */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // 🔴 VERY IMPORTANT → stop duplicate replies
    if (!value || !value.messages) {
      return res.sendStatus(200);
    }

    const message = value.messages[0];
    const from = message.from;
    const text = message.text?.body?.toLowerCase() || "";

    console.log("Message from:", from, "| Text:", text);

    /* ---------- Decide reply ---------- */
    let reply = REPLY_DEFAULT;

    if (text.includes("hi") || text.includes("hello")) reply = REPLY_HI;
    else if (text.includes("price")) reply = REPLY_PRICE;
    else if (text.includes("demo")) reply = REPLY_DEMO;
    else if (text.includes("help")) reply = REPLY_HELP;

    /* ---------- Send WhatsApp reply ---------- */
    await fetch(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply },
        }),
      }
    );

    /* ---------- Save to Google Sheet ---------- */
    if (SHEET_WEBHOOK) {
      await fetch(SHEET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: from,
          message: text,
          status: "REPLIED",
        }),
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

/* -------------------- START SERVER -------------------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
