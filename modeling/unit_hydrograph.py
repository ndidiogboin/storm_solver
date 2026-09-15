import numpy as np

def generate_unit_hydrograph(catchment):

    Tc = catchment.get("tc", 5)
    area = catchment.get("area", 1)

    if Tc <= 0 or area <= 0:
        return {"time": [], "flow": []}

    Qp_unit = (0.001 * area) / (Tc * 60)

    time_raw = np.linspace(0, 3 * Tc, 50)
    flow = []

    for t in time_raw:
        if t <= Tc:
            q = (Qp_unit / Tc) * t
        elif t <= 2 * Tc:
            q = Qp_unit * (1 - (t - Tc) / Tc)
        else:
            q = 0
        flow.append(round(q, 6))

    return {
        "time": [round(t, 2) for t in time_raw],
        "flow": flow,
        "Qp_unit": round(Qp_unit, 6),
        "label": f"Unit Hydrograph – {catchment.get('name', 'Catchment')}"
    }