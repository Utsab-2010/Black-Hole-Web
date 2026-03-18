"""
Pure-Python Black Hole game engine (no numpy/torch).
Mirrors black_hole/game.py but dependency-free for lightweight imports.
"""
from collections import deque

DEFAULT_LAYERS = 9


def build_adjacency(layers):
    N = (layers * (layers + 1)) // 2
    adj = {i: [] for i in range(N)}

    def idx(r, c):
        return r * (r + 1) // 2 + c

    for r in range(layers):
        for c in range(r + 1):
            i = idx(r, c)
            # Right neighbour in same row
            if c + 1 <= r:
                j = idx(r, c + 1)
                adj[i].append(j); adj[j].append(i)
            # Two children in next row
            if r + 1 < layers:
                j1 = idx(r + 1, c)
                j2 = idx(r + 1, c + 1)
                adj[i].append(j1); adj[j1].append(i)
                adj[i].append(j2); adj[j2].append(i)

    # Deduplicate
    return {k: list(set(v)) for k, v in adj.items()}


NUM_HEXES = (DEFAULT_LAYERS * (DEFAULT_LAYERS + 1)) // 2          # 45
TILES_PER_PLAYER = (NUM_HEXES - 1) // 2                           # 22
ADJ = build_adjacency(DEFAULT_LAYERS)


def get_valid_moves(board):
    """board: list of [player, value] length NUM_HEXES"""
    return [i for i in range(NUM_HEXES) if board[i][0] == 0]


def is_game_over(board):
    return sum(1 for cell in board if cell[0] == 0) == 1


def calculate_score(board):
    """
    BFS from the black hole outward.
    Returns (winner, {ring: {p1_sum, p2_sum}}).
    winner: 1, 2, or 0 (draw).
    """
    black_hole = next(i for i, cell in enumerate(board) if cell[0] == 0)

    visited = [False] * NUM_HEXES
    visited[black_hole] = True
    queue = deque([(black_hole, 0)])
    ring_scores = {}  # ring -> [p1_sum, p2_sum]

    while queue:
        node, dist = queue.popleft()
        if dist > 0:
            ring = dist
            if ring not in ring_scores:
                ring_scores[ring] = [0, 0]
            p, v = board[node]
            ring_scores[ring][p - 1] += v

        for nb in ADJ[node]:
            if not visited[nb]:
                visited[nb] = True
                queue.append((nb, dist + 1))

    for ring in sorted(ring_scores):
        p1, p2 = ring_scores[ring]
        if p1 < p2:
            return 1, ring_scores
        elif p2 < p1:
            return 2, ring_scores

    return 0, ring_scores
