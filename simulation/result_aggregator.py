# simulation/result_aggregator.py

def aggregate_results(data):
    """
    Pulls already-computed hydrology + hydraulic data from project
    and packages it into a clean simulation-ready input dict.
    """
    catchments = data.get("catchments", [])
    parameters = data.get("parameters", {})

    nodes = []

    for i, c in enumerate(catchments):
        node = {
            "index": i,
            "name": c.get("name", f"Catchment {i}"),
            "area": c.get("area", 0),
            "tc": c.get("tc", 5),
            "q": c.get("q", 0),
            "q_local": c.get("q_local", 0),
            "intensity": c.get("intensity", 0),
            "upstream": c.get("upstream", []),
            "hydraulic_design": c.get("hydraulic_design", None)
        }
        nodes.append(node)

    return {
        "nodes": nodes,
        "parameters": parameters
    }
