import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "ansh_123"; // jo pehle se use ho raha
const APPS_SCRIPT_URL = "YOUR_APPS_SCRIPT_URL"; // yaha GS web app URL paste

// Meta verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Incoming messages
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body || "non-text";

    // 🔹 Send data to Google Sheet
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: from,
        message: text,
        status: "RECEIVED"
      })
    });

    // 🔹 Auto reply
    const reply = {
      messaging_product: "whatsapp",
      to: from,
      text: { body: "Thanks! Message received 🙌" }
    };

    await fetch(
      `https://graph.facebook.com/v19.0/${value.metadata.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(reply)
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200);
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
