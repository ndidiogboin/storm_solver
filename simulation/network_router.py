# simulation/network_router.py

def build_network(nodes):
    """
    Builds a directed drainage network with linear left-to-right layout.
    Upstream nodes sit left, downstream nodes sit right, ordered by routing depth.
    Each node carries its hydraulic_design dimensions for the animation renderer.
    """
    n = len(nodes)
    if n == 0:
        return {"nodes": [], "links": []}

    # --- COMPUTE ROUTING DEPTH (topological order) ---
    # depth 0 = headwater (no upstream), higher depth = further downstream
    depth = {i: 0 for i in range(n)}

    def get_depth(index, visited=None):
        if visited is None:
            visited = set()
        if index in visited:
            return 0
        visited.add(index)
        ups = nodes[index].get("upstream", [])
        if not ups:
            return 0
        return 1 + max(get_depth(u, visited.copy()) for u in ups if 0 <= u < n)

    for i in range(n):
        depth[i] = get_depth(i)

    max_depth = max(depth.values()) if depth else 0

    # --- ASSIGN LINEAR POSITIONS ---
    # Group nodes by depth, spread vertically within each column
    from collections import defaultdict
    cols = defaultdict(list)
    for i in range(n):
        cols[depth[i]].append(i)

    positions = {}
    X_STEP = 200
    Y_STEP = 130
    X_START = 100
    Y_START = 80

    for col_idx in range(max_depth + 1):
        col_nodes = cols[col_idx]
        total_h = (len(col_nodes) - 1) * Y_STEP
        y_offset = Y_START + (max(len(c) for c in cols.values()) - 1) * Y_STEP / 2 - total_h / 2
        for row_idx, node_idx in enumerate(col_nodes):
            positions[node_idx] = {
                "x": X_START + col_idx * X_STEP,
                "y": y_offset + row_idx * Y_STEP
            }

    # --- BUILD LINKS ---
    links = []
    for node in nodes:
        target = node["index"]
        for upstream_index in node.get("upstream", []):
            if 0 <= upstream_index < n:
                links.append({
                    "from": upstream_index,
                    "to": target,
                    "flow": nodes[upstream_index].get("q", 0),
                    # carry hydraulic design of the upstream channel
                    "hydraulic": nodes[upstream_index].get("hydraulic_design", None)
                })

    # --- ATTACH POSITIONS + HYDRAULIC DIMS TO NODES ---
    positioned_nodes = []
    for node in nodes:
        i = node["index"]
        hd = node.get("hydraulic_design", None)
        section_type = None
        b = d = a = qcap = 0
        if hd and "result" in hd:
            r = hd["result"]
            section_type = r.get("type", None)
            b = r.get("b", 0)
            d = r.get("d", 0)
            a = r.get("a", b)       # trapezoidal bottom width; falls back to b
            qcap = r.get("Qcap", 0)

        positioned_nodes.append({
            **node,
            "x": positions[i]["x"],
            "y": positions[i]["y"],
            "section_type": section_type,
            "b": b,
            "d": d,
            "a": a,
            "qcap": qcap
        })

    return {
        "nodes": positioned_nodes,
        "links": links
    }
