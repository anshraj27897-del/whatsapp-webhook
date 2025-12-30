const express = require("express");
const app = express();

app.use(express.json());

const VERIFY_TOKEN = "ansh_123";

// ✅ Test route (IMPORTANT)
app.get("/", (req, res) => {
  res.send("Server is running");
});

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

// ✅ Receive messages (POST)
app.post("/webhook", (req, res) => {
  console.log("📩 Message received:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});
// 🔥 catch-all route (DEBUG)
app.get("*", (req, res) => {
  res.status(200).send("APP IS REACHABLE ✅ " + req.url);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
