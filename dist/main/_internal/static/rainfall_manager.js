// static/rainfall_manager.js

let selectedFile   = null;
let currentPreview = null;
let currentPreviewLabel = null;

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    loadSources();
    setupDragDrop();
    setupFileInput();
});

// ══════════════════════════════════════════
// LOAD + RENDER SOURCE CARDS
// ══════════════════════════════════════════
function loadSources() {
    fetch("/api/idf/sources")
        .then(res => res.json())
        .then(data => renderSources(data.sources, data.active));
}

function renderSources(sources, active) {
    const list = document.getElementById("sourceList");
    list.innerHTML = "";

    sources.forEach(src => {
        const isActive     = src.name === active;
        const isBuiltin    = src.type === "builtin";
        const isPreviewing = src.name === currentPreview;

        const card = document.createElement("div");
        card.className = `source-card${isActive ? " active" : ""}${isPreviewing ? " selected-preview" : ""}`;

        card.innerHTML = `
            <div class="source-card-top">
                <span class="source-name">${src.label}</span>
                <div style="display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end;">
                    ${isActive     ? '<span class="source-badge badge-active">Active</span>' : ""}
                    ${isPreviewing ? '<span class="source-badge" style="background:#1a3a1a;color:#68d391;">Previewing</span>' : ""}
                    <span class="source-badge ${isBuiltin ? "badge-builtin" : "badge-uploaded"}">
                        ${isBuiltin ? "Built-in" : "Uploaded"}
                    </span>
                </div>
            </div>
            <div class="source-card-actions">
                <button class="btn-set-active"
                    onclick="event.stopPropagation(); setActive('${src.name}')"
                    ${isActive ? "disabled" : ""}>
                    ${isActive ? "✓ Currently Active" : "Set as Active"}
                </button>
                ${!isBuiltin ? `
                <button class="btn-delete"
                    onclick="event.stopPropagation(); deleteSource('${src.name}')">
                    Delete
                </button>` : ""}
            </div>
        `;

        card.addEventListener("click", () => previewSource(src.name, src.label));
        list.appendChild(card);
    });
}

// ══════════════════════════════════════════
// PREVIEW A SAVED SOURCE (read-only)
// ══════════════════════════════════════════
function previewSource(name, label) {
    currentPreview      = name;
    currentPreviewLabel = label;

    fetch(`/api/idf/source_data?name=${encodeURIComponent(name)}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                showStatus(`Could not load: ${data.error}`, "error");
                return;
            }
            renderPreview(data, `${label} — Intensity (mm/hr) [Read Only]`);
            loadSources();
        });
}

// ══════════════════════════════════════════
// SET ACTIVE SOURCE
// ══════════════════════════════════════════
function setActive(name) {
    fetch("/api/idf/set_source", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ source: name })
    })
    .then(res => res.json())
    .then(() => loadSources());
}

// ══════════════════════════════════════════
// DELETE SOURCE
// ══════════════════════════════════════════
function deleteSource(name) {
    if (!confirm(`Delete dataset "${name}"? This cannot be undone.`)) return;

    fetch("/api/idf/delete", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name })
    })
    .then(res => res.json())
    .then(data => {
        if (currentPreview === name) {
            currentPreview      = null;
            currentPreviewLabel = null;
            document.getElementById("previewWrap").style.display  = "none";
            document.getElementById("previewLabel").style.display = "none";
        }
        renderSources(data.sources, "builtin");
        showStatus("Dataset deleted.", "ok");
    });
}

// ══════════════════════════════════════════
// FILE SELECTION
// ══════════════════════════════════════════
function setupFileInput() {
    const input = document.getElementById("fileInput");
    input.addEventListener("change", () => {
        if (input.files.length) handleFileSelected(input.files[0]);
    });
}

function setupDragDrop() {
    const zone = document.getElementById("uploadZone");

    zone.addEventListener("dragover", e => {
        e.preventDefault();
        zone.classList.add("dragover");
    });

    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));

    zone.addEventListener("drop", e => {
        e.preventDefault();
        zone.classList.remove("dragover");
        if (e.dataTransfer.files.length) handleFileSelected(e.dataTransfer.files[0]);
    });
}

function handleFileSelected(file) {
    selectedFile = file;
    document.getElementById("selectedFileName").textContent = `Selected: ${file.name}`;
    document.getElementById("uploadBtn").disabled = false;
    previewUploadedFile(file);
}

// ══════════════════════════════════════════
// PREVIEW UPLOADED FILE (before saving)
// ══════════════════════════════════════════
function previewUploadedFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    fetch("/api/idf/preview", { method: "POST", body: formData })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                showStatus(`Preview error: ${data.error}`, "error");
                return;
            }
            currentPreview      = null;
            currentPreviewLabel = file.name;
            renderPreview(data, `Upload Preview — ${file.name}`);
            loadSources();
        });
}

function clearPreview() {
    currentPreview      = null;
    currentPreviewLabel = null;
    document.getElementById("previewWrap").style.display     = "none";
    document.getElementById("previewLabel").style.display    = "none";
    document.getElementById("clearPreviewBar").style.display = "none";
    loadSources();
}

// ══════════════════════════════════════════
// RENDER PREVIEW TABLE (shared)
// ══════════════════════════════════════════
function renderPreview(data, title) {
    const table = document.getElementById("previewTable");
    const wrap  = document.getElementById("previewWrap");
    const label = document.getElementById("previewLabel");

    label.textContent = title;

    let html = "<thead><tr><th>Duration (min)</th>";
    data.return_periods.forEach(rp => {
        html += `<th>${rp}-yr (mm/hr)</th>`;
    });
    html += "</tr></thead><tbody>";

    data.durations.forEach((d, i) => {
        html += `<tr><td>${d}</td>`;
        data.table[i].forEach(val => {
            html += `<td>${parseFloat(val).toFixed(1)}</td>`;
        });
        html += "</tr>";
    });

    html += "</tbody>";
    table.innerHTML    = html;
    wrap.style.display  = "block";
    label.style.display = "block";
    document.getElementById("clearPreviewBar").style.display = "block";
}

// ══════════════════════════════════════════
// UPLOAD
// ══════════════════════════════════════════
function uploadDataset() {
    if (!selectedFile) return;

    const name = document.getElementById("datasetName").value.trim();
    if (!name) {
        showStatus("Please enter a dataset name.", "error");
        return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("name", name);

    document.getElementById("uploadBtn").disabled = true;

    fetch("/api/idf/upload", { method: "POST", body: formData })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                showStatus(`Upload failed: ${data.error}`, "error");
                document.getElementById("uploadBtn").disabled = false;
                return;
            }
            renderSources(data.sources, "builtin");
            showStatus(`"${data.name}" uploaded successfully. Click it to preview or set as active.`, "ok");
            document.getElementById("datasetName").value            = "";
            document.getElementById("selectedFileName").textContent = "";
            document.getElementById("fileInput").value              = "";
            selectedFile = null;
            document.getElementById("uploadBtn").disabled = true;
        });
}

// ══════════════════════════════════════════
// PRINT DATASET
// ══════════════════════════════════════════
function printDataset() {
    const wrap = document.getElementById("previewWrap");

    if (!wrap || wrap.style.display === "none") {
        alert("Please click a dataset to preview it first, then print.");
        return;
    }

    const datasetTitle = currentPreviewLabel || "IDF Dataset";
    const tableEl      = document.getElementById("previewTable");

    // extract headers and rows for clean rebuild
    const headers = Array.from(tableEl.querySelectorAll("thead th")).map(th => th.textContent.trim());
    const rows    = Array.from(tableEl.querySelectorAll("tbody tr")).map(tr =>
        Array.from(tr.querySelectorAll("td")).map(td => td.textContent.trim())
    );

    let theadHTML = "<tr>" + headers.map((h, i) =>
        `<th${i === 0 ? ' class="col-duration"' : ''}>${h}</th>`
    ).join("") + "</tr>";

    let tbodyHTML = rows.map((row, ri) => {
        const bg = ri % 2 === 1 ? ' class="alt"' : '';
        return "<tr" + bg + ">" + row.map((cell, ci) =>
            `<td${ci === 0 ? ' class="col-duration"' : ''}>${cell}</td>`
        ).join("") + "</tr>";
    }).join("");

    const content = `
    <html>
    <head>
        <title>IDF Dataset — ${datasetTitle}</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: Arial, sans-serif;
                color: #111;
                background: white;
            }

            .report-page {
                padding: 36px 48px 64px 48px;
                position: relative;
                min-height: 100vh;
            }

            /* ── HEADER ── */
            .report-header {
                border-bottom: 2px solid #2b4a7a;
                padding-bottom: 12px;
                margin-bottom: 20px;
            }

            .report-header h1 {
                font-size: 17px;
                color: #1a2e4a;
                margin-bottom: 4px;
            }

            .report-header-meta {
                display: flex;
                gap: 24px;
                flex-wrap: wrap;
                margin-top: 6px;
            }

            .report-header-meta div { font-size: 11px; color: #555; }
            .report-header-meta strong { color: #1a4a8a; }

            /* ── SECTION TITLE ── */
            .section-title {
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                color: #555;
                margin-bottom: 10px;
                margin-top: 18px;
                padding-bottom: 4px;
                border-bottom: 1px solid #dde;
            }

            /* ── INFO BOX ── */
            .info-box {
                display: flex;
                gap: 20px;
                flex-wrap: wrap;
                background: #f0f5ff;
                border: 1px solid #c8d8f0;
                border-radius: 6px;
                padding: 10px 16px;
                margin-bottom: 18px;
            }
            .info-box div    { font-size: 11px; color: #333; }
            .info-box strong { color: #1a4a8a; }

            /* ── TABLE ── */
            table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
            }

            th {
                background: #dbe9f9;
                color: #1a2e4a;
                font-size: 9px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                padding: 8px 10px;
                border: 1px solid #b0c8e8;
                text-align: center;
            }

            th.col-duration {
                text-align: left;
                background: #c8d8f0;
            }

            td {
                padding: 7px 10px;
                border: 1px solid #dde;
                text-align: center;
                color: #222;
            }

            td.col-duration {
                text-align: left;
                font-weight: bold;
                color: #1a4a8a;
                background: #f0f5ff;
            }

            tr.alt td { background: #eaf3ff; }
            tr.alt td.col-duration { background: #e0ecff; }

            /* ── FOOTER ── */
            .page-footer {
                position: fixed;
                bottom: 18px;
                left: 48px;
                right: 48px;
                border-top: 1px solid #ccc;
                padding-top: 8px;
                font-size: 9px;
                color: #888;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .footer-center { flex: 1; text-align: center; }

            @page { margin: 0; size: A4 portrait; }

            @media print {
                @page { margin: 0; size: A4 portrait; }
                th {
                    background: #dbe9f9 !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                th.col-duration {
                    background: #c8d8f0 !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                td.col-duration {
                    background: #f0f5ff !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                tr.alt td {
                    background: #eaf3ff !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                tr.alt td.col-duration {
                    background: #e0ecff !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .info-box {
                    background: #f0f5ff !important;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
            }
        </style>
    </head>
    <body>
    <div class="report-page">

        <div class="report-header">
            <h1>Intensity-Duration-Frequency (IDF) Data</h1>
            <div class="report-header-meta">
                <div><strong>Dataset:</strong> ${datasetTitle}</div>
                <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
            </div>
        </div>

        <div class="section-title">Dataset Information</div>
        <div class="info-box">
            <div><strong>Dataset Name:</strong> ${datasetTitle}</div>
            <div><strong>Durations:</strong> ${rows.length} entries</div>
            <div><strong>Return Periods:</strong> ${headers.length - 1} columns</div>
            <div><strong>Units:</strong> Intensity in mm/hr, Duration in minutes</div>
        </div>

        <div class="section-title">IDF Table — Rainfall Intensity (mm/hr)</div>
        <table>
            <thead>${theadHTML}</thead>
            <tbody>${tbodyHTML}</tbody>
        </table>

        <div class="page-footer">
            <span>Storm Solver — Rainfall Manager</span>
            <span class="footer-center">${datasetTitle}</span>
            <span>${new Date().toLocaleDateString()}</span>
        </div>

    </div>
    </body>
    </html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(content);
    doc.close();
    setTimeout(() => {
        try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
        catch(err) { console.error("Print failed:", err); }
        setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
}

// ══════════════════════════════════════════
// STATUS MESSAGE
// ══════════════════════════════════════════
function showStatus(msg, type) {
    const el          = document.getElementById("statusMsg");
    el.className      = `status-msg status-${type}`;
    el.textContent    = msg;
    el.style.display  = "block";
    setTimeout(() => { el.style.display = "none"; }, 4000);
}