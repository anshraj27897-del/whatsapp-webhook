const express = require("express");
const app = express();

const VERIFY_TOKEN = "verify_token";

app.use(express.json());

// ✅ Webhook verification (VERY IMPORTANT)
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

// ✅ Receive messages (POST)
app.post("/webhook", (req, res) => {
  console.log("📩 Message received:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.listen(process.env.PORT, () => {
  console.log("Server running on Render port");
});
