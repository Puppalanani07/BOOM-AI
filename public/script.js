
const chatBox = document.getElementById("chatBox");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const historyBox = document.getElementById("history");
const newChatBtn = document.getElementById("newChat");
const clearChatBtn = document.getElementById("clearChat");
const menuBtn = document.getElementById("menuBtn");
const closeSidebar = document.getElementById("closeSidebar");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const apiBaseUrl = (window.BOOM_API_BASE_URL || "").replace(/\/+$/, "");

function apiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

let sessionId = crypto.randomUUID();
let conversation = [];
let isSending = false;

// Welcome screen
function showWelcome() {
  chatBox.replaceChildren();

  const welcome = document.createElement("div");
  welcome.className = "welcome";

  const logo = document.createElement("div");
  logo.className = "welcome-logo";
  logo.textContent = "💥";

  const title = document.createElement("h1");
  title.textContent = "Welcome to BOOM AI";

  const subtitle = document.createElement("p");
  subtitle.textContent =
    "Your ideas start here. What would you like to explore?";

  welcome.append(logo, title, subtitle);

  const suggestions = [
    ["💻", "Learn coding", "Explain JavaScript simply",
      "Explain JavaScript in simple words"],
    ["💡", "Get ideas", "Explore new project ideas",
      "Give me 5 creative project ideas"],
    ["📚", "Study help", "Make a study timetable",
      "Help me create a study timetable"],
    ["✨", "Be creative", "Write a short story",
      "Write a short motivational story"]
  ];

  const grid = document.createElement("div");
  grid.className = "suggestions";

  suggestions.forEach(([icon, titleText, subtitleText, prompt]) => {
    const button = document.createElement("button");
    button.className = "suggestion";
    button.dataset.prompt = prompt;

    const emoji = document.createElement("span");
    emoji.textContent = icon;

    const strong = document.createElement("strong");
    strong.textContent = titleText;

    const small = document.createElement("small");
    small.textContent = subtitleText;

    button.append(emoji, strong, small);
    grid.appendChild(button);
  });

  welcome.appendChild(grid);
  chatBox.appendChild(welcome);
}

// Add message
function addMessage(role, text) {
  const welcome = chatBox.querySelector(".welcome");
  if (welcome) welcome.remove();

  const message = document.createElement("div");
  message.className = `message ${role}`;

  const title = document.createElement("strong");
  title.textContent = role === "user" ? "You" : "💥 BOOM AI";

  const content = document.createElement("div");
  content.textContent = text;

  message.append(title, content);
  chatBox.appendChild(message);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Loading indicator
function showLoading() {
  const loading = document.createElement("div");
  loading.className = "message ai";
  loading.textContent = "💥 BOOM AI is thinking...";

  chatBox.appendChild(loading);
  chatBox.scrollTop = chatBox.scrollHeight;

  return loading;
}

async function readJsonResponse(response) {
  const body = await response.text();
  let data;

  if (body.trim()) {
    try {
      data = JSON.parse(body);
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed (HTTP ${response.status})`);
      }
      throw new Error("Server returned an invalid JSON response.");
    }
  } else {
    if (!response.ok) {
      throw new Error(`Request failed (HTTP ${response.status})`);
    }
    throw new Error("Server returned an empty response.");
  }

  if (!response.ok) {
    const message =
      data && typeof data.error === "string"
        ? data.error
        : `Request failed (HTTP ${response.status})`;
    throw new Error(message);
  }

  return data;
}

// Load current conversation history
async function loadHistory() {
  try {
    const response = await fetch(
      apiUrl(`/api/history/${encodeURIComponent(sessionId)}`)
    );
    const chats = await readJsonResponse(response);
    historyBox.replaceChildren();

    chats.forEach((chat) => {
      const item = document.createElement("div");
      item.className = "history-item";
      item.textContent = chat.message;
      item.title = chat.message;

      item.addEventListener("click", () => {
        conversation = [
          { role: "user", content: chat.message },
          { role: "assistant", content: chat.reply }
        ];

        chatBox.replaceChildren();
        addMessage("user", chat.message);
        addMessage("ai", chat.reply);
        closeMobileSidebar();
      });

      historyBox.appendChild(item);
    });
  } catch (error) {
    console.error(error.message);
  }
}

// Send message
async function sendMessage(text) {
  if (isSending) return;

  const message = text.trim();
  if (!message) return;

  isSending = true;
  sendBtn.disabled = true;

  addMessage("user", message);
  conversation.push({ role: "user", content: message });

  userInput.value = "";
  const loading = showLoading();

  try {
    const response = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, messages: conversation })
    });

    const data = await readJsonResponse(response);
    loading.remove();

    conversation.push({
      role: "assistant",
      content: data.reply
    });

    addMessage("ai", data.reply);
    await loadHistory();
  } catch (error) {
    loading.remove();
    if (conversation[conversation.length - 1]?.role === "user") {
      conversation.pop();
    }
    addMessage("ai", "⚠️ " + error.message);
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// Submit form
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(userInput.value);
});

// Suggestion buttons
chatBox.addEventListener("click", (event) => {
  const button = event.target.closest(".suggestion");
  if (button) sendMessage(button.dataset.prompt);
});

// New chat
newChatBtn.addEventListener("click", () => {
  sessionId = crypto.randomUUID();
  conversation = [];
  showWelcome();
  loadHistory();
  closeMobileSidebar();
  userInput.focus();
});

// Clear chat
clearChatBtn.addEventListener("click", async () => {
  if (isSending) return;

  if (!confirm("Delete this conversation's saved messages?")) return;

  try {
    const response = await fetch(
      apiUrl(`/api/history/${encodeURIComponent(sessionId)}`),
      { method: "DELETE" }
    );
    await readJsonResponse(response);

    conversation = [];
    showWelcome();
    await loadHistory();
  } catch (error) {
    alert(error.message);
  }
});

// Mobile sidebar
function closeMobileSidebar() {
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
}

menuBtn.addEventListener("click", () => {
  sidebar.classList.add("open");
  overlay.classList.add("show");
});

closeSidebar.addEventListener("click", closeMobileSidebar);
overlay.addEventListener("click", closeMobileSidebar);

// Initialize
showWelcome();
loadHistory();