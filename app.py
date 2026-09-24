from flask import Flask, render_template, request, redirect, url_for, jsonify
from flask import send_from_directory
from project_manager import *
from werkzeug.utils import secure_filename
from idf_engine import get_intensity, list_idf_sources, save_uploaded_idf, delete_uploaded_idf
from modeling.hydrograph import generate_hydrograph
from modeling.services.visualization_service import get_visualization
from simulation.services.simulation_service import get_simulation
from modeling.services.storm_service import get_storm_simulation
import project_manager as pm
import json
import os
import sys

app = Flask(__name__)

current_project = None

def resource_path(relative_path):
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)


@app.route("/")
def home():
    projects = get_projects()
    return render_template("home.html", projects=projects)


@app.route("/open_projects_folder")
def open_projects_folder_route():
    open_projects_folder()
    return redirect(url_for("home"))


@app.route("/new_project", methods=["POST"])
def new_project():
    name = request.form["project_name"]
    create_project(name)
    return redirect(url_for("open_project", name=name))


@app.route("/rename_project", methods=["POST"])
def rename_project_route():
    old_name = request.form["old_name"]
    new_name = request.form["new_name"].strip()

    if new_name and new_name != old_name:
        rename_project(old_name, new_name)

    return redirect(url_for("home"))


@app.route("/open/<name>")
def open_project(name):
    global current_project
    current_project = name
    data = load_project(name)
    return render_template("workspace.html", project=name, data=data)

@app.route("/rainfall_manager")
def rainfall_manager():
    global current_project
    data = load_project(current_project)
    return render_template("rainfall_manager.html", project=current_project, data=data)


@app.route("/api/idf/sources")
def idf_sources():
    global current_project
    data = load_project(current_project)
    sources  = list_idf_sources(current_project)
    active   = data.get("idf_source", "builtin")
    return jsonify({"sources": sources, "active": active})


@app.route("/api/idf/set_source", methods=["POST"])
def set_idf_source():
    global current_project
    data   = load_project(current_project)
    source = request.json.get("source", "builtin")
    data["idf_source"] = source
    save_project(current_project, data)
    return jsonify({"status": "ok", "active": source})


@app.route("/api/idf/upload", methods=["POST"])
def upload_idf():
    global current_project

    file         = request.files.get("file")
    dataset_name = request.form.get("name", "").strip().replace(" ", "_")

    if not file or not dataset_name:
        return jsonify({"error": "File and name are required"}), 400

    filename = file.filename.lower()

    try:
        idf_dict = {}

        # ── CSV ──
        if filename.endswith(".csv"):
            import csv, io
            content  = file.read().decode("utf-8")
            reader   = csv.reader(io.StringIO(content))
            rows     = list(reader)
            headers  = rows[0][1:]   # return periods
            for row in rows[1:]:
                duration = str(int(float(row[0])))
                for j, rp in enumerate(headers):
                    rp_key = str(int(float(rp)))
                    if rp_key not in idf_dict:
                        idf_dict[rp_key] = {}
                    idf_dict[rp_key][duration] = float(row[j + 1])

        # ── XLSX ──
        elif filename.endswith(".xlsx"):
            import openpyxl, io
            wb   = openpyxl.load_workbook(io.BytesIO(file.read()))
            ws   = wb.active
            rows = list(ws.iter_rows(values_only=True))
            headers = rows[0][1:]
            for row in rows[1:]:
                duration = str(int(float(row[0])))
                for j, rp in enumerate(headers):
                    rp_key = str(int(float(rp)))
                    if rp_key not in idf_dict:
                        idf_dict[rp_key] = {}
                    idf_dict[rp_key][duration] = float(row[j + 1])

        # ── JSON ──
        elif filename.endswith(".json"):
            import io
            content  = file.read().decode("utf-8")
            idf_dict = json.loads(content)

        else:
            return jsonify({"error": "Unsupported file format"}), 400

        save_uploaded_idf(current_project, dataset_name, idf_dict)
        sources = list_idf_sources(current_project)
        return jsonify({"status": "uploaded", "name": dataset_name, "sources": sources})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/idf/delete", methods=["POST"])
def delete_idf():
    global current_project
    data         = load_project(current_project)
    dataset_name = request.json.get("name")

    if not dataset_name or dataset_name == "builtin":
        return jsonify({"error": "Cannot delete built-in dataset"}), 400

    deleted = delete_uploaded_idf(current_project, dataset_name)

    # if deleted source was active, revert to builtin
    if deleted and data.get("idf_source") == dataset_name:
        data["idf_source"] = "builtin"
        save_project(current_project, data)

    sources = list_idf_sources(current_project)
    return jsonify({"status": "deleted", "sources": sources})


@app.route("/api/idf/preview", methods=["POST"])
def preview_idf():
    """Parse and return IDF data for preview before saving."""
    global current_project

    file     = request.files.get("file")
    filename = file.filename.lower()

    try:
        idf_dict = {}

        if filename.endswith(".csv"):
            import csv, io
            content  = file.read().decode("utf-8")
            reader   = csv.reader(io.StringIO(content))
            rows     = list(reader)
            headers  = rows[0][1:]
            durations = [str(int(float(r[0]))) for r in rows[1:]]
            return_periods = [str(int(float(h))) for h in headers]
            table = []
            for row in rows[1:]:
                table.append([float(v) for v in row[1:]])
            return jsonify({"durations": durations, "return_periods": return_periods, "table": table})

        elif filename.endswith(".xlsx"):
            import openpyxl, io
            wb   = openpyxl.load_workbook(io.BytesIO(file.read()))
            ws   = wb.active
            rows = list(ws.iter_rows(values_only=True))
            headers   = rows[0][1:]
            durations = [str(int(float(r[0]))) for r in rows[1:]]
            return_periods = [str(int(float(h))) for h in headers]
            table = []
            for row in rows[1:]:
                table.append([float(v) for v in row[1:]])
            return jsonify({"durations": durations, "return_periods": return_periods, "table": table})

        elif filename.endswith(".json"):
            import io
            content  = file.read().decode("utf-8")
            idf_dict = json.loads(content)
            return_periods = sorted(idf_dict.keys(), key=lambda x: int(x))
            durations = sorted(idf_dict[return_periods[0]].keys(), key=lambda x: int(x))
            table = []
            for d in durations:
                table.append([idf_dict[rp].get(d, 0) for rp in return_periods])
            return jsonify({"durations": durations, "return_periods": return_periods, "table": table})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    


@app.route("/api/idf/source_data")
def idf_source_data():
    """Returns parsed preview data for any saved IDF source (builtin or uploaded)."""
    global current_project

    name = request.args.get("name", "builtin")

    if name == "builtin":
        from idf_engine import BUILTIN_IDF_DATA
        idf_dict = BUILTIN_IDF_DATA
    else:
        from idf_engine import load_project_idf
        idf_dict = load_project_idf(current_project, name)
        if not idf_dict:
            return jsonify({"error": "Dataset not found"}), 404

    try:
        return_periods = sorted(idf_dict.keys(), key=lambda x: int(x))
        durations      = sorted(idf_dict[return_periods[0]].keys(), key=lambda x: int(x))
        table = []
        for d in durations:
            table.append([idf_dict[rp].get(d, 0) for rp in return_periods])

        return jsonify({
            "return_periods": return_periods,
            "durations":      durations,
            "table":          table
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# DELETE PROJECT
import os
import shutil

@app.route("/delete_project/<name>")
def delete_project(name):

    path = os.path.join(PROJECTS_DIR, name)

    if os.path.exists(path):
        shutil.rmtree(path)

    return redirect(url_for("home"))


# SAVE PARAMETERS
@app.route("/save_parameters", methods=["POST"])
def save_parameters():
    global current_project
    data = load_project(current_project)

    params = data.get("parameters", {})

    params["runoff_coefficient"] = float(request.form["runoff"])
    params["manning_n"] = float(request.form["manning"])
    params["slope"] = float(request.form["slope"])
    params["design_frequency"] = float(
        request.form.get("frequency", 0)
    )

    data["parameters"] = params

    save_project(current_project, data)
    return jsonify({"status": "success"})


@app.route("/api/hydrograph/<int:index>")
def hydrograph(index):
    global current_project

    data = load_project(current_project)
    c = data["catchments"][index]

    Qp = c.get("q", 0)
    Tc = c.get("tc", 5)

    result = generate_hydrograph(Qp, Tc)

    return jsonify(result)

@app.route("/modeling")
def modeling():
    global current_project
    data = load_project(current_project)
    return render_template("modeling.html", project=current_project, data=data)

@app.route("/api/visualization/<mode>/<int:index>")
def visualization(mode, index):

    data = load_project(current_project)

    result = get_visualization(mode, data, index)

    return jsonify(result)

@app.route("/api/title-block/<project>", methods=["POST"])
def save_title_block(project):
    data = request.json
    updated = pm.update_title_block(project, data)
    return jsonify({"status": "ok", "data": updated})


@app.route("/api/upload-logo/<project>/<logo_type>", methods=["POST"])
def upload_logo(project, logo_type):

    if logo_type not in ["client", "consultant"]:
        return jsonify({
            "status": "error",
            "message": "Invalid logo type"
        }), 400

    if "logo" not in request.files:
        return jsonify({
            "status": "error",
            "message": "No file uploaded"
        }), 400

    file = request.files["logo"]

    if file.filename == "":
        return jsonify({
            "status": "error",
            "message": "No file selected"
        }), 400

    data = load_project(project)

    if not data:
        return jsonify({
            "status": "error",
            "message": "Project not found"
        }), 404

    # -----------------------------------
    # Assets/Logos folder
    # -----------------------------------

    logos_folder = os.path.join(
        PROJECTS_DIR,
        project,
        "Assets",
        "Logos"
    )

    os.makedirs(logos_folder, exist_ok=True)

    ext = os.path.splitext(
        secure_filename(file.filename)
    )[1]

    filename = f"{logo_type}_logo{ext}"

    save_path = os.path.join(
        logos_folder,
        filename
    )

    file.save(save_path)

    # -----------------------------------
    # Store relative path
    # -----------------------------------

    relative_path = f"Assets/Logos/{filename}"

    title_block = data.get("title_block", {})

    title_block[f"{logo_type}_logo"] = relative_path

    data["title_block"] = title_block

    save_project(project, data)

    return jsonify({
        "status": "ok",
        "path": relative_path
    })


@app.route("/project-assets/<project>/<path:filename>")
def project_assets(project, filename):

    project_folder = os.path.join(
        PROJECTS_DIR, 
        project
    )

    return send_from_directory(
        project_folder, 
        filename
    )

# HYDRAULIC DESIGN
@app.route("/hydraulic")
def hydraulic():
    global current_project
    data = load_project(current_project)
    return render_template("hydraulic.html", project=current_project, data=data)

@app.route("/save_hydraulic_batch", methods=["POST"])
def save_hydraulic_batch():

    global current_project

    data = load_project(current_project)

    items = request.get_json()

    if not items:
        return jsonify({"error": "No hydraulic results supplied"}), 400

    for item in items:

        index = int(item["index"])

        data["catchments"][index]["hydraulic_design"] = {
            "section": item["section"],
            "result": item["result"]
        }

    save_project(current_project, data)

    return jsonify({"status": "ok"})

@app.route("/hydraulic_compute", methods=["POST"])
def hydraulic_compute():
    global current_project

    data = load_project(current_project)

    payload = request.get_json()

    index = int(payload["index"])
    section = payload["section"]      # rectangular / trapezoidal
    mode = payload["mode"]           # check / design

    c = data["catchments"][index]

    Q = c.get("q", 0)

    if Q <= 0:
        return jsonify({
            "error": "Hydrology has not been computed. Please run Compute Q first."
        }), 400
    
    C = data["parameters"]["runoff_coefficient"]
    n = data["parameters"]["manning_n"]
    S_design  = data["parameters"]["slope"]
    S_actual  = c.get("slope_local", 0)

    # if actual slope is less than design slope, use design slope
    if S_actual > 0 and S_actual >= S_design:
        S = S_actual
    elif S_actual > 0 and S_actual < S_design:
        S = S_design
        S_actual = S_design  # adopted minimum — report as design slope
    else:
        S = S_design
        S_actual = 0  # not set — report as Not Set
        
    # STANDARD DEPTHS (ENGINEERING SET)
    standard_depths = [0.60, 0.75, 0.90, 1.20, 1.50, 1.80, 2.00, 2.20, 2.40, 2.75, 3.00, 3.20, 3.60, 4.20, 4.50]

    result = {}

    def manning(A, R):
        return (1/n) * (A * (R ** (2/3)) * (S ** 0.5))

    # ---------------- RECTANGULAR ----------------
    if section == "rectangular":

        if mode == "check":
            b = float(payload["b"])
            d = float(payload["d"])

        else:
            b = float(payload["b"])

            # DESIGN MODE → find best depth
            d = None
            for depth in standard_depths:
                A = b * depth
                P = b + 2 * depth
                R = A / P
                Qcap = manning(A, R)
                Q_lim = Qcap * 0.85

                if Q_lim >= Q:
                    d = depth
                    break

            if d is None:
                d = max(standard_depths)

        A = b * d
        P = b + 2 * d
        R = A / P
        Qcap = manning(A, R)
        Q_lim = Qcap * 0.85

        V = Q_lim / A if A > 0 else 0 

        result = {
            "type": "Rectangular",
            "b": b,
            "d": d,
            "V": V,
            "A": A,
            "P": P,
            "R": R,
            "Qcap": Qcap,
            "Q_lim": Q_lim,
            "Q": Q,
            "ok": Q_lim >= Q and (V >= 0.6),
            "slope_local": S_actual
        }

    # ---------------- TRAPEZOIDAL ----------------
    else:

        if mode == "check":
            b = float(payload["b"])   # top width
            d = float(payload["d"])
            a = float(payload["a"])   # bottom width

        else:
            b = float(payload["b"])   # top width
            a = float(payload["a"])   # bottom width

            d = None

            for depth in standard_depths:

                A = ((b + a) / 2) * depth
                P = a + 2 * ((depth**2 + ((b - a)/2)**2) ** 0.5)
                R = A / P
                Qcap = manning(A, R)
                Q_lim = Qcap * 0.85

                if Q_lim >= Q:
                    d = depth
                    break

            # fallback if none works
            if d is None:
                d = max(standard_depths)

        # ✅ FINAL COMPUTATION (FOR BOTH MODES)
        A = ((b + a) / 2) * d
        P = a + 2 * ((d**2 + ((b - a)/2)**2) ** 0.5)
        R = A / P
        Qcap = manning(A, R)
        Q_lim = Qcap * 0.85
        V = Q_lim / A if A > 0 else 0

        result = {
            "type": "Trapezoidal",
            "a": a,
            "b": b,
            "d": d,
            "V": V,
            "A": A,
            "P": P,
            "R": R,
            "Qcap": Qcap,
            "Q_lim": Q_lim,
            "Q": Q,
            "ok": (Q_lim >= Q) and (V >= 0.6),
            "slope_local": S_actual
        }

    # =========================
    # RETURN RESPONSE
    # =========================
    return jsonify({
        "index": index,
        "section": section,

        "catchment": c["name"],
        "description": c["description"],
        "area": c["area"],
        "tc": c["tc"],
        "intensity": c.get("intensity", "-"),
        "chainage": c.get("chainage", ""),

        "result": result,

        "parameters": data["parameters"]
    })

# ADD CATCHMENT
@app.route("/add_catchment", methods=["POST"])
def add_catchment():
    global current_project
    data = load_project(current_project)

    form = request.form

    name = form.get("name")
    description = form.get("description")
    area = form.get("area")

    # 🔒 HARD VALIDATION (prevents undefined issues)
    if not name:
        name = "Unnamed Catchment"

    if not description:
        description = ""

    if not area:
        area = 0
    else:
        area = float(area)

    catchment = {
        "name": request.form.get("name", ""),
        "description": request.form.get("description", ""),
        "chainage": request.form.get("chainage", ""),
        "area": float(request.form.get("area", 0)),

        # HYDROLOGY ENGINE FIELDS
        "length": float(request.form.get("length") or 0),        
        "slope_local": float(request.form.get("slope_local") or 0),  
        "z_start":     float(request.form.get("z_start")) if request.form.get("z_start") else None,
        "z_end":       float(request.form.get("z_end"))   if request.form.get("z_end")   else None,

        "tc": float(request.form.get("tc", 0)),
        "q": 0,        
        "upstream": []
    }

    data["catchments"].append(catchment)
    save_project(current_project, data)

    return jsonify({"status": "added", "catchment": catchment})


# ==============SET UPSTREAM CONNECTION==================
@app.route("/set_upstream", methods=["POST"])
def set_upstream():
    global current_project
    data = load_project(current_project)

    index = int(request.form["index"])
    upstream = request.form.getlist("upstream[]")

    # convert to int
    data["catchments"][index]["upstream"] = [int(i) for i in upstream]

    save_project(current_project, data)

    return jsonify({"status": "updated"})

# EDIT CATCHMENT
@app.route("/edit_catchment", methods=["POST"])
def edit_catchment():
    global current_project
    data = load_project(current_project)

    index = int(request.form["index"])
    c = data["catchments"][index]

    c["name"]         = request.form.get("name", "")
    c["description"]  = request.form.get("description", "")
    c["chainage"]     = request.form.get("chainage", "").strip()   # string

    c["area"]         = float(request.form.get("area") or 0)
    c["length"]       = float(request.form.get("length") or 0)
    c["slope_local"]  = float(request.form.get("slope_local") or 0)

    c["z_start"]      = float(request.form.get("z_start")) if request.form.get("z_start") else None
    c["z_end"]        = float(request.form.get("z_end")) if request.form.get("z_end") else None

    save_project(current_project, data)

    # 🔥 IMPORTANT: RECOMPUTE FLOW AFTER EDIT
    return compute_q()

# DELETE CATCHMENT
@app.route("/delete_catchment", methods=["POST"])
def delete_catchment():
    global current_project
    data = load_project(current_project)

    index = int(request.form["index"])

    # remove the catchment
    data["catchments"].pop(index)

    # 🔧 fix upstream indices after deletion
    for c in data["catchments"]:
        new_upstream = []
        for up in c.get("upstream", []):
            if up == index:
                continue  # remove deleted reference
            elif up > index:
                new_upstream.append(up - 1)  # shift index
            else:
                new_upstream.append(up)
        c["upstream"] = new_upstream

    save_project(current_project, data)

    return jsonify({"status": "deleted"})


# INSERT CATCHMENT ABOVE
@app.route("/insert_catchment_above", methods=["POST"])
def insert_catchment_above():
    global current_project

    data = load_project(current_project)

    form = request.form
    index = int(form.get("index", 0))

    catchment = {
        "name": form.get("name", "New Catchment"),
        "description": form.get("description", ""),
        "chainage": form.get("chainage", ""),
        "area": float(form.get("area") or 0),

        # HYDROLOGY ENGINE FIELDS
        "length": float(form.get("length") or 0),
        "slope_local": float(form.get("slope_local") or 0),
        "z_start": float(form.get("z_start")) if form.get("z_start") else None,
        "z_end": float(form.get("z_end")) if form.get("z_end") else None,

        "tc": 0,
        "q": 0,
        "upstream": []
    }

    # Insert before the selected catchment
    data["catchments"].insert(index, catchment)

    # Shift upstream references after insertion
    for i, c in enumerate(data["catchments"]):

        if i == index:
            continue

        c["upstream"] = [
            up + 1 if up >= index else up
            for up in c.get("upstream", [])
        ]

    save_project(current_project, data)

    return jsonify({
        "status": "inserted",
        "index": index,
        "catchment": catchment
    })

# COMPUTE PEAK FLOW
@app.route("/compute_q")
def compute_q():

    global current_project
    data = load_project(current_project)

    catchments = data["catchments"]

    tr = data["parameters"]["design_frequency"]
    C = data["parameters"]["runoff_coefficient"]

    # =========================
    # CLEAN INVALID UPSTREAMS
    # =========================
    for c in catchments:

        c["upstream"] = [
            up for up in c.get("upstream", [])
            if 0 <= up < len(catchments)
        ]

    # =========================
    # ROUTING: TOTAL Tc
    # =========================
    def compute_tc(index, visited=None):

        if visited is None:
            visited = set()

        if index in visited:
            return 0

        visited.add(index)

        c = catchments[index]

        L = c.get("length", 0)
        S_channel = c.get("slope_local", 0)

        upstream_list = [
            up for up in c.get("upstream", [])
            if 0 <= up < len(catchments)
        ]

        # HEADWATER
        if not upstream_list:
            return 20.0
        
        upstream_tcs = [compute_tc(up, visited.copy()) for up in upstream_list]

        # Channel travel time (minutes)
        if L > 0 and S_channel > 0:
            travel_time = 0.0195 * (L ** 0.77) * (S_channel ** -0.385)
        else:
            travel_time = 0

        return max(upstream_tcs) + travel_time


    # =========================
    # FINAL Tc + INTENSITY + LOCAL Q
    # =========================
    for i in range(len(catchments)):

        tc_final = compute_tc(i)

        tc_final = max(tc_final, 5)
        tc_final = min(tc_final, 360)

        catchments[i]["tc"] = round(tc_final, 2)

        idf_source = data.get("idf_source", "builtin")
        I = get_intensity(tc_final, tr, current_project, idf_source)

        if I is None:
            return jsonify({
                "error": f"No IDF data for Tc={tc_final:.2f} min and Tr={tr}"
            })

        catchments[i]["intensity"] = round(I, 2)

        A = catchments[i]["area"]
        q_local = (C * I * A) / (3600 * 1000)

        catchments[i]["q_local"] = round(q_local, 5)


    # =========================
    # RECURSIVE FLOW ROUTING
    # =========================
    def compute_total(index, visited=None):

        if visited is None:
            visited = set()

        if index in visited:
            return 0

        visited.add(index)

        c = catchments[index]

        total = c["q_local"]

        for up in c.get("upstream", []):
            if 0 <= up < len(catchments):
                total += compute_total(up, visited)

        return total


    # =========================
    # FINAL CUMULATIVE Q
    # =========================
    for i in range(len(catchments)):

        catchments[i]["q"] = round(compute_total(i), 5)

    save_project(current_project, data)

    return jsonify(data)



@app.route("/simulation")
def simulation():
    global current_project
    data = load_project(current_project)
    return render_template("simulation.html", project=current_project, data=data)


@app.route("/api/simulation/<mode>")
def simulation_api(mode):
    global current_project
    data = load_project(current_project)
 
    # Optional ?catchments=0,2,4 query param — selects which catchments
    # appear in the OUTPUT (computation still runs on the full set so
    # upstream flow accumulation stays correct; see simulation_service.py)
    selected = None
    catchments_param = request.args.get("catchments")
    if catchments_param:
        try:
            selected = [int(x) for x in catchments_param.split(",") if x.strip() != ""]
        except ValueError:
            return jsonify({"error": "Invalid 'catchments' query parameter"}), 400
 
    result = get_simulation(mode, data, selected=selected)
    return jsonify(result)


@app.route("/storm_simulation")
def storm_simulation():
    global current_project
    data = load_project(current_project)
    return render_template("storm_simulation.html", project=current_project, data=data)


@app.route("/api/storm/<mode>", methods=["POST"])
def storm_api(mode):
    global current_project

    data    = load_project(current_project)
    payload = request.get_json()

    index       = int(payload.get("index", 0))
    intensity   = float(payload.get("intensity", 0))
    Tc_override = payload.get("tc_override", None)
    C_override  = payload.get("c_override", None)

    catchment = data["catchments"][index] if data["catchments"] else {}

    # for multi-storm mode, load the active IDF data
    idf_data = None
    if mode == "multi":
        idf_source = data.get("idf_source", "builtin")
        from idf_engine import BUILTIN_IDF_DATA, load_project_idf
        if idf_source == "builtin":
            idf_data = BUILTIN_IDF_DATA
        else:
            idf_data = load_project_idf(current_project, idf_source) or BUILTIN_IDF_DATA

    result = get_storm_simulation(
        mode, catchment, intensity,
        Tc_override=Tc_override,
        C_override=C_override,
        idf_data=idf_data
    )

    return jsonify(result)


@app.route("/api/storm/idf_intensity", methods=["POST"])
def storm_idf_intensity():
    """
    Looks up intensity from the active IDF source for a given Tc and return period.
    Called by the frontend when the engineer changes return period or Tc slider.
    """
    global current_project

    data    = load_project(current_project)
    payload = request.get_json()

    tc = float(payload.get("tc", 5))
    tr = float(payload.get("tr", 2))

    idf_source = data.get("idf_source", "builtin")
    I = get_intensity(tc, tr, current_project, idf_source)

    if I is None:
        return jsonify({"error": f"No IDF data for Tc={tc} min, Tr={tr} yr"}), 400

    return jsonify({"intensity": round(I, 2), "tc": tc, "tr": tr})


@app.route("/api/storm/idf_return_periods")
def storm_return_periods():
    """Returns available return periods from the active IDF source."""
    global current_project

    data       = load_project(current_project)
    idf_source = data.get("idf_source", "builtin")

    from idf_engine import BUILTIN_IDF_DATA, load_project_idf
    if idf_source == "builtin":
        idf_data = BUILTIN_IDF_DATA
    else:
        idf_data = load_project_idf(current_project, idf_source) or BUILTIN_IDF_DATA

    return_periods = sorted(idf_data.keys(), key=lambda x: int(x))
    return jsonify({"return_periods": return_periods, "idf_source": idf_source})


@app.route("/reports")
def reports():
    global current_project

    data = load_project(current_project)

    return render_template(
        "reports.html",
        project=current_project,
        data=data
    )



if __name__ == "__main__":
    app.run(debug=False)