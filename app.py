"""
Flask API for Black Hole bot.
Single endpoint: POST /api/bot_move
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import bot

app = Flask(__name__)
CORS(app)  # Allow GitHub Pages frontend to call this API


@app.get("/")
def health():
    return {"status": "ok", "message": "Black Hole Bot API is running"}


@app.post("/api/bot_move")
def bot_move():
    """
    Request body:
        {
            "board": [[player, value], ...],  // length 45
            "tiles_placed": <int>,
            "model": "v1" | "v2"              // optional, default v2
        }
    Response:
        { "action": <int 0-44> }
    """
    data = request.get_json(force=True)
    board = data.get("board")
    tiles_placed = data.get("tiles_placed", 0)
    model_name = data.get("model", "v2")

    if board is None or len(board) != 45:
        return jsonify({"error": "Invalid board"}), 400

    try:
        action = bot.get_action(board, tiles_placed, model_name)
        return jsonify({"action": action})
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        return jsonify({"error": f"Bot error: {e}"}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
