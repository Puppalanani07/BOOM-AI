const express = require("express");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.static("public"));

app.use((req, res, next) => {
  const origin = req.get("Origin");
  const allowedOrigin = process.env.FRONTEND_ORIGIN;

  if (origin && origin === allowedOrigin) {
    res.set("Access-Control-Allow-Origin", allowedOrigin);
    res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.vary("Origin");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(origin === allowedOrigin ? 204 : 403);
  }

  next();
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

async function forwardToPython(res, path, options = {}) {
  let response;
  try {
    response = await fetch(
      `${process.env.GROQ_SERVICE_URL || "http://127.0.0.1:5001"}${path}`,
      options
    );
  } catch (error) {
    res.status(503).json({
      error:
        "Unable to reach the Python service. Start it with `python groq_service.py` and try again.",
    });
    return;
  }

  try {
    const result = await response.json();
    res.status(response.status).json(result);
  } catch (error) {
    res.status(502).json({
      error: "The Python service returned an invalid response.",
    });
  }
}

app.post("/api/chat", (req, res) => {
  forwardToPython(res, "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
});

app.get("/api/history/:sessionId", (req, res) => {
  const sessionId = encodeURIComponent(req.params.sessionId);
  forwardToPython(res, `/api/history/${sessionId}`);
});

app.delete("/api/history/:sessionId", (req, res) => {
  const sessionId = encodeURIComponent(req.params.sessionId);
  forwardToPython(res, `/api/history/${sessionId}`, { method: "DELETE" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BOOM AI running at http://localhost:${PORT}`);
});