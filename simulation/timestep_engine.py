# simulation/timestep_engine.py

import numpy as np

def run_timestep(nodes):
    """
    Steps through time from 0 to 2 * max_Tc + 30 (30 min freeboard so the
    slowest node's hydrograph fully completes its recession to zero).
    At each timestep, computes flow at each node using the
    triangular hydrograph shape (same as hydrograph.py).
    Returns a time array and per-node flow series.
    """

    if not nodes:
        return {"time": [], "series": []}

    max_tc = max(node.get("tc", 5) for node in nodes)
    max_tc = max(max_tc, 5)

    # time axis must reach 2*max_tc (where the slowest node's hydrograph
    # returns to zero), plus 30 min freeboard
    max_time = 2 * max_tc + 30

    time_raw = np.linspace(0, max_time, 30)

    series = []

    for node in nodes:
        Qp = node.get("q", 0)
        Tc = node.get("tc", 5)

        if Tc <= 0:
            Tc = 5

        flow = []

        for t in time_raw:
            if t <= Tc:
                q = (Qp / Tc) * t
            elif t <= 2 * Tc:
                q = Qp * (1 - (t - Tc) / Tc)
            else:
                q = 0

            flow.append(round(q, 5))

        series.append({
            "index": node["index"],
            "name": node["name"],
            "Qp": round(Qp, 5),
            "Tc": round(Tc, 2),
            "flow": flow
        })

    return {
        "time": [round(t, 2) for t in time_raw],
        "series": series
    }