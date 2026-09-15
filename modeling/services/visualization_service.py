# modeling/services/visualization_service.py

from modeling.hydrograph import generate_hydrograph
from modeling.unit_hydrograph import generate_unit_hydrograph
from modeling.rainfall_runoff import generate_rainfall_runoff
from modeling.idf_curve import generate_idf_curve

def get_visualization(mode, data, index):

    c = data["catchments"][index]

    if mode == "hydrograph":
        return generate_hydrograph(c["q"], c.get("tc", 5))

    elif mode == "unit":
        return generate_unit_hydrograph(c)

    elif mode == "rainfall_runoff":
        return generate_rainfall_runoff(c)
 
    elif mode == "idf":
        return generate_idf_curve()

    else:
        return {"error": "Invalid mode"}