const express = require("express");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "verify_token"; // same as Meta

// ✅ Webhook verification
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

// ✅ Receive messages (future use)
app.post("/webhook", (req, res) => {
  console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
