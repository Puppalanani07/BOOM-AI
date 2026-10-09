import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from groq import APIConnectionError, APIError, Groq
from pymongo import MongoClient
from pymongo.errors import OperationFailure, PyMongoError, ServerSelectionTimeoutError


load_dotenv()

app = Flask(__name__)
api_key = os.getenv("GROQ_API_KEY")
mongo_uri = os.getenv("MONGODB_URI")
groq_client = Groq(api_key=api_key) if api_key else None
mongo_client = None
chat_collection = None


def get_chat_collection():
    global mongo_client, chat_collection

    if not mongo_uri:
        raise ValueError(
            "Missing MONGODB_URI. Add your MongoDB Atlas connection string to .env."
        )

    if chat_collection is None:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        try:
            client.admin.command("ping")
        except PyMongoError:
            client.close()
            raise
        mongo_client = client
        chat_collection = mongo_client["boom_ai"]["chats"]

    return chat_collection


def mongo_error_response(error):
    app.logger.error("MongoDB request failed (%s)", type(error).__name__)

    if isinstance(error, ServerSelectionTimeoutError):
        message = (
            "Could not connect to MongoDB Atlas. Check MONGODB_URI and your Atlas "
            "network access/IP access list."
        )
    elif isinstance(error, OperationFailure) and error.code == 18:
        message = (
            "MongoDB authentication failed. Check the username and password in "
            "MONGODB_URI."
        )
    else:
        message = "MongoDB request failed. Verify your Atlas connection settings and try again."

    return jsonify(error=message), 503


@app.post("/api/chat")
def chat():
    if groq_client is None:
        return jsonify(
            error="Missing GROQ_API_KEY. Add your Groq API key to .env and restart the service."
        ), 503

    data = request.get_json(silent=True)
    session_id = data.get("sessionId") if isinstance(data, dict) else None
    messages = data.get("messages") if isinstance(data, dict) else None

    if not isinstance(session_id, str) or not session_id.strip():
        return jsonify(error="A valid sessionId is required."), 400
    if not isinstance(messages, list) or not messages:
        return jsonify(error="Send at least one chat message."), 400

    valid_roles = {"system", "user", "assistant"}
    if any(
        not isinstance(message, dict)
        or not isinstance(message.get("role"), str)
        or message.get("role") not in valid_roles
        or not isinstance(message.get("content"), str)
        for message in messages
    ):
        return jsonify(
            error="Each message must include a valid role and text content."
        ), 400

    last_user_message = next(
        (
            message["content"]
            for message in reversed(messages)
            if message["role"] == "user"
        ),
        None,
    )
    if not last_user_message:
        return jsonify(error="A user prompt is required."), 400

    try:
        collection = get_chat_collection()
    except ValueError as error:
        return jsonify(error=str(error)), 503
    except PyMongoError as error:
        return mongo_error_response(error)

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are BOOM AI, a helpful and friendly AI assistant. Reply clearly and simply.",
                },
                *messages,
            ],
        )
    except APIConnectionError:
        app.logger.error("Groq API connection failed")
        return jsonify(
            error="Could not connect to Groq. Check your internet connection and try again."
        ), 502
    except APIError as error:
        status_code = error.status_code
        app.logger.error("Groq API request failed (HTTP %s)", status_code)
        if status_code == 401:
            message = "Groq rejected the API key. Verify GROQ_API_KEY in .env."
        elif status_code == 429:
            message = "Groq rate limit reached. Please wait a moment and try again."
        else:
            message = "Groq API request failed. Please try again."
        return jsonify(error=message), 502

    reply = response.choices[0].message.content
    if not reply:
        app.logger.error("Groq returned an empty response")
        return jsonify(error="Groq returned an empty response. Please try again."), 502

    try:
        collection.insert_one(
            {
                "sessionId": session_id,
                "message": last_user_message,
                "reply": reply,
                "createdAt": datetime.now(timezone.utc),
            }
        )
    except PyMongoError as error:
        return mongo_error_response(error)

    return jsonify(reply=reply)


@app.get("/api/history/<session_id>")
def get_history(session_id):
    try:
        chats = get_chat_collection().find(
            {"sessionId": session_id},
            {"sessionId": 1, "message": 1, "reply": 1, "createdAt": 1},
        ).sort("createdAt", 1)
        history = [
            {
                "_id": str(chat["_id"]),
                "sessionId": chat["sessionId"],
                "message": chat["message"],
                "reply": chat["reply"],
                "createdAt": chat["createdAt"].isoformat(),
            }
            for chat in chats
        ]
    except ValueError as error:
        return jsonify(error=str(error)), 503
    except PyMongoError as error:
        return mongo_error_response(error)

    return jsonify(history)


@app.delete("/api/history/<session_id>")
def clear_history(session_id):
    try:
        get_chat_collection().delete_many({"sessionId": session_id})
    except ValueError as error:
        return jsonify(error=str(error)), 503
    except PyMongoError as error:
        return mongo_error_response(error)

    return jsonify(message="Chat history cleared")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("GROQ_SERVICE_PORT", "5001")))
