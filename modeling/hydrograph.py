import numpy as np

def generate_hydrograph(Qp, Tc):

    if Tc <= 0:
        return {"time": [], "flow": []}

    time_raw = np.linspace(0, 3 * Tc, 50)

    flow = []

    for t in time_raw:
        if t <= Tc:
            q = (Qp / Tc) * t
        elif t <= 2 * Tc:
            q = Qp * (1 - (t - Tc) / Tc)
        else:
            q = 0

        flow.append(round(q, 5))

    return {
        "time": [round(t, 2) for t in time_raw],
        "flow": flow
    }