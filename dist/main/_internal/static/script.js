window.projectData = window.projectData || {
    catchments: [],
    parameters: {}
};

let currentIndex = null;
let currentData = null;

//=================HYDRAULIC=====================
function openHydraulic(){
    window.location.href = "/hydraulic";
}

// ================= PARAMETERS =================
function openParams(){
    document.getElementById("paramModal").style.display = "block";

    const params = window.projectData?.parameters || {};
    document.getElementById("runoff").value    = params.runoff_coefficient || "";
    document.getElementById("manning").value   = params.manning_n          || "";
    document.getElementById("slope").value     = params.slope              || "";
    document.getElementById("frequency").value = params.design_frequency   || "";
}

function closeParams(){
    document.getElementById("paramModal").style.display = "none";
}

function saveParams(){

    const payload = new URLSearchParams();

    payload.append("runoff", document.getElementById("runoff").value);
    payload.append("manning", document.getElementById("manning").value);
    payload.append("slope", document.getElementById("slope").value);
    payload.append("frequency", document.getElementById("frequency").value);

    fetch("/save_parameters", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: payload.toString()
    })
    .then(res => res.json())
    .then(() => {
        alert("Parameters saved");
        closeParams();
        computeQ();
    });
}

// ── SLOPE MODE TOGGLE ──
function onSlopeModeChange() {
    const mode = document.querySelector('input[name="slope_mode"]:checked').value;
    document.getElementById("manualSlopePanel").style.display   = mode === "manual"   ? "block" : "none";
    document.getElementById("computedSlopePanel").style.display = mode === "computed" ? "block" : "none";
    document.getElementById("slopePreview").style.display       = "none";
}

// ── LIVE SLOPE PREVIEW ──
function updateComputedSlope() {
    const mode = document.querySelector('input[name="slope_mode"]:checked')?.value;
    if (mode !== "computed") return;

    const L  = parseFloat(document.getElementById("length").value);
    const Z1 = parseFloat(document.getElementById("z_start").value);
    const Z2 = parseFloat(document.getElementById("z_end").value);

    const preview = document.getElementById("slopePreview");

    if (!L || isNaN(Z1) || isNaN(Z2)) {
        preview.style.display = "none";
        return;
    }

    if (L <= 0) {
        preview.style.display = "block";
        document.getElementById("slopePreviewVal").textContent     = "Invalid — length must be > 0";
        document.getElementById("slopePreviewFormula").textContent  = "";
        document.getElementById("slopePreviewVal").style.color      = "#fc8181";
        return;
    }

    const dZ = Z1 - Z2;
    const S  = dZ / L;
    
    document.getElementById("slope_local").value = S;

    preview.style.display = "block";

    if (S <= 0) {
        document.getElementById("slopePreviewVal").textContent    = S.toFixed(6) + " ⚠ Adverse or flat grade";
        document.getElementById("slopePreviewVal").style.color    = "#f6ad55";
    } else {
        document.getElementById("slopePreviewVal").textContent    = S.toFixed(6);
        document.getElementById("slopePreviewVal").style.color    = "#68d391";
    }

    document.getElementById("slopePreviewFormula").textContent =
        `S = (${Z1} − ${Z2}) / ${L} = ${dZ.toFixed(4)} / ${L}`;
}


// ================= CATCHMENT =================
function addCatchment(){

    const payload = new URLSearchParams();
    const chainage = document.getElementById("chainage").value.trim();
    payload.append("name", document.getElementById("name").value);
    payload.append("description", document.getElementById("desc").value);
    payload.append("chainage", chainage);
    payload.append("area", document.getElementById("area").value);
    payload.append("length", document.getElementById("length").value);
    payload.append("z_start", document.getElementById("z_start").value);
    payload.append("z_end", document.getElementById("z_end").value);
    payload.append("slope_local", document.getElementById("slope_local").value);

    fetch("/add_catchment", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: payload.toString()
    })
    .then(res => res.json())
    .then(() => {
        alert("Catchment Added");

        document.getElementById("name").value = "";
        document.getElementById("desc").value = "";
        document.getElementById("area").value = "";
        document.getElementById("length").value = "";
        document.getElementById("slope_local").value = "";

        computeQ();
    });
}

function safeFixed(val, digits = 2){

    if(val === null || val === undefined || val === ""){
        return "-";
    }

    const num = parseFloat(val);

    return isNaN(num)
        ? "-"
        : num.toFixed(digits);
}

// ================= COMPUTE =================
function computeQ(){

    fetch("/compute_q")
    .then(res => res.json())
    .then(data => {
        window.lastComputedData = data;

        window.projectData.parameters = data.parameters;
        document.getElementById("constants").innerHTML = `
            <div class="constants-box">
                <div><strong>Runoff Coefficient (C):</strong> ${safeFixed(data.parameters.runoff_coefficient, 4)}</div>
                <div><strong>Manning's Roughness (n):</strong> ${safeFixed(data.parameters.manning_n, 4)}</div>
                <div><strong>Channel Slope (S):</strong> ${safeFixed(data.parameters.slope, 4)}</div>
                <div><strong>Design Frequency (Tr):</strong> ${safeFixed(data.parameters.design_frequency, 0)} yrs</div>
            </div>
        `;

        populateHydrologyFilterList(data.catchments);
        renderFilteredResults();

    })
    .catch(err => console.error("computeQ error:", err));
}

// Populate the filter checklist, preserving any existing check/uncheck
// state across re-fetches (e.g. after add/edit/delete), defaulting new
// catchments to checked so nothing disappears unexpectedly.
function populateHydrologyFilterList(catchments){

    const container = document.getElementById("hydrologyFilterList");
    if (!container) return;

    const hadAny = document.querySelectorAll(".hydroFilterCheck").length > 0;
    const previouslyChecked = new Set(
        Array.from(document.querySelectorAll(".hydroFilterCheck:checked")).map(cb => cb.value)
    );

    const rows = catchments.map((c, i) => {
        const isChecked = hadAny ? previouslyChecked.has(String(i)) : true;
        return `<label><input type="checkbox" class="hydroFilterCheck" value="${i}" ${isChecked ? "checked" : ""}><span>${c.name}</span></label>`;
    });

    container.innerHTML = rows.join("");

    const selectAllBox = document.getElementById("selectAllHydrologyCatchments");
    if (selectAllBox) {
        const all = document.querySelectorAll(".hydroFilterCheck");
        const checked = document.querySelectorAll(".hydroFilterCheck:checked");
        selectAllBox.checked = all.length > 0 && checked.length === all.length;
    }
}

// Render only the checked catchments into #resultTable
function renderFilteredResults(){

    const data = window.lastComputedData;
    if (!data || !data.catchments) return;

    const checkedSet = new Set(
        Array.from(document.querySelectorAll(".hydroFilterCheck:checked")).map(cb => cb.value)
    );

    const headerRow = `
    <tr>
        <th style="width: 5%;">S/N</th>
        <th style="width: 10%;">Name</th>
        <th style="width: 35%;">Description</th>
        <th style="width: 13%;">Peak Flow (m³/s)</th>
        <th style="width: 13%;">Cumul. Peak Flow (m³/s)</th>
        <th style="width: 14%;">Upstream</th>
        <th style="width: 10%;">Actions</th>
    </tr>`;

    const rows = [];

    data.catchments.forEach((c, index) => {

        if (!checkedSet.has(String(index))) return;

        let upstreamList = (c.upstream || []).map(i => i + 1).join(", ");

        rows.push(`
        <tr>
            <td>${index + 1}</td>
            <td>${c.name}</td>

            <td>
                ${c.description}

                ${(c.chainage || c.length) ? `
                    <br>
                    <small style="color:#a0aec0; font-weight:bold;">
                        ${c.chainage ? `Ch: ${c.chainage}` : ""}
                        ${c.chainage && c.length ? " | " : ""}
                        ${c.length ? `L: ${Number(c.length).toFixed(2)} m` : ""}
                    </small>
                ` : ""}

                <br>
                <small style="color:#63b3ed; font-weight:bold">
                    <b>Tc:</b> ${Number(c.tc || 0).toFixed(3)} min |
                    <b>I:</b> ${Number(c.intensity || 0).toFixed(3)} mm/hr
                </small>
            </td>

            <td>${Number(c.q_local || 0).toFixed(5)}</td>

            <td>${Number(c.q || 0).toFixed(5)}</td>

            <td>${upstreamList}</td>

            <td>
                <div class="action-container">
                    <button onclick="setUpstream(${index})" class="full-btn">
                        Set Upstream
                    </button>

                    <div class="action-row">
                        <button onclick="insertCatchmentAbove(${index})">Insert</button>
                        <button onclick="editCatchment(${index})">Edit</button>
                        <button onclick="deleteCatchment(${index})">Delete</button>
                    </div>
                </div>
            </td>
        </tr>`);
    });

    document.getElementById("resultTable").innerHTML = headerRow + rows.join("");

}

window.renderFilteredResults = renderFilteredResults;

document.addEventListener("DOMContentLoaded", function(){
    const selectAllBox = document.getElementById("selectAllHydrologyCatchments");
    if (selectAllBox) {
        selectAllBox.addEventListener("change", function(){
            document.querySelectorAll(".hydroFilterCheck").forEach(cb => {
                cb.checked = selectAllBox.checked;
            });
        });
    }
});



//================SET UPSTREAM======================
function setUpstream(index){

    fetch("/compute_q")
    .then(res => res.json())
    .then(data => {

        currentIndex = index;
        currentData = data;

        let list = document.getElementById("upstreamList");
        list.innerHTML = "";

        data.catchments.forEach((c, i) => {

            if(i === index) return; // prevent self-link

            let checked = (data.catchments[index].upstream || []).includes(i)
                ? "checked"
                : "";

            list.innerHTML += `
                <div class="upstream-item">
                    <input type="checkbox" id="up_${i}" value="${i}" ${checked}>
                    <label for="up_${i}">${c.name}</label>
                </div>`;
        });

        document.getElementById("upstreamModal").style.display = "block";
    });
}


//===============SAVE UPSTREAM==================
function saveUpstream(){

    let checkboxes = document.querySelectorAll("#upstreamList input:checked");

    const payload = new URLSearchParams();
    payload.append("index", currentIndex);

    checkboxes.forEach(cb => {
        payload.append("upstream[]", cb.value);
    });

    fetch("/set_upstream", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: payload.toString()
    })
    .then(() => {
        alert("Upstream updated");
        closeUpstream();
        computeQ();
    });
}


//================CLOSE UPSTREAM=================
function closeUpstream(){
    document.getElementById("upstreamModal").style.display = "none";
}


//===============EDIT CATCHMENT=================
function editCatchment(index){

    const chainage = document.getElementById("chainage").value.trim();

    fetch("/compute_q")
    .then(res => res.json())
    .then(data => {

        let c = data.catchments[index];

        let newName = prompt("Edit Name", c.name);
        let newDesc = prompt("Edit Description", c.description);
        let newChainage = prompt("Edit Chainage", c.chainage || "");
        let newArea = prompt("Edit Area", c.area);
        let newLength = prompt("Edit Flow Path Length (m)", c.length || 0);
        let newZStart = prompt("Edit Upper Elevation (m)", c.z_start ?? "");
        let newZEnd   = prompt("Edit Lower Elevation (m)", c.z_end ?? "");
        let newSlope  = prompt("Edit Catchment Slope", c.slope_local || 0);

        // --------------------------------------------
        // If elevations are supplied, compute slope
        // Otherwise retain manually entered slope
        // --------------------------------------------
        const hasElevations =
            newZStart !== "" &&
            newZEnd !== "" &&
            parseFloat(newLength) > 0;

        if (hasElevations) {

            newSlope =
                (
                    (parseFloat(newZStart) - parseFloat(newZEnd)) /
                    parseFloat(newLength)
                ).toFixed(4);

        }

        const payload = new URLSearchParams();

        payload.append("index", index);
        payload.append("name", newName);
        payload.append("description", newDesc);
        payload.append("chainage", newChainage);
        payload.append("area", newArea);
        payload.append("length", newLength);
        payload.append("z_start", newZStart);
        payload.append("z_end", newZEnd);
        payload.append("slope_local", newSlope);

        fetch("/edit_catchment", {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: payload.toString()
        })
        .then(() => {

            alert("Updated");

            if (!window.projectData || !window.projectData.catchments) {
                console.warn("projectData not ready — skipping sync");
                computeQ();
                return;
            }

            const c = window.projectData.catchments[index];

            if (!c) {
                console.warn("catchment index missing in projectData");
                computeQ();
                return;
            }

            // safe sync
            c.name = newName;
            c.description = newDesc;
            c.area = parseFloat(newArea) || 0;
            c.chainage = newChainage;
            c.length = parseFloat(newLength) || 0;

            if (hasElevations) {
                c.z_start = parseFloat(newZStart);
                c.z_end = parseFloat(newZEnd);
            } else {
                c.z_start = null;
                c.z_end = null;
            }

            c.slope_local = parseFloat(newSlope) || 0;

            computeQ();

        });

    });

}


//==============INSERT CATCHMENT ABOVE=================
function insertCatchmentAbove(index){

    const payload = new URLSearchParams();
    payload.append("index", index);

    fetch("/insert_catchment_above", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: payload.toString()
    })
    .then(res => res.json())
    .then(result => {

        // Refresh project data first
        fetch("/compute_q")
        .then(r => r.json())
        .then(data => {

            window.projectData = data;

            // Open the normal editor for the newly inserted catchment
            editCatchment(result.index);

        });

    });

}


//==============DELETE CATCHMENT=================
function deleteCatchment(index){

    if(!confirm("Delete this catchment?")) return;

    const payload = new URLSearchParams();
    payload.append("index", index);

    fetch("/delete_catchment", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: payload.toString()
    })
    .then(() => {
        alert("Deleted");
        computeQ();
    });
}


//=========================PRINT=========================
function printReport(){

    let project = document.title;

    let constants = document.getElementById("constants")?.innerHTML || "";
    let table = document.getElementById("resultTable")?.outerHTML || "";

    let content = `
        <html>
        <head>
            <title>${project} - Report</title>

            <style>
                body {
                    font-family: Arial;
                    padding: 20px;
                    color: black;
                }

                h1 {
                    text-align: center;
                }

                .constants-box {
                    margin-bottom: 15px;
                    padding: 10px;
                    border: 1px solid #000;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                }

                table, th, td {
                    border: 1px solid black;
                }

                th, td {
                    padding: 8px;
                    text-align: left;
                }

                @media print {
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
            </style>
        </head>

        <body>

            <h1>${project}</h1>

            <h3>Hydrological Parameters</h3>
            ${constants}

            <h3>Catchment Results</h3>
            ${table}

        </body>
        </html>
    `;

    // =============================
    // SAFE PRINT ENGINE (PYWEBVIEW COMPATIBLE)
    // =============================
    const iframe = document.createElement("iframe");

    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;

    doc.open();
    doc.write(content);
    doc.close();

    // IMPORTANT: wait for render before printing
    setTimeout(() => {

        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (err) {
            console.error("Print failed:", err);
        }

        // cleanup (prevents memory leaks in long sessions)
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);

    }, 300);
}