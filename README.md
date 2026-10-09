# BOOM AI

BOOM AI is a browser-based chat app. The Node.js server hosts the existing UI
and forwards chat and history requests to the Python API. Python uses the
official Groq SDK to generate responses and PyMongo to store chats in MongoDB
Atlas.

## Requirements

- Node.js 18 or newer
- Python 3.10 or newer
- A MongoDB Atlas cluster and database user
- A Groq API key

## Configure MongoDB Atlas and Groq

1. In MongoDB Atlas, create a database user and allow your machine's IP address
   in the project's Network Access settings.
2. Copy `.env.example` to `.env` only if `.env` does not already exist. Add your
   Groq API key and MongoDB Atlas connection string to `.env`, using the exact
   variable names shown in the example. Do not commit `.env`.

   ```powershell
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   ```

3. The Python service uses the `boom_ai` database and `chats` collection. They
   are created automatically when the first chat is saved.

## Install

Install the Node dependencies:

```powershell
npm.cmd install
```

Create a Python virtual environment and install the service packages (Flask,
the official `groq` SDK, `pymongo`, and `python-dotenv`):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Run

Start the Python API in one terminal:

```powershell
.\.venv\Scripts\python.exe groq_service.py
```

Start the Node.js web app in a second terminal:

```powershell
npm.cmd start
```

Open <http://localhost:3000>. The Python API listens on
`http://127.0.0.1:5001` by default. Set `GROQ_SERVICE_URL` in the Node
environment if the Python API uses a different URL.

Chat requests use Groq model `llama-3.3-70b-versatile`; each saved record
contains the session ID, user's prompt, AI response, and creation time. Clear
and history operations use the same MongoDB collection. Missing credentials,
Atlas connectivity/authentication errors, and Groq API errors are reported
without logging secret values.

## Deploy the API to Render

GitHub Pages only serves the static frontend; it cannot run the Node or Python
API. The deployed frontend therefore needs the API hosted separately.

1. Create a Render Blueprint from this repository. The included `render.yaml`
   deploys the Node and Python services together in one Docker web service.
2. In the Render service environment settings, set `GROQ_API_KEY` and
   `MONGODB_URI`. These are secret environment values: do not add them to Git,
   GitHub Actions variables, or frontend configuration. The API permits browser
   calls from `https://puppalanani07.github.io`.
3. Copy the service's HTTPS origin from Render, such as
   `https://boom-ai-api.onrender.com`.
4. In the GitHub repository, add an Actions variable named
   `BOOM_API_BASE_URL` containing that HTTPS origin (without a path or trailing
   slash). The Pages workflow writes it into the generated frontend config
   when deploying.
5. Push to `main` or run the Pages workflow manually. Confirm the Render
   service health endpoint returns `{"status":"ok"}` at `/health`, then test a
   prompt on the GitHub Pages site.

When developing locally, leave `BOOM_API_BASE_URL` unset in the source
`public/config.js`; the frontend then calls the same-origin Node server at
`http://localhost:3000`.
