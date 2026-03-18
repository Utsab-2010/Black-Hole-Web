"""
Bot: loads AlphaBH and returns the best action for a given board state.
Uses pure neural network policy (no MCTS) for low-latency web responses.
Supports v1.pth and v2.pth from specials/.
"""
import os
import sys
import numpy as np
import torch

# Allow imports from the parent RL project when running locally
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from black_hole.model import AlphaBH, preprocess_obs

DEVICE = torch.device("cpu")  # CPU only on free Render tier
NUM_HEXES = 45
TILES_PER_PLAYER = 22

# ──────────────────────────────────────────────────────────────────────────────
# Model registry  (name → relative path from this file)
# ──────────────────────────────────────────────────────────────────────────────
MODEL_PATHS = {
    "v1": os.path.join(SCRIPT_DIR, "models", "v1.pth"),
    "v2": os.path.join(SCRIPT_DIR, "models", "v2.pth"),
}

_model_cache: dict[str, AlphaBH] = {}


def _load_model(name: str) -> AlphaBH:
    if name not in _model_cache:
        path = MODEL_PATHS.get(name)
        if path is None or not os.path.exists(path):
            raise FileNotFoundError(f"Model '{name}' not found at {path}")
        ckpt = torch.load(path, map_location=DEVICE)
        model = AlphaBH().to(DEVICE)
        state_dict = ckpt.get("model_state_dict", ckpt)
        model.load_state_dict(state_dict)
        model.eval()
        _model_cache[name] = model
        print(f"[Bot] Loaded model '{name}' from {path}")
    return _model_cache[name]


def get_action(board: list, tiles_placed: int, model_name: str = "v2") -> int:
    """
    board       : list of [player_id, tile_value] with length NUM_HEXES
    tiles_placed: number of tiles placed so far
    model_name  : 'v1' or 'v2'
    Returns the index of the chosen hex (0-based).
    """
    model = _load_model(model_name)

    board_np = np.array(board, dtype=int)  # (45, 2)

    obs = {"board": board_np, "current_tile": (tiles_placed // 2) + 1}

    # Canonicalize if Player 2's turn (even tiles_placed = P1, odd = P2)
    current_player = 2 if (tiles_placed % 2 == 1) else 1
    if current_player == 2:
        b = obs["board"].copy()
        p1 = (b[:, 0] == 1)
        p2 = (b[:, 0] == 2)
        b[p1, 0] = 2
        b[p2, 0] = 1
        obs["board"] = b

    state_tensor = preprocess_obs(obs, DEVICE).unsqueeze(0)

    with torch.no_grad():
        policy_logits, _ = model(state_tensor)

    # Mask invalid moves
    valid = [i for i in range(NUM_HEXES) if board[i][0] == 0]
    mask = torch.full((1, NUM_HEXES), float("-inf"), device=DEVICE)
    for i in valid:
        mask[0, i] = 0.0

    policy_logits = policy_logits + mask
    action = int(policy_logits.argmax(dim=1).item())
    return action
