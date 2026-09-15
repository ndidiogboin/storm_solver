# modeling/services/storm_service.py

from modeling.storm_analysis import (
    generate_storm_hydrograph,
    generate_storm_unit_hydrograph,
    generate_rainfall_profile,
    generate_multi_storm
)


def get_storm_simulation(mode, catchment, intensity, Tc_override=None, C_override=None, idf_data=None):
    """
    Single entry point for all storm simulation modes.
    Mirrors visualization_service.get_visualization().

    mode        = hydrograph | unit | rainfall | multi | combined
    catchment   = catchment dict from project data
    intensity   = rainfall intensity in mm/hr (from IDF lookup)
    Tc_override = optional override for Tc (from slider)
    C_override  = optional override for C (from slider)
    idf_data    = full IDF dict (needed for multi mode)
    """

    # apply overrides
    c = dict(catchment)
    if Tc_override is not None:
        c["tc"] = float(Tc_override)
    C = float(C_override) if C_override is not None else c.get("runoff_coefficient", 0.75)

    if mode == "hydrograph":
        return generate_storm_hydrograph(c, intensity, C)

    elif mode == "unit":
        return generate_storm_unit_hydrograph(c)

    elif mode == "rainfall":
        return generate_rainfall_profile(intensity, c.get("tc", 5))

    elif mode == "multi":
        if not idf_data:
            return {"error": "IDF data required for multi-storm mode"}
        return generate_multi_storm(c, idf_data, C)

    elif mode == "combined":
        hydrograph = generate_storm_hydrograph(c, intensity, C)
        unit       = generate_storm_unit_hydrograph(c)
        rainfall   = generate_rainfall_profile(intensity, c.get("tc", 5))
        return {
            "hydrograph": hydrograph,
            "unit":       unit,
            "rainfall":   rainfall
        }

    else:
        return {"error": "Invalid storm simulation mode"}
