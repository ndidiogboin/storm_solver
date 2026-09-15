# simulation/services/simulation_service.py

from simulation.result_aggregator import aggregate_results
from simulation.network_router import build_network
from simulation.timestep_engine import run_timestep
from simulation.animation_builder import build_animation


# ══════════════════════════════════════════
# OUTPUT FILTERING (display-only — does not
# touch routing/flow computation, which must
# always run on the FULL catchment set so
# upstream index references stay valid)
# ══════════════════════════════════════════

def _filter_nodes(nodes, selected):
    return [n for n in nodes if n["index"] in selected]


def _filter_links(links, selected):
    # drop a link entirely if either end isn't in the selection,
    # rather than leaving a dangling reference
    return [lk for lk in links if lk["from"] in selected and lk["to"] in selected]


def _filter_network(network, selected):
    return {
        "nodes": _filter_nodes(network.get("nodes", []), selected),
        "links": _filter_links(network.get("links", []), selected)
    }


def _filter_timestep(timestep, selected):
    return {
        "time": timestep.get("time", []),
        "series": [s for s in timestep.get("series", []) if s["index"] in selected]
    }


def _filter_animation(animation, selected):
    frames = []
    for f in animation.get("frames", []):
        frames.append({
            "time":  f.get("time"),
            "nodes": _filter_nodes(f.get("nodes", []), selected),
            "links": _filter_links(f.get("links", []), selected)
        })

    return {
        "frames":   frames,
        "max_flow": animation.get("max_flow", 0),
        "duration": animation.get("duration", 0),
        "nodes":    _filter_nodes(animation.get("nodes", []), selected),
        "links":    _filter_links(animation.get("links", []), selected)
    }


# ══════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════

def get_simulation(mode, data, selected=None):
    """
    Single entry point for all simulation modes.
    Mirrors visualization_service.get_visualization().

    `selected` (optional): a collection of catchment indices to include
    in the OUTPUT. When provided, computation still runs on the full
    catchment set (so upstream flow accumulation stays correct) and
    filtering is applied only to what gets returned.
    """

    aggregated = aggregate_results(data)
    nodes = aggregated["nodes"]

    selected_set = set(selected) if selected is not None else None

    if mode == "network":
        network   = build_network(nodes)
        timestep  = run_timestep(nodes)
        animation = build_animation(timestep, network)
        result = {
            "animation": animation,
            "timestep":  timestep,
            "network":   network
        }

    elif mode == "timestep":
        network   = build_network(nodes)
        timestep  = run_timestep(nodes)
        animation = build_animation(timestep, network)
        result = {
            "animation": animation,
            "timestep":  timestep,
            "network":   network
        }

    elif mode == "animation":
        network  = build_network(nodes)
        timestep = run_timestep(nodes)
        result = build_animation(timestep, network)

    elif mode == "combined":
        network   = build_network(nodes)
        timestep  = run_timestep(nodes)
        animation = build_animation(timestep, network)
        result = {
            "animation": animation,
            "timestep":  timestep,
            "network":   network
        }

    else:
        return {"error": "Invalid simulation mode"}

    if selected_set is not None:
        if mode == "animation":
            result = _filter_animation(result, selected_set)
        else:
            result["animation"] = _filter_animation(result["animation"], selected_set)
            result["timestep"]  = _filter_timestep(result["timestep"], selected_set)
            result["network"]   = _filter_network(result["network"], selected_set)

    return result
