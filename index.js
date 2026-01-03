import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/* ===============================
   ENV VARIABLES (Render me set honi chahiye)
   ===============================

   WHATSAPP_TOKEN   = Meta se
   VERIFY_TOKEN     = ansh_123  (ya jo pehle tha)
   SHEET_WEBHOOK    = Google Apps Script URL
*/

/* ===============================
   VERIFY WEBHOOK (Meta requirement)
   =============================== */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/* ===============================
   RECEIVE MESSAGE
   =============================== */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value || !value.messages) {
      return res.sendStatus(200);
    }

    const msg = value.messages[0];
    const from = msg.from;
    const text = msg.text?.body || "";

    console.log("Message from:", from, "Text:", text);

    /* ===============================
       1️⃣ SEND DATA TO GOOGLE SHEET
       =============================== */
    if (process.env.SHEET_WEBHOOK) {
      await fetch(process.env.SHEET_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: from,
          message: text,
          status: "RECEIVED",
        }),
      });
    }

    /* ===============================
       2️⃣ AUTO REPLY
       =============================== */
    const reply = {
      messaging_product: "whatsapp",
      to: from,
      text: { body: "Thanks! Message received 👍" },
    };

    await fetch(
      `https://graph.facebook.com/v19.0/${value.metadata.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reply),
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

/* ===============================
   RENDER PORT FIX (MOST IMPORTANT)
   =============================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
