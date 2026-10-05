const express = require("express");
const OpenAI = require("openai");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.static("public"));

console.log(
  "API KEY LOADED:",
  process.env.OPENAI_API_KEY ? "YES" : "NO"
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const Chat = mongoose.model(
  "Chat",
  new mongoose.Schema({
    sessionId: String,
    message: String,
    reply: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  })
);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, messages } = req.body;

    const response = await openai.responses.create({
      model: "gpt-5.6-luna",
      instructions:
        "You are BOOM AI, a helpful and friendly AI assistant. Reply clearly and simply.",
      input: messages,
    });

    const reply = response.output_text;

    const lastMessage = messages
      .filter((m) => m.role === "user")
      .pop();

    if (lastMessage) {
      await Chat.create({
        sessionId,
        message: lastMessage.content,
        reply,
      });
    }

    res.json({ reply });
  } catch (error) {
    console.error("FULL OPENAI ERROR:", error);

    res.status(500).json({
      error: error.message || "OpenAI request failed",
    });
  }
});

app.get("/api/history/:sessionId", async (req, res) => {
  try {
    const chats = await Chat.find({
      sessionId: req.params.sessionId,
    }).sort({ createdAt: 1 });

    res.json(chats);
  } catch (error) {
    res.status(500).json({
      error: "Unable to load chat history",
    });
  }
});

app.delete("/api/history/:sessionId", async (req, res) => {
  try {
    await Chat.deleteMany({
      sessionId: req.params.sessionId,
    });

    res.json({
      message: "Chat history cleared",
    });
  } catch (error) {
    res.status(500).json({
      error: "Unable to clear chat history",
    });
  }
});

const PORT = process.env.PORT || 3000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`BOOM AI running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(
      "MongoDB connection failed:",
      error.message
    );
  });