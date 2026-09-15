// static/storm_simulation.js

// ── STATE ──
let rainfallChart   = null;
let hydrographChart = null;
let unitChart       = null;
let multiChart      = null;

let animFrames      = [];
let rainFrames      = [];   // synced rainfall animation frames
let currentFrame    = 0;
let playing         = false;
let animInterval    = null;

let currentIntensity = 0;
let currentTc        = 5;
let currentC         = 0.75;
let intensityMode    = "idf";   // "idf" | "custom"

// stored full data for print
let lastHydroData  = null;
let lastUnitData   = null;
let lastMultiData  = null;

// chart colours
const HYDRO_COLOR  = "hsla(12,  100%, 50%, 0.9)";
const UNIT_COLOR   = "hsla(210, 100%, 60%, 0.9)";
const RAIN_COLOR   = "hsla(200, 80%,  55%, 0.75)";
const EXCESS_COLOR = "hsla(120, 60%,  50%, 0.5)";

const MULTI_COLORS = [
    "hsla(210, 100%, 65%, 0.9)",
    "hsla(150,  70%, 50%, 0.9)",
    "hsla(45, 100%, 55%, 0.97)",
    "hsl(27, 93%, 54%)",
    "hsla(280,  70%, 60%, 0.9)",
    "hsla(0, 94%, 47%, 0.90)"
];

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    loadReturnPeriods();
    initSliders();
});

function loadReturnPeriods() {
    fetch("/api/storm/idf_return_periods")
        .then(res => res.json())
        .then(data => {
            const sel = document.getElementById("returnPeriod");
            sel.innerHTML = "";
            data.return_periods.forEach(rp => {
                const opt       = document.createElement("option");
                opt.value       = rp;
                opt.textContent = `${rp}-Year Storm`;
                sel.appendChild(opt);
            });
            onParamChange();
        });
}

function initSliders() {
    const catchments = window.projectData?.catchments || [];
    const idx        = parseInt(document.getElementById("catchmentSelect").value) || 0;
    const c          = catchments[idx] || {};

    currentTc = c.tc || 5;
    currentC  = c.runoff_coefficient ||
                window.projectData?.parameters?.runoff_coefficient || 0.75;

    const tcSlider = document.getElementById("tcSlider");
    tcSlider.value = currentTc;
    document.getElementById("tcVal").textContent = `${currentTc} min`;

    const cSlider  = document.getElementById("cSlider");
    cSlider.value  = currentC;
    document.getElementById("cVal").textContent  = currentC.toFixed(2);
}

// ══════════════════════════════════════════
// INTENSITY MODE TOGGLE
// ══════════════════════════════════════════
function setIntensityMode(mode) {
    intensityMode = mode;

    document.getElementById("btnIDF").classList.toggle("active",    mode === "idf");
    document.getElementById("btnCustom").classList.toggle("active", mode === "custom");
    document.getElementById("idfPanel").style.display    = mode === "idf"    ? "block" : "none";
    document.getElementById("customPanel").style.display = mode === "custom" ? "block" : "none";

    if (mode === "idf") {
        document.getElementById("intensitySource").textContent = "mm/hr from active IDF source";
        onParamChange();
    } else {
        document.getElementById("intensitySource").textContent = "mm/hr — custom entry";
        const val = parseFloat(document.getElementById("customIntensity").value);
        if (val > 0) onCustomIntensity(val);
    }
}

function onCustomIntensity(val) {
    val = parseFloat(val);
    if (isNaN(val) || val <= 0) return;
    currentIntensity = val;
    document.getElementById("intensityDisplay").textContent = `${val} mm/hr`;
    updateDepthDisplay(val, currentTc);
    renderRainfallChart(val, currentTc);
}

// ══════════════════════════════════════════
// DEPTH DISPLAY
// ══════════════════════════════════════════
function updateDepthDisplay(intensity, Tc) {
    const depth   = round2(intensity * Tc / 60);   // mm
    const depthEl = document.getElementById("depthDisplay");
    depthEl.textContent    = `Rainfall Depth: ${depth} mm`;
    depthEl.style.display  = "block";
}

// ══════════════════════════════════════════
// EVENT HANDLERS
// ══════════════════════════════════════════
function onCatchmentChange() {
    initSliders();
    if (intensityMode === "idf") onParamChange();
}

function onTcSlider(val) {
    currentTc = parseFloat(val);
    document.getElementById("tcVal").textContent = `${currentTc} min`;
    if (intensityMode === "idf") {
        onParamChange();
    } else {
        updateDepthDisplay(currentIntensity, currentTc);
        renderRainfallChart(currentIntensity, currentTc);
    }
}

function onCSlider(val) {
    currentC = parseFloat(val);
    document.getElementById("cVal").textContent = currentC.toFixed(2);
    if (currentIntensity > 0) renderRainfallChart(currentIntensity, currentTc);
}

function onParamChange() {
    const tr = document.getElementById("returnPeriod").value;
    if (!tr) return;

    fetch("/api/storm/idf_intensity", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ tc: currentTc, tr: parseFloat(tr) })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            document.getElementById("intensityDisplay").textContent = "—";
            return;
        }
        currentIntensity = data.intensity;
        document.getElementById("intensityDisplay").textContent = `${data.intensity} mm/hr`;
        updateDepthDisplay(data.intensity, currentTc);
        renderRainfallChart(data.intensity, currentTc);
    });
}

// ══════════════════════════════════════════
// RUN STORM — animated hydrograph
// ══════════════════════════════════════════
function runStorm() {
    const index = parseInt(document.getElementById("catchmentSelect").value);

    fetch("/api/storm/combined", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
            index,
            intensity:   currentIntensity,
            tc_override: currentTc,
            c_override:  currentC
        })
    })
    .then(res => res.json())
    .then(data => {
        lastHydroData = data.hydrograph;
        lastUnitData  = data.unit;

        renderUnitChart(data.unit);

        // build synced rainfall animation frames
        buildRainFrames(currentIntensity, currentTc, data.hydrograph.frames.length);

        animFrames   = data.hydrograph.frames || [];
        currentFrame = 0;
        resetPlayback();
        setupSlider(animFrames.length);
        renderFrame(0, data.hydrograph);

        updateSummary(data.hydrograph, data.unit);

        document.getElementById("summarySection").style.display = "flex";
        document.getElementById("animBadge").style.display      = "inline";
    });
}

// ══════════════════════════════════════════
// SYNCED RAINFALL ANIMATION FRAMES
// ══════════════════════════════════════════
function buildRainFrames(intensity, Tc, totalFrames) {
    const steps   = 30;
    // Must match backend's storm_analysis.py max_time formula exactly
    // (2*Tc + 30) so rainfall and hydrograph charts stay on the same
    // timeline at every animation frame index.
    const maxTime = 2 * Tc + 30;
    const timeArr = Array.from({ length: steps }, (_, i) => round2(i * maxTime / (steps - 1)));
    const fullRain = timeArr.map(t => t <= Tc ? intensity : 0);
    const fullExcess = fullRain.map(r => round2(r * currentC));

    rainFrames = [];

    for (let f = 0; f < totalFrames; f++) {
        // progress 0→1 as frames advance
        const progress = f / Math.max(totalFrames - 1, 1);
        const currentTime = progress * maxTime;

        // bars drain after storm ends (after Tc)
        const rain   = timeArr.map(t => {
            if (t > currentTime) return 0;
            return t <= Tc ? intensity : 0;
        });
        const excess = rain.map(r => round2(r * currentC));

        rainFrames.push({ time: timeArr, rain, excess });
    }
}

// ══════════════════════════════════════════
// RENDER FRAME (hydrograph + rainfall synced)
// ══════════════════════════════════════════
function renderFrame(frameIdx, fullData) {
    renderHydroFrame(frameIdx, fullData);
    renderRainFrame(frameIdx);
}

function renderRainFrame(frameIdx) {
    if (!rainFrames.length) return;
    const frame = rainFrames[Math.min(frameIdx, rainFrames.length - 1)];

    const ctx = document.getElementById("rainfallChart").getContext("2d");
    if (rainfallChart) rainfallChart.destroy();

    rainfallChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: frame.time,
            datasets: [
                {
                    label:           "Rainfall Intensity (mm/hr)",
                    data:            frame.rain,
                    backgroundColor: RAIN_COLOR,
                    borderWidth:     0,
                    order:           2
                },
                {
                    label:           "Effective Rainfall (mm/hr)",
                    data:            frame.excess,
                    backgroundColor: EXCESS_COLOR,
                    borderWidth:     0,
                    order:           1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { labels: { color: "#fff", font: { size: 10, weight: "bold" }, boxWidth: 10 } } },
            scales: {
                x: { title: { display: true, text: "Time (min)", color: "#fff", font: {size: 11, weight: "bold"} },
                     ticks: { color: "#a0aec0", font: { size: 9, weight: "bold" }, maxTicksLimit: 8 },
                     grid:  { color: "#2d3748" } },
                y: {
                    title: { display: true, text: "Intensity (mm/hr)", color: "#fff", font: {size: 11, weight: "bold"} },
                    ticks: { color: "#a0aec0", font: { size: 9, weight: "bold" } },
                    grid:  { color: "#2d3748" },
                    max:   Math.ceil(currentIntensity * 1.1)
                }
            }
        }
    });
}

// ══════════════════════════════════════════
// MULTI-STORM COMPARISON
// ══════════════════════════════════════════
function runMultiStorm() {
    const index = parseInt(document.getElementById("catchmentSelect").value);

    fetch("/api/storm/multi", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
            index,
            intensity:   currentIntensity,
            tc_override: currentTc,
            c_override:  currentC
        })
    })
    .then(res => res.json())
    .then(data => {
        lastMultiData = data;
        renderMultiChart(data);
    });
}

// ══════════════════════════════════════════
// CHART RENDERERS
// ══════════════════════════════════════════

// ── STATIC RAINFALL BAR CHART (before Run Storm) ──
function renderRainfallChart(intensity, Tc) {
    const ctx = document.getElementById("rainfallChart").getContext("2d");
    if (rainfallChart) rainfallChart.destroy();

    const steps    = 30;
    // Must match backend's storm_analysis.py max_time formula exactly
    // (2*Tc + 30) so this static preview matches the animated version
    // rendered later in buildRainFrames().
    const maxTime  = 2 * Tc + 30;
    const timeArr  = Array.from({ length: steps }, (_, i) => round2(i * maxTime / (steps - 1)));
    const rainArr  = timeArr.map(t => t <= Tc ? intensity : 0);
    const excessArr = rainArr.map(r => round2(r * currentC));

    rainfallChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: timeArr,
            datasets: [
                {
                    label:           "Rainfall Intensity (mm/hr)",
                    data:            rainArr,
                    backgroundColor: RAIN_COLOR,
                    borderWidth:     0,
                    order:           2
                },
                {
                    label:           "Effective Rainfall (mm/hr)",
                    data:            excessArr,
                    backgroundColor: EXCESS_COLOR,
                    borderWidth:     0,
                    order:           1
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { labels: { color: "#fff", font: { size: 10, weight: "bold" }, boxWidth: 10 } } },
            scales: {
                x: { title: { display: true, text: "Time (min)", color: "#fff", font: {size: 11, weight: "bold"} },
                     ticks: { color: "#a0aec0", font: { size: 9, weight: "bold" }, maxTicksLimit: 8 },
                     grid:  { color: "#2d3748" } },
                y: { title: { display: true, text: "Intensity (mm/hr)", color: "#fff", font: {size: 11, weight: "bold"} },
                     ticks: { color: "#a0aec0", font: { size: 9, weight: "bold" } },
                     grid:  { color: "#2d3748" } }
            }
        }
    });
}

// ── ANIMATED HYDROGRAPH ──
function renderHydroFrame(frameIdx, fullData) {
    const ctx   = document.getElementById("hydrographChart").getContext("2d");
    if (hydrographChart) hydrographChart.destroy();

    const frame    = animFrames[frameIdx] || { time: fullData.time, flow: fullData.flow };
    const fullTime = fullData.time;

    hydrographChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: fullTime,
            datasets: [
                {
                    label:           "Full Hydrograph (preview)",
                    data:            fullData.flow,
                    borderColor:     "rgba(255,255,255,0.08)",
                    backgroundColor: "transparent",
                    borderDash:      [4, 4],
                    fill:            false,
                    tension:         0.3,
                    pointRadius:     0,
                    borderWidth:     1
                },
                {
                    label:           `Hydrograph — ${fullData.label || ""}`,
                    data:            frame.flow,
                    borderColor:     HYDRO_COLOR,
                    backgroundColor: HYDRO_COLOR.replace("0.9", "0.15"),
                    fill:            true,
                    tension:         0.3,
                    pointRadius:     0,
                    borderWidth:     2
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { labels: { color: "#fff", font: { size: 10, weight: "bold" }, boxWidth: 10 } } },
            scales: {
                x: { title: { display: true, text: "Time (min)", color: "#fff", font: {size: 11, weight: "bold" } },
                     ticks: { color: "#a0aec0", font: { size: 9, weight: "bold" }, maxTicksLimit: 8 },
                     grid:  { color: "#2d3748" } },
                y: { title: { display: true, text: "Flow (m³/s)", color: "#fff", font: {size: 11, weight: "bold" }, },
                     ticks: { color: "#a0aec0", font: { size: 9, weight: "bold" } },
                     grid:  { color: "#2d3748" } }
            }
        }
    });

    document.getElementById("timeLabel").textContent =
        `t = ${(frame.current_t || 0).toFixed(2)} min`;
}

// ── UNIT HYDROGRAPH ──
function renderUnitChart(data) {
    const ctx = document.getElementById("unitChart").getContext("2d");
    if (unitChart) unitChart.destroy();

    unitChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: data.time,
            datasets: [{
                label:           data.label || "Unit Hydrograph",
                data:            data.flow,
                borderColor:     UNIT_COLOR,
                backgroundColor: UNIT_COLOR.replace("0.9", "0.1"),
                fill:            true,
                tension:         0.3,
                pointRadius:     0,
                borderWidth:     2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { labels: { color: "#fff", font: { size: 10, weight: "bold" }, boxWidth: 10 } } },
            scales: {
                x: { title: { display: true, text: "Time (min)", color: "#fff", font: {size: 11, weight: "bold"} },
                     ticks: { color: "#a0aec0", font: { size: 9, weight: "bold" }, maxTicksLimit: 8 },
                     grid:  { color: "#2d3748" } },
                y: { title: { display: true, text: "Flow (m³/s)", color: "#fff", font: {size: 11, weight: "bold"} },
                     ticks: { color: "#a0aec0", font: { size: 9, weight: "bold" } },
                     grid:  { color: "#2d3748" } }
            }
        }
    });
}

// ── MULTI-STORM ──
function renderMultiChart(data) {
    const ctx = document.getElementById("multiChart").getContext("2d");
    if (multiChart) multiChart.destroy();

    const datasets = (data.series || []).map((s, i) => ({
        label:           `${s.label} (Qp=${s.Qp} m³/s)`,
        data:            s.flow,
        borderColor:     MULTI_COLORS[i % MULTI_COLORS.length],
        backgroundColor: MULTI_COLORS[i % MULTI_COLORS.length].replace("0.9", "0.06"),
        fill:            false,
        tension:         0.3,
        pointRadius:     0,
        borderWidth:     1.5
    }));

    multiChart = new Chart(ctx, {
        type: "line",
        data: { labels: data.time, datasets },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { labels: { color: "#fff", font: { size: 9, weight: "bold" }, boxWidth: 8, padding: 6 } } },
            scales: {
                x: { title: { display: true, text: "Time (min)", color: "#fff", font: {size: 11, weight: "bold" } },
                     ticks: { color: "#a0aec0", font: { size: 9, weight: "#fff" }, maxTicksLimit: 8 },
                     grid:  { color: "#2d3748" } },
                y: { title: { display: true, text: "Flow (m³/s)", color: "#fff", font: {size: 11, weight: "bold" } },
                     ticks: { color: "#a0aec0", font: { size: 9, weight: "bold" } },
                     grid:  { color: "#2d3748" } }
            }
        }
    });
}

// ══════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════
function updateSummary(hydro, unit) {
    const depth = round2(currentIntensity * currentTc / 60);
    document.getElementById("sumQp").textContent    = hydro.Qp     || "—";
    document.getElementById("sumTc").textContent    = hydro.Tc     || "—";
    document.getElementById("sumI").textContent     = currentIntensity || "—";
    document.getElementById("sumDepth").textContent = depth        || "—";
    document.getElementById("sumUQp").textContent   = unit.Qp_unit || "—";
    document.getElementById("sumC").textContent     = currentC.toFixed(2);
}

// ══════════════════════════════════════════
// PLAYBACK
// ══════════════════════════════════════════
function setupSlider(total) {
    const slider  = document.getElementById("stormSlider");
    slider.max    = Math.max(total - 1, 0);
    slider.value  = 0;

    slider.oninput = function () {
        currentFrame = parseInt(this.value);
        if (!lastHydroData) return;
        renderFrame(currentFrame, lastHydroData);
    };
}

function togglePlay() {
    if (!animFrames.length) return;
    playing = !playing;
    document.getElementById("playBtn").textContent = playing ? "⏸ Pause" : "▶ Play";

    if (playing) {
        const speed = parseInt(document.getElementById("speedSelect").value);

        animInterval = setInterval(() => {
            currentFrame = (currentFrame + 1) % animFrames.length;
            document.getElementById("stormSlider").value = currentFrame;
            if (lastHydroData) renderFrame(currentFrame, lastHydroData);
        }, Math.round(800 / speed));
    } else {
        clearInterval(animInterval);
    }
}

function resetPlayback() {
    playing = false;
    clearInterval(animInterval);
    currentFrame = 0;
    document.getElementById("playBtn").textContent   = "▶ Play";
    document.getElementById("stormSlider").value     = 0;
    document.getElementById("timeLabel").textContent = "t = 0.00 min";
}

// ══════════════════════════════════════════
// PRINT REPORT
// ══════════════════════════════════════════
function printStormReport() {
    if (!lastHydroData) {
        alert("Please run a storm simulation first.");
        return;
    }

    const project   = document.title;
    const catchSel  = document.getElementById("catchmentSelect");
    const catchName = catchSel.options[catchSel.selectedIndex]?.text || "—";
    const location  = document.getElementById("stormLocation")?.value.trim() || "—";
    const tr        = intensityMode === "idf"
        ? document.getElementById("returnPeriod").value + "-Year"
        : "Custom";
    const depth     = round2(currentIntensity * currentTc / 60);

    // apply print theme, capture, restore
    applyPrintTheme(rainfallChart);
    applyPrintTheme(hydrographChart);
    applyPrintTheme(unitChart);
    applyPrintTheme(multiChart);

    const rainImg  = document.getElementById("rainfallChart").toDataURL();
    const hydroImg = document.getElementById("hydrographChart").toDataURL();
    const unitImg  = document.getElementById("unitChart").toDataURL();
    const multiImg = document.getElementById("multiChart").toDataURL();

    restoreDarkTheme(rainfallChart);
    restoreDarkTheme(hydrographChart);
    restoreDarkTheme(unitChart);
    restoreDarkTheme(multiChart);

    // multi-storm table rows
    let multiRows = "";
    if (lastMultiData && lastMultiData.series) {
        lastMultiData.series.forEach(s => {
            multiRows += `<tr>
                <td>${s.return_period}-Year</td>
                <td>${s.intensity}</td>
                <td>${s.Qp}</td>
            </tr>`;
        });
    }

    const content = `
    <html>
    <head>
        <title>${project} — Storm Simulation Report</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: Arial, sans-serif;
                color: #111;
                background: white;
                font-size: 11px;
            }

            .report-page {
                padding: 28px 44px 50px 44px;
                position: relative;
                min-height: 100vh;
            }

            .report-header {
                border-bottom: 2px solid #2b4a7a;
                padding-bottom: 10px;
                margin-bottom: 12px;
            }
            .report-header h1 { font-size: 16px; color: #1a2e4a; margin-bottom: 3px; }
            .report-header p  { font-size: 10px; color: #666; }

            .section-title {
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 0.07em;
                color: #555;
                margin-bottom: 6px;
                margin-top: 12px;
            }

            .param-box {
                display: flex;
                gap: 16px;
                flex-wrap: wrap;
                background: #f0f5ff;
                border: 1px solid #c8d8f0;
                border-radius: 5px;
                padding: 8px 14px;
                margin-bottom: 10px;
            }
            .param-box div    { font-size: 11px; color: #333; }
            .param-box strong { color: #1a4a8a; }

            /* ── CHARTS: fixed height to stay on one page ── */
            .chart-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                grid-template-rows: 320px 320px;
                gap: 10px;
                margin-bottom: 0;
            }

            .chart-box {
                border: 1px solid #dde;
                border-radius: 5px;
                padding: 6px 8px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .chart-box h4 {
                font-size: 9px;
                text-transform: uppercase;
                color: #555;
                letter-spacing: 0.06em;
                margin-bottom: 4px;
                flex-shrink: 0;
            }
            .chart-box img {
                width: 100%;
                flex: 1;
                object-fit: contain;
                display: block;
            }

            /* ── MULTI-STORM TABLE pushed down ── */
            .multi-section {
                margin-top: 32px;
            }

            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th {
                background: #dbe9f9;
                color: #1a2e4a;
                font-size: 9px;
                font-weight: bold;
                text-transform: uppercase;
                padding: 6px 10px;
                border: 1px solid #b0c8e8;
                text-align: left;
            }
            td { padding: 6px 10px; border: 1px solid #dde; color: #222; }
            tr:nth-child(even) td { background: #eaf3ff; }

            .page-footer {
                position: fixed;
                bottom: 16px;
                left: 44px;
                right: 44px;
                border-top: 1px solid #ccc;
                padding-top: 6px;
                font-size: 9px;
                color: #888;
                display: flex;
                justify-content: space-between;
            }

            @page { margin: 0; size: A4 portrait; }
            @media print {
                @page { margin: 0; size: A4 portrait; }
                th { background: #dbe9f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                tr:nth-child(even) td { background: #eaf3ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .param-box { background: #f0f5ff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
        </style>
    </head>
    <body>
    <div class="report-page">

        <div class="report-header">
            <h1>Storm Simulation Report</h1>
            <p>
                Location: <b>${location}</b>
                &nbsp;|&nbsp;
                Generated: ${new Date().toLocaleString()}
            </p>
        </div>

        <div class="section-title">Storm Parameters</div>
        <div class="param-box">
            <div><strong>Catchment:</strong> ${catchName}</div>
            <div><strong>Location:</strong> ${location}</div>
            <div><strong>Return Period:</strong> ${tr}</div>
            <div><strong>Intensity:</strong> ${currentIntensity} mm/hr</div>
            <div><strong>Tc:</strong> ${currentTc} min</div>
            <div><strong>C:</strong> ${currentC.toFixed(2)}</div>
            <div><strong>Rainfall Depth:</strong> ${depth} mm</div>
            <div><strong>Peak Flow (Qp):</strong> ${lastHydroData.Qp} m³/s</div>
            <div><strong>Unit Qp:</strong> ${lastUnitData?.Qp_unit || "—"} m³/s</div>
        </div>

        <div class="section-title">Charts</div>
        <div class="chart-grid">
            <div class="chart-box">
                <h4>Rainfall Profile</h4>
                <img src="${rainImg}">
            </div>
            <div class="chart-box">
                <h4>Hydrograph</h4>
                <img src="${hydroImg}">
            </div>
            <div class="chart-box">
                <h4>Unit Hydrograph</h4>
                <img src="${unitImg}">
            </div>
            <div class="chart-box">
                <h4>Multi-Storm Comparison</h4>
                <img src="${multiImg}">
            </div>
        </div>

        ${multiRows ? `
        <div class="multi-section">
            <div class="section-title">Multi-Storm Summary</div>
            <table>
                <thead>
                    <tr>
                        <th>Return Period</th>
                        <th>Intensity (mm/hr)</th>
                        <th>Peak Flow Qp (m³/s)</th>
                    </tr>
                </thead>
                <tbody>${multiRows}</tbody>
            </table>
        </div>` : ""}

        <div class="page-footer">
            <span>Storm Solver — Storm Simulation Report</span>
            <span>${location} &nbsp;|&nbsp; ${new Date().toLocaleDateString()}</span>
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

function applyPrintTheme(chart) {

    if (!chart) return;

    chart.options.plugins.legend.labels.color = "#000";

    chart.options.scales.x.title.color = "#000";
    chart.options.scales.y.title.color = "#000";

    chart.options.scales.x.ticks.color = "#000";
    chart.options.scales.y.ticks.color = "#000";

    chart.update();
}

function restoreDarkTheme(chart) {

    if (!chart) return;

    chart.options.plugins.legend.labels.color = "#fff";

    chart.options.scales.x.title.color = "#fff";
    chart.options.scales.y.title.color = "#fff";

    chart.options.scales.x.ticks.color = "#a0aec0";
    chart.options.scales.y.ticks.color = "#a0aec0";

    chart.update();
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function round2(v) { return Math.round(v * 100) / 100; }