import os
import json
from threading import Lock

project_lock = Lock()

PROJECTS_DIR = os.path.join(
    os.path.expanduser("~"),
    "Documents",
    "Storm Solver",
    "projects"
)

os.makedirs(PROJECTS_DIR, exist_ok=True)


def get_projects():
    return [name for name in os.listdir(PROJECTS_DIR)
            if os.path.isdir(os.path.join(PROJECTS_DIR, name))]


def create_project(name):
    path = os.path.join(PROJECTS_DIR, name)
    os.makedirs(path, exist_ok=True)

    data = {
    "parameters": {
        "runoff_coefficient": 0,
        "manning_n": 0,
        "slope": 0,
        "design_frequency": 0
    },

    "title_block": {
        "project_title": "",
        "client": "",
        "consultant": "",
        "design_codes": "",
        "reference_no": "",
        "date": "",
        "designed_by": "",
        "checked_by": "",
        "approved_by": ""
    },
    
    "idf_source": "builtin",

    "catchments": []
}

    save_project(name, data)


def rename_project(old_name, new_name):
    old_path = os.path.join(PROJECTS_DIR, old_name)
    new_path = os.path.join(PROJECTS_DIR, new_name)

    if not os.path.exists(old_path):
        return False

    if os.path.exists(new_path):
        return False

    os.rename(old_path, new_path)
    return True


def update_title_block(name, title_block):
    data = load_project(name)
    if not data:
        return None

    data["title_block"] = title_block
    save_project(name, data)
    return data


def load_project(name):
    path = os.path.join(PROJECTS_DIR, name, "data.json")
    if not os.path.exists(path):
        return None

    with open(path, "r") as f:
        return json.load(f)


def save_project(name, data):
    import math

    path = os.path.join(PROJECTS_DIR, name, "data.json")
    tmp = path + ".tmp"

    clean = json.loads(
        json.dumps(
            data,
            default=lambda x: 0 if isinstance(x, float) and (math.isnan(x) or math.isinf(x)) else x
        )
    )

    with project_lock:
        with open(tmp, "w") as f:
            json.dump(clean, f, indent=4)

        os.replace(tmp, path)


def open_projects_folder():
    if os.path.exists(PROJECTS_DIR):
        os.startfile(PROJECTS_DIR)
        return True
    return False   