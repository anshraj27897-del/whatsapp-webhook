import express from "express";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "ansh_123";

// ✅ Root route (sirf test ke liye)
app.get("/", (req, res) => {
  res.send("WhatsApp webhook server is running");
});

// ✅ META VERIFY ROUTE (MOST IMPORTANT)
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

// ✅ MESSAGE RECEIVE ROUTE
app.post("/webhook", (req, res) => {
  console.log("Incoming message:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
