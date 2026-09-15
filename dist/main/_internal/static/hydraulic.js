let hydraulicBatchResults = [];
let hydraulicRunning = false;

// =============================
// SAFE FORMATTER
// =============================
function safeFixed(val, digits = 2){
    return (typeof val === "number" && !isNaN(val))
        ? val.toFixed(digits)
        : "-";
}


// =============================
// BUTTON ENTRY
// =============================
async function runSelectedHydraulic(){

    if(hydraulicRunning){
        alert("Hydraulic computation is already running...");
        return;
    }

    hydraulicRunning = true;

    const btn = document.querySelector(".design-btn");

    if(btn){
        btn.disabled = true;
        btn.textContent = "Designing...";
    }

    try{

        const mode = document.querySelector('input[name="hyd_mode"]:checked')?.value;

        // =============================
        // SINGLE MODE
        // =============================
        if(mode === "single"){

            const select = document.getElementById("catchmentSelect");

            if (!select || select.value === "") {
                alert("Please select a catchment");
                return;
            }

            await runHydraulic(select.value);
        }

        // =============================
        // MULTI MODE
        // =============================
        else{

            const checks = document.querySelectorAll(".multiCheck:checked");

            if(checks.length === 0){
                alert("Select at least one catchment");
                return;
            }

            const indices = Array.from(checks).map(c => c.value);

            console.log("Batch Hydraulic Running for:", indices);

            await runBatchHydraulic(indices);
        }

    }
    finally{

        hydraulicRunning = false;

        if(btn){
            btn.disabled = false;
            btn.textContent = "Design Channel";
        }

    }

}

async function runBatchHydraulic(indices){

    if (!window.projectData?.catchments){
        alert("No project data available");
        return;
    }

    // Clear table once
    document.getElementById("designTable").innerHTML = "";

    // Clear batch results
    hydraulicBatchResults = [];

    for(const index of indices){

        console.log("Processing catchment:", index);

        await runHydraulic(index);

    }

    // Save everything ONCE
    const res = await fetch("/save_hydraulic_batch",{
        method:"POST",
        headers:{
            "Content-Type":"application/json"
        },
        body:JSON.stringify(hydraulicBatchResults)
    });

    if(!res.ok){
        alert("Batch save failed.");
        return;
    }

    hydraulicBatchResults = [];

    console.log("Batch Hydraulic Completed");
}


// =============================
// MAIN REQUEST FUNCTION
// =============================
async function runHydraulic(index){

    const sectionEl = document.querySelector('input[name="section"]:checked');
    const modeEl = document.querySelector('input[name="mode"]:checked');

    if (!sectionEl || !modeEl) {
        alert("Select section type and mode");
        return;
    }

    const payload = {
        index,
        section: sectionEl.value,
        mode: modeEl.value,
        b: parseFloat(document.getElementById("b").value) || 0
    };

    if (sectionEl.value === "rectangular" && modeEl.value === "check") {
        payload.d = parseFloat(document.getElementById("d").value) || 0;
    }

    if (sectionEl.value === "trapezoidal") {
        payload.d = parseFloat(document.getElementById("d").value) || 0;
        payload.a = parseFloat(document.getElementById("a").value) || 0;
    }


    try{

        const res = await fetch("/hydraulic_compute",{
            method:"POST",
            headers:{
                "Content-Type":"application/json"
            },
            body:JSON.stringify(payload)
        });

        if(!res.ok){
            console.warn("Server responded with:",res.status);
            return;
        }

        const data = await res.json();

        if(!data || !data.result){
            console.warn("Invalid response");
            return;
        }

        data.catchment = data.catchment || "Unknown";
        data.description = data.description || "";
        data.parameters = data.parameters || window.projectData?.parameters || {};

        const srcCatchment = window.projectData?.catchments?.[data.index];
        data.chainage = data.chainage ?? srcCatchment?.chainage;
        data.length   = data.length   ?? srcCatchment?.length;

        renderHydraulicTable(data);

        if(document.querySelector('input[name="hyd_mode"]:checked')?.value === "single"){
            hydraulicBatchResults = [];
        }

        hydraulicBatchResults.push({
            index:data.index,
            section:data.section,
            result:data.result
        });

        // Save immediately when running a single catchment
        if (document.querySelector('input[name="hyd_mode"]:checked')?.value === "single") {

            const saveRes = await fetch("/save_hydraulic_batch", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(hydraulicBatchResults)
            });

            if (!saveRes.ok) {
                alert("Save failed.");
                return;
            }

            hydraulicBatchResults = [];

            console.log("Single Hydraulic Design Saved");
        }

    }
    catch(err){

        console.error(err);

    }
}

// =============================
// RENDER TABLE
// =============================
function renderHydraulicTable(data){

    if (!data || !data.result) {
        document.getElementById("designTable").innerHTML =
            "<tr><td colspan='4'>Invalid data</td></tr>";
        return;
    }

    const r = data.result;
    
    const area = data.area;

    const validation = r.ok
        ? "Section OK (Safe Design)"
        : "Section NOT OK (Redesign Required)";

    const type = (r.type || "").toLowerCase();

    // =============================
    // DESIGN INTELLIGENCE (CLEAN)
    // =============================
    const ratio = (r.Q_lim && r.Q) ? (r.Q_lim / r.Q) : 0;

    let designStatus;
    if (ratio <= 1) {
        designStatus = `Section Is <span style="color:#dc2626;font-weight:bold;">NOT OKAY</span> And Design Is Inefficient (Undersized)`;
    } else if (ratio > 4.0) {
        designStatus = `Section Is <span style="color:#16a34a;font-weight:bold;">OKAY</span> But Design Is <span style="color:#dc2626;font-weight:bold;">NOT Economical</span> (Oversized)`;
    } else {
        designStatus = `Section Is <span style="color:#16a34a;font-weight:bold;">OKAY</span> And Design Is Efficient`;
    }

    //SELF CLEANSING CHECK
    const Vmin = 0.6;

    const selfClean = (r.V && r.V >= Vmin)
        ? `Self Cleansing <span style="color:#16a34a;font-weight:bold;">OKAY</span>`
        : `Self Cleansing <span style="color:#dc2626;font-weight:bold;">NOT OKAY</span>`;


    // ENGINEERING WARNING
    let warnings = [];

    if (r.V && r.V < 0.6)
        warnings.push('<span style="color:#d97706;font-weight:bold;">Sedimentation Risk</span>');

    if (r.V && r.V > 5.0)
        warnings.push('<span style="color:#dc2626;font-weight:bold;">Erosion Risk</span>');

    if (r.b && r.d && r.b > 5 * r.d)
        warnings.push('<span style="color:#7c3aed;font-weight:bold;">Inefficient Section</span>');

    const warningText = warnings.length
        ? warnings.join("<br>")
        : '<span style="color:#16a34a;font-weight:bold;">No Hydraulic Risk</span>';
        
    //FINAL REMARK
    const remarkBlock = `
        <b>${designStatus}</b><br>
        <b>${selfClean}</b><br><br>
        <b>Warnings:</b><br>
        ${warningText}
    `;

    const bVal = safeFixed(r.b);
    const aVal = safeFixed(r.a);
    const dVal = safeFixed(r.d);

    let finalText = "";

    if (type === "rectangular") {
        finalText = (r.b === r.d)
            ? `Provide Square Channel Section ${bVal}m × ${dVal}m`
            : `Provide Rectangular Channel Section ${bVal}m × ${dVal}m`;
    } else {
        finalText =
            `Provide Trapezoidal Section Top=${bVal}m, Bottom=${aVal}m, Depth=${dVal}m`;
    }

    // ✅ CORRECT ROW COUNT
    const baseRows = 9; // C, Design S, Actual S, n, C_A, D_F, I,T_c, Q
    const geometryRows = (type === "trapezoidal") ? 4 : 3; // includes velocity
    const resultRows = 5; // A, P, R, Q_lim, Qcap
    const rows = baseRows + geometryRows + resultRows;

    // ── REPLACE the entire  let table = `...`  block with this ──
    // ── and the fullTable block below it ──

    const tdStyle     = `font-family:'Segoe UI',Arial,sans-serif; font-size:12px; font-weight:bold; color:#cbd5e0; padding:6px 10px; border-bottom:1px solid #1e2a3a;`;
    const tdLabelStyle = `font-family:'Segoe UI',Arial,sans-serif; font-size:12px; font-weight:bold; color:#a0aec0; padding:6px 10px; border-bottom:1px solid #1e2a3a;`;
    const tdValStyle   = `font-family:'Segoe UI',Arial,sans-serif; font-size:12px; font-weight:bold; color:#63b3ed; padding:6px 10px; border-bottom:1px solid #1e2a3a; text-align:center;`;
    const thStyle      = `font-family:'Segoe UI',Arial,sans-serif; font-size:11px; font-weight:bold; text-transform:uppercase; letter-spacing:0.06em; color:#a0aec0; background:#1e2a3a; padding:8px 10px; text-align:left; border-bottom:1px solid #2d3748;`;
    const tdFirstStyle = `font-family:'Segoe UI',Arial,sans-serif; font-size:13px; font-weight:bold; color:#cbd5e0; padding:6px 10px; border-bottom:1px solid #1e2a3a; vertical-align:middle; text-align:left;`;
    const tdRemarkStyle = `font-family:'Segoe UI',Arial,sans-serif; font-size:13px; color:#a0aec0; padding:10px; border-bottom:1px solid #1e2a3a; text-align:center; vertical-align:middle; line-height:1.6;`;
    const tdFinalStyle  = `font-family:'Segoe UI',Arial,sans-serif; font-size:16px; font-weight:bold; color:#1a2e4a; text-align:center; padding:12px 10px; background:#b1a5af; border-top:2px solid #7caee7; border-bottom:2px solid #7caee7; letter-spacing:0.02em;`;
    let table = `
        <tr>
            <th style="${thStyle} width:25%;">Catchment</th>
            <th style="${thStyle} width:37%;">Design Information</th>
            <th style="${thStyle} width:13%;">Value</th>
            <th style="${thStyle} width:25%;">Remark</th>
        </tr>

        <tr>
            <td rowspan="${rows}" style="${tdFirstStyle}">
                <div><b>${data.catchment}</b></div>
                <div style="margin-top:4px; font-size:12px; color:#a0aec0; font-weight:normal;">${data.description}</div>
                ${data.chainage ? `<div style="margin-top:4px; font-size:11px; color:#63b3ed; font-weight:normal;">Ch: ${data.chainage}</div>` : ""}
                ${data.length ? `<div style="margin-top:4px; font-size:11px; color:#68d391; font-weight:normal;">L: ${data.length} m</div>` : ""}
            </td>

            <td style="${tdLabelStyle}">Runoff Coefficient (C)</td>
            <td style="${tdValStyle}">${data.parameters.runoff_coefficient ? parseFloat(data.parameters.runoff_coefficient).toFixed(3) : "-"}</td>
            <td rowspan="${rows}" style="${tdRemarkStyle}">
                ${remarkBlock}
            </td>
        </tr>

        <tr><td style="${tdLabelStyle}">Minimum Design Slope (S)</td><td style="${tdValStyle}">${data.parameters.slope ? parseFloat(data.parameters.slope).toFixed(4) : "-"}</td></tr>
        <tr><td style="${tdLabelStyle}">Actual Slope of Channel</td><td style="${tdValStyle}">${!r.slope_local ? "Not Set" : r.slope_local === data.parameters.slope ? `${parseFloat(r.slope_local).toFixed(4)}<br><span style="color:#f6ad55;font-size:9px; weight:bold">(adopted min)</span>` : parseFloat(r.slope_local).toFixed(4)}</td></tr>
        <tr><td style="${tdLabelStyle}">Manning's Roughness n</td><td style="${tdValStyle}">${data.parameters.manning_n ?? "-"}</td></tr>
        <tr><td style="${tdLabelStyle}">Catchment Area (m²)</td><td style="${tdValStyle}">${safeFixed(area, 2)}</td></tr>
        <tr><td style="${tdLabelStyle}">Design Frequency (yrs)</td><td style="${tdValStyle}">${data.parameters.design_frequency ?? "-"}</td></tr>
        <tr><td style="${tdLabelStyle}">Computed Rainfall Intensity (mm/hr)</td><td style="${tdValStyle}">${safeFixed(data.intensity, 2)}</td></tr>
        <tr><td style="${tdLabelStyle}">Computed Time of Concentration Tc (min)</td><td style="${tdValStyle}">${data.tc ? parseFloat(data.tc).toFixed(2) : "-"}</td></tr>
        <tr><td style="${tdLabelStyle}">Cumulative Peak Discharge Qp (m³/s)</td><td style="${tdValStyle} background:#854d0e; color:#e9d5ff;">${safeFixed(r.Q,4)}</td></tr>
        ${type === "rectangular" ? `
        <tr><td style="${tdLabelStyle}">Channel Width b (m)</td><td style="${tdValStyle}">${bVal}</td></tr>
        <tr><td style="${tdLabelStyle}">Channel Depth d (m)</td><td style="${tdValStyle}">${dVal}</td></tr>
        <tr><td style="${tdLabelStyle}">Flow Velocity V (m/s)</td><td style="${tdValStyle}">${safeFixed(r.V,4)}</td></tr>
        ` : `
        <tr><td style="${tdLabelStyle}">Top Width (m)</td><td style="${tdValStyle}">${bVal}</td></tr>
        <tr><td style="${tdLabelStyle}">Bottom Width (m)</td><td style="${tdValStyle}">${aVal}</td></tr>
        <tr><td style="${tdLabelStyle}">Depth (m)</td><td style="${tdValStyle}">${dVal}</td></tr>
        <tr><td style="${tdLabelStyle}">Flow Velocity V (m/s)</td><td style="${tdValStyle}">${safeFixed(r.V,4)}</td></tr>
        `}

        <tr><td style="${tdLabelStyle}">Wetted Area A (m²)</td><td style="${tdValStyle}">${safeFixed(r.A,4)}</td></tr>
        <tr><td style="${tdLabelStyle}">Wetted Perimeter P (m)</td><td style="${tdValStyle}">${safeFixed(r.P,4)}</td></tr>
        <tr><td style="${tdLabelStyle}">Hydraulic Radius R = A/P (m)</td><td style="${tdValStyle}">${safeFixed(r.R,4)}</td></tr>
        <tr><td style="${tdLabelStyle}">Designed Discharge Qcap (m³/s)</td><td style="${tdValStyle} background:#14532d; color:#e9d5ff;">${safeFixed(r.Qcap,4)}</td></tr>
       <tr><td style="${tdLabelStyle}">Max. Allowable Discharge Q_lim (m³/s)</td><td style="${tdValStyle} background:#581c87; color:#e9d5ff;">${safeFixed(r.Q_lim,4)}</td></tr>
        <tr>
            <td colspan="4" style="${tdFinalStyle}">
                ${finalText}
            </td>
        </tr>
    `;

    const container = document.getElementById("designTable");

    const mode = document.querySelector('input[name="hyd_mode"]:checked')?.value;

    const fullTable = `
        <div style="margin-bottom:30px;">
            <table style="width:100%; border-collapse:collapse; background:transparent;">
                ${table}
            </table>
        </div>
    `;


    if(window.loadingSavedHydraulic){

        container.insertAdjacentHTML("beforeend", fullTable);

    }
    else if(mode === "single"){

        container.innerHTML = fullTable;

    }
    else {

        container.insertAdjacentHTML("beforeend", fullTable);

    }
       
}

// =============================
// AUTO DESIGN ENGINE (FIXED)
// =============================
function autoDesign(){

    if (!window.projectData?.catchments) {
        alert("No project data");
        return;
    }

    const index = document.getElementById("catchmentSelect").value;
    const c = window.projectData.catchments[index];

    if (!c) return;

    const Q = c.q;

    const params = window.projectData.parameters || {};
    const n = params.manning_n || 0.013;
    const S = params.slope || 0.001;

    const type = document.querySelector('input[name="section"]:checked').value;
    const mode = document.querySelector('input[name="mode"]:checked').value;

    const standardDepths = [
        0.60, 0.75, 0.90, 1.20, 1.50, 1.80, 2.00, 2.20, 2.40, 2.75, 3.00, 3.20, 3.60, 4.20, 4.50
    ];

    let best = null;

    // =============================
    // CHECK MODE (NO AUTO RESIZING)
    // =============================
    if (mode === "check") {

        const d = parseFloat(document.getElementById("d").value);

        let result;

        if (type === "rectangular") {

            const inputB = parseFloat(document.getElementById("b")?.value);
            const b = (!isNaN(inputB) && inputB > 0) ? inputB : 0;

            const A = b * d;
            const P = b + 2 * d;
            const R = A / P;

            const Qcap = (1/n) * A * Math.pow(R, 2/3) * Math.sqrt(S);

            const V = Qcap / A;

            result = { b, d, A, P, R, Qcap, V, type };

        } else {

            const inputB = parseFloat(document.getElementById("b").value);
            const inputA = parseFloat(document.getElementById("a").value);

            const b = isNaN(inputB) ? 0 : inputB;
            const a = isNaN(inputA) ? 0 : inputA;

            const z = (b > a) ? (b - a) / (2 * d) : 1.5;

            const A = ((b + a) / 2) * d;
            const P = a + 2 * Math.sqrt(d*d + Math.pow((b - a)/2, 2));
            const R = A / P;

            const Qcap = (1/n) * A * Math.pow(R, 2/3) * Math.sqrt(S);

            const V = Qcap / A;

            result = { b, a, d, z, A, P, R, Qcap, V, type };
        }

        best = {
            ...result,
            Q,
            ok: result.Qcap >= Q
        };

    }

    // =============================
    // DESIGN MODE (AUTO RESIZE)
    // =============================
    else {

        for (let d of standardDepths) {

            let result;

            if (type === "rectangular") {

                let inputB = parseFloat(document.getElementById("b")?.value);
                const b = (!isNaN(inputB) && inputB > 0) ? inputB : 2 * d;

                const A = b * d;
                const P = b + 2 * d;
                const R = A / P;

                const Qcap = (1/n) * A * Math.pow(R, 2/3) * Math.sqrt(S);

                const V = Qcap / A;

                result = { b, d, A, P, R, Qcap, V, type };

            } else {

                const inputB = parseFloat(document.getElementById("b").value);
                const inputA = parseFloat(document.getElementById("a").value);

                const b = isNaN(inputB) ? 2 : inputB;
                const a = isNaN(inputA) ? b * 0.6 : inputA;

                const z = (b > a) ? (b - a) / (2 * d) : 1.5;

                const A = ((b + a) / 2) * d;
                const P = a + 2 * Math.sqrt(d*d + Math.pow((b - a)/2, 2));
                const R = A / P;

                const Qcap = (1/n) * A * Math.pow(R, 2/3) * Math.sqrt(S);

                const V = Qcap / A;

                result = { b, a, d, z, A, P, R, Qcap, V, type };
            }

            // BEST-FIT SELECTION
            if (result.Qcap >= Q * 1.1) {
                if (!best || result.Qcap < best.Qcap) {
                    best = result;
                }
            }
        }
    }

    // =============================
    // OUTPUT RESULT
    // =============================
    const resultObj = best ? {
        ...best,
        Q,
        ok: true
    } : {
        Q,
        ok: false,
        type
    };

    renderHydraulicTable({
        catchment: c.name,
        description: c.description,
        chainage: c.chainage,
        length: c.length,
        area: c.area, 
        tc: c.tc,
        parameters: window.projectData.parameters,
        result: resultObj
    });
}

// =============================
// INPUT VISIBILITY CONTROL
// =============================
function updateInputVisibility(){

    const section = document.querySelector('input[name="section"]:checked')?.value;
    const mode = document.querySelector('input[name="mode"]:checked')?.value;

    const b = document.getElementById("b");
    const d = document.getElementById("d");
    const a = document.getElementById("a");

    if (!b || !d || !a) return;

    b.style.display = "none";
    d.style.display = "none";
    a.style.display = "none";

    if (section === "rectangular") {

        if (mode === "check") {
            b.style.display = "block";
            d.style.display = "block";
        } else {
            b.style.display = "block";
        }

    } else if (section === "trapezoidal") {

        b.style.display = "block";
        a.style.display = "block";

        if (mode === "check") {
            d.style.display = "block";
        }
    }
}


// INIT SAFE BINDING
window.addEventListener("load", () => {

    console.log("Hydraulic module loaded");

    updateInputVisibility();

    document.querySelectorAll('input[name="section"], input[name="mode"]')
    .forEach(el => el.addEventListener("change", updateInputVisibility));

    // =============================
    // LOAD SAVED HYDRAULIC DESIGNS
    // =============================
    const container = document.getElementById("designTable");

    if (container) {
        container.innerHTML = "";
    }

        if (!window.projectData?.catchments) return;

    // Populate the filter checklist instead of auto-rendering every result
    const filterContainer = document.getElementById("filterCatchList");

    if (filterContainer) {

        const designed = window.projectData.catchments
            .map((c, i) => ({ ...c, __idx: i }))
            .filter(c => c.hydraulic_design);

        if (designed.length > 0) {
            designed.forEach(c => {
                filterContainer.innerHTML += `<label><input type="checkbox" class="filterCheck" value="${c.__idx}"><span>${c.name}</span></label>`;
            });
        } else {
            filterContainer.innerHTML = "No designed catchments yet";
        }
    }

    const selectAllFilterBox = document.getElementById("selectAllFilterCatchments");
    if (selectAllFilterBox) {
        selectAllFilterBox.addEventListener("change", function(){
            document.querySelectorAll(".filterCheck").forEach(cb => {
                cb.checked = selectAllFilterBox.checked;
            });
        });
    }

});

function showFilteredResults(){

    const checked = document.querySelectorAll(".filterCheck:checked");

    if (!checked.length) {
        alert("Please select at least one designed catchment to display.");
        return;
    }

    const container = document.getElementById("designTable");
    container.innerHTML = "";

    window.loadingSavedHydraulic = true;

    Array.from(checked).forEach(cb => {

        const idx = parseInt(cb.value, 10);
        const c = window.projectData.catchments[idx];

        if (!c || !c.hydraulic_design) return;

        renderHydraulicTable({
            catchment: c.name,
            description: c.description,
            chainage: c.chainage,
            length: c.length,
            area: c.area,
            tc: c.tc,
            intensity: c.intensity,
            parameters: window.projectData.parameters,
            result: c.hydraulic_design.result
        });

    });

    window.loadingSavedHydraulic = false;

}

window.showFilteredResults = showFilteredResults;


// GLOBAL EXPORT (CRITICAL FIX)
window.runSelectedHydraulic = runSelectedHydraulic;
window.runHydraulic = runHydraulic;
window.autoDesign = autoDesign;
window.renderHydraulicTable = renderHydraulicTable;