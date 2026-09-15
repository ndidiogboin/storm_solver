# simulation/animation_builder.py

def build_animation(timestep_result, network):
    """
    Builds frame-by-frame animation payload with:
    - water depth per node (from actual hydraulic design dimensions)
    - fill ratio per link (how full the channel is)
    - wave particles travelling along each link
    """

    time    = timestep_result.get("time", [])
    series  = timestep_result.get("series", [])
    nodes   = network.get("nodes", [])
    links   = network.get("links", [])

    if not time or not series:
        return {"frames": [], "nodes": nodes, "links": links, "max_flow": 0, "duration": 0}

    all_flows = [q for s in series for q in s["flow"]]
    max_flow  = max(all_flows) if all_flows else 1

    flow_map = {s["index"]: s["flow"] for s in series}

    # build node lookup for qcap
    node_map = {n["index"]: n for n in nodes}

    # --- WAVE PARTICLES per link ---
    # each link has a particle that travels from 0.0 → 1.0 (upstream → downstream)
    # speed = flow / qcap (normalised), resets when it reaches 1.0
    wave_positions = {
        (lk["from"], lk["to"]): 0.0
        for lk in links
    }

    frames = []

    for t_idx, t in enumerate(time):

        node_states = []

        for node in nodes:
            i      = node["index"]
            q      = flow_map.get(i, [0])[t_idx] if t_idx < len(flow_map.get(i, [])) else 0
            qcap   = node.get("qcap", 0) or 1
            d_full = node.get("d", 0)        # designed full depth
            b      = node.get("b", 0)
            a      = node.get("a", b)
            stype  = node.get("section_type", "Rectangular")

            # water depth: scales with sqrt of fill ratio (more realistic rise)
            fill_ratio = min(q / qcap, 1.0) if qcap > 0 else 0
            water_depth = d_full * (fill_ratio ** 0.5)
            intensity   = fill_ratio

            node_states.append({
                "index":       i,
                "name":        node["name"],
                "x":           node["x"],
                "y":           node["y"],
                "q":           round(q, 5),
                "qcap":        round(qcap, 5),
                "fill_ratio":  round(fill_ratio, 4),
                "water_depth": round(water_depth, 4),
                "d_full":      round(d_full, 4),
                "b":           b,
                "a":           a,
                "section_type": stype,
                "intensity":   round(intensity, 4)
            })

        # --- LINK STATES with travelling wave ---
        link_states = []

        dt = (time[1] - time[0]) if len(time) > 1 else 1.0   # minutes per frame

        for lk in links:
            from_i  = lk["from"]
            to_i    = lk["to"]
            key     = (from_i, to_i)

            from_node = node_map.get(from_i, {})
            qcap_link = from_node.get("qcap", 1) or 1
            q_link    = flow_map.get(from_i, [0])[t_idx] if t_idx < len(flow_map.get(from_i, [])) else 0

            fill_ratio_link = min(q_link / qcap_link, 1.0) if qcap_link > 0 else 0

            # advance wave particle — speed proportional to fill ratio
            wave_speed = 0.04 + fill_ratio_link * 0.06   # 0.04–0.10 per frame
            wave_positions[key] = (wave_positions[key] + wave_speed) % 1.0

            link_states.append({
                "from":       from_i,
                "to":         to_i,
                "fill_ratio": round(fill_ratio_link, 4),
                "wave_pos":   round(wave_positions[key], 4),
                "hydraulic":  lk.get("hydraulic", None)
            })

        frames.append({
            "time":  t,
            "nodes": node_states,
            "links": link_states
        })

    return {
        "frames":   frames,
        "max_flow": round(max_flow, 5),
        "duration": time[-1] if time else 0,
        # static network geometry for renderer setup
        "nodes":    nodes,
        "links":    links
    }
