const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// 🔑 VERIFY TOKEN (YAHI SAME TOKEN META ME DALA HAI)
const VERIFY_TOKEN = "ansh_123";

// ✅ Webhook verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 📩 Incoming WhatsApp messages (POST)
app.post("/webhook", (req, res) => {
  console.log("📩 Message received:");
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// 🚀 Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
