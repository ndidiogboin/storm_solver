# idf_engine.py

import os
import sys
import json


def get_base_path():
    if hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))


BASE_PATH = get_base_path()
BUILTIN_IDF_PATH = os.path.join(BASE_PATH, "data", "idf.json")

if not os.path.exists(BUILTIN_IDF_PATH):
    raise FileNotFoundError(f"Built-in IDF file not found at: {BUILTIN_IDF_PATH}")

with open(BUILTIN_IDF_PATH, "r") as f:
    BUILTIN_IDF_DATA = json.load(f)


def get_projects_dir():
    return os.path.join(os.path.expanduser("~"), "Documents", "Storm Solver", "projects")


def load_project_idf(project_name, idf_source):
    """Load a user-uploaded IDF dataset from the project folder."""
    path = os.path.join(get_projects_dir(), project_name, f"idf_{idf_source}.json")
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def get_intensity(tc, tr, project_name=None, idf_source="builtin"):
    """
    tc          = time of concentration (minutes)
    tr          = return period (years)
    project_name = current project (needed for uploaded sources)
    idf_source  = "builtin" or the name of an uploaded dataset
    """

    # --- LOAD CORRECT IDF DATA ---
    if idf_source == "builtin" or not project_name:
        data = BUILTIN_IDF_DATA
    else:
        data = load_project_idf(project_name, idf_source)
        if data is None:
            # fallback to builtin if file missing
            data = BUILTIN_IDF_DATA

    tr_key = str(int(float(tr)))

    if tr_key not in data:
        return None

    table = data[tr_key]
    durations = sorted([int(k) for k in table.keys()])
    tc = float(tc)

    if tc <= durations[0]:
        return table[str(durations[0])]

    if tc >= durations[-1]:
        return table[str(durations[-1])]

    for i in range(len(durations) - 1):
        t1, t2 = durations[i], durations[i + 1]
        if t1 <= tc <= t2:
            I1 = table[str(t1)]
            I2 = table[str(t2)]
            return I1 + (I2 - I1) * (tc - t1) / (t2 - t1)

    return None


def list_idf_sources(project_name):
    """
    Returns all available IDF sources for a project:
    always includes builtin, plus any uploaded datasets.
    """
    sources = [{
        "name": "builtin",
        "label": "Built-in (Default)",
        "type": "builtin"
    }]

    project_dir = os.path.join(get_projects_dir(), project_name)
    if os.path.exists(project_dir):
        for f in os.listdir(project_dir):
            if f.startswith("idf_") and f.endswith(".json"):
                name = f[4:-5]  # strip "idf_" prefix and ".json" suffix
                sources.append({
                    "name": name,
                    "label": name.replace("_", " "),
                    "type": "uploaded"
                })

    return sources


def save_uploaded_idf(project_name, dataset_name, idf_dict):
    """
    Saves a parsed IDF dataset to the project folder.
    idf_dict must be in the standard format:
    { "2": {"5": 45.2, "10": 38.4, ...}, "5": {...}, ... }
    """
    project_dir = os.path.join(get_projects_dir(), project_name)
    os.makedirs(project_dir, exist_ok=True)
    path = os.path.join(project_dir, f"idf_{dataset_name}.json")
    with open(path, "w") as f:
        json.dump(idf_dict, f, indent=4)
    return path


def delete_uploaded_idf(project_name, dataset_name):
    """Deletes an uploaded IDF dataset from the project folder."""
    path = os.path.join(get_projects_dir(), project_name, f"idf_{dataset_name}.json")
    if os.path.exists(path):
        os.remove(path)
        return True
    return False
