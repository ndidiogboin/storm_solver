# modeling/storm_analysis.py

import numpy as np


def _triangular_hydrograph(Qp, Tc, time_raw):
    """Shared triangular hydrograph shape."""
    flow = []
    for t in time_raw:
        if t <= Tc:
            q = (Qp / Tc) * t
        elif t <= 2 * Tc:
            q = Qp * (1 - (t - Tc) / Tc)
        else:
            q = 0
        flow.append(round(q, 6))
    return flow


def generate_storm_hydrograph(catchment, intensity, C=None):
    """
    Generates animated hydrograph frames driven by actual rainfall intensity.
    Each frame represents one time step — flow builds as storm progresses.
    """
    Tc   = catchment.get("tc", 5)
    area = catchment.get("area", 1)
    if C is None:
        C = catchment.get("runoff_coefficient", 0.75)

    if Tc <= 0 or area <= 0 or intensity <= 0:
        return {"time": [], "flow": [], "frames": [], "Qp": 0, "Tc": Tc}

    Qp = (C * intensity * area) / (3600 * 1000)

    max_time = 2 * Tc + 30
    time_raw = np.linspace(0, max_time, 60)
    flow     = _triangular_hydrograph(Qp, Tc, time_raw)

    # build animation frames — each frame reveals flow up to that time step
    frames = []
    for i in range(len(time_raw)):
        frames.append({
            "time":    [round(t, 2) for t in time_raw[:i + 1]],
            "flow":    flow[:i + 1],
            "current_q": flow[i],
            "current_t": round(time_raw[i], 2)
        })

    return {
        "time":   [round(t, 2) for t in time_raw],
        "flow":   flow,
        "frames": frames,
        "Qp":     round(Qp, 6),
        "Tc":     round(Tc, 2),
        "label":  catchment.get("name", "Catchment")
    }


def generate_storm_unit_hydrograph(catchment):
    """Unit hydrograph for the selected catchment."""
    Tc   = catchment.get("tc", 5)
    area = catchment.get("area", 1)

    if Tc <= 0 or area <= 0:
        return {"time": [], "flow": [], "Qp_unit": 0}

    Qp_unit  = (0.001 * area) / (Tc * 60)
    max_time = 2 * Tc + 30
    time_raw = np.linspace(0, max_time, 60)
    flow     = _triangular_hydrograph(Qp_unit, Tc, time_raw)

    return {
        "time":    [round(t, 2) for t in time_raw],
        "flow":    flow,
        "Qp_unit": round(Qp_unit, 6),
        "label":   f"Unit Hydrograph — {catchment.get('name', 'Catchment')}"
    }


def generate_rainfall_profile(intensity, Tc):
    """
    Builds a stepped rainfall bar chart profile.
    Constant intensity during storm duration (Tc), zero after.
    """
    if Tc <= 0 or intensity <= 0:
        return {"time": [], "rainfall": [], "excess": []}

    max_time = 2 * Tc + 30
    steps    = 30
    time_raw = np.linspace(0, max_time, steps)
    rainfall = []
    excess   = []

    for t in time_raw:
        r  = intensity if t <= Tc else 0
        e  = r  # full rainfall becomes excess (C applied to Q not intensity)
        rainfall.append(round(r, 2))
        excess.append(round(e, 2))

    return {
        "time":     [round(t, 2) for t in time_raw],
        "rainfall": rainfall,
        "excess":   excess,
        "peak_intensity": round(intensity, 2),
        "duration": round(Tc, 2)
    }


def generate_multi_storm(catchment, idf_data, C=None):
    """
    Generates hydrographs for all return periods in the IDF data simultaneously.
    Returns a series array for direct Chart.js rendering.
    """
    Tc   = catchment.get("tc", 5)
    area = catchment.get("area", 1)
    if C is None:
        C = catchment.get("runoff_coefficient", 0.75)

    if Tc <= 0 or area <= 0:
        return {"series": [], "time": []}

    max_time = 2 * Tc + 30
    time_raw = np.linspace(0, max_time, 60)

    # interpolate intensity for each return period at this Tc
    durations = sorted([int(k) for k in list(idf_data.values())[0].keys()])

    def interpolate(table, tc):
        tcs = sorted([int(k) for k in table.keys()])
        tc  = float(tc)
        if tc <= tcs[0]:  return table[str(tcs[0])]
        if tc >= tcs[-1]: return table[str(tcs[-1])]
        for i in range(len(tcs) - 1):
            t1, t2 = tcs[i], tcs[i + 1]
            if t1 <= tc <= t2:
                I1 = table[str(t1)]
                I2 = table[str(t2)]
                return I1 + (I2 - I1) * (tc - t1) / (t2 - t1)
        return 0

    return_periods = sorted(idf_data.keys(), key=lambda x: int(x))
    series = []

    for rp in return_periods:
        intensity = interpolate(idf_data[rp], Tc)
        Qp        = (C * intensity * area) / (3600 * 1000)
        flow      = _triangular_hydrograph(Qp, Tc, time_raw)
        series.append({
            "return_period": rp,
            "label":         f"{rp}-Year Storm",
            "Qp":            round(Qp, 6),
            "intensity":     round(intensity, 2),
            "flow":          flow
        })

    return {
        "time":   [round(t, 2) for t in time_raw],
        "series": series,
        "Tc":     round(Tc, 2)
    }