import numpy as np

def generate_rainfall_runoff(catchment):
    Tc = catchment.get("tc", 5)
    area = catchment.get("area", 1)
    intensity = catchment.get("intensity", 0)
    C = 0.75  # default runoff coefficient fallback

    if Tc <= 0:
        return {"time": [], "rainfall": [], "runoff": []}

    time_raw = np.linspace(0, 3 * Tc, 50)
    rainfall = []
    runoff = []

    for t in time_raw:
        # constant rainfall during storm duration (Tc)
        r = intensity if t <= Tc else 0
        ro = C * r if t <= Tc else 0
        rainfall.append(round(r, 4))
        runoff.append(round(ro, 4))

    return {
        "time": [round(t, 2) for t in time_raw],
        "rainfall": rainfall,
        "runoff": runoff,
        "label": catchment.get("name", "Catchment")
    }