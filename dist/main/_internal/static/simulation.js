// static/simulation.js

let simData      = null;
let simChart     = null;
let currentFrame = 0;
let playing      = false;
let animInterval = null;
let currentMode  = "animation";

const TEXT_COLOR = "#e2e8f0";

const FLOW_COLORS = [
    "hsla(12,  100%, 50%, 0.9)",
    "hsla(210, 100%, 60%, 0.9)",
    "hsla(120,  60%, 50%, 0.9)",
    "hsla(45,  100%, 55%, 0.9)",
    "hsla(280,  70%, 60%, 0.9)",
    "hsla(180,  70%, 50%, 0.9)"
];

// ══════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════
function runSimulation() {
    currentMode = document.getElementById("simMode").value;

    document.getElementById("simTitle").textContent = {
        animation: "Network Animation — Hydraulic Cross-Sections",
        timestep:  "Flow Time-Series",
        combined:  "Combined View — Flood Spread",
        network:   "Network Map — Drainage Schematic"
    }[currentMode] || "Simulation";

    // gather selected catchments (checkboxes in the left panel)
    const allChecks = document.querySelectorAll(".simCatchCheck");
    const checked    = document.querySelectorAll(".simCatchCheck:checked");

    if (allChecks.length && checked.length === 0) {
        alert("Please select at least one catchment to simulate.");
        return;
    }

    // only send the filter if the user actually deselected something —
    // omitting it entirely when everything is checked keeps the request
    // identical to current behavior (simulate all catchments)
    let url = `/api/simulation/${currentMode}`;
    if (allChecks.length && checked.length < allChecks.length) {
        const indices = Array.from(checked).map(cb => cb.value).join(",");
        url += `?catchments=${indices}`;
    }

    fetch(url)
        .then(res => res.json())
        .then(data => {
            simData = data;
            resetPlayback();

            if (currentMode === "network") {
                renderNetworkMap(data.network);
                hideChartStrip();
                hideStats();
                drawMiniNetwork(data.network);

            } else if (currentMode === "animation") {
                prepareAnimation(data);
                hideChartStrip();
                showStats();
                if (data.nodes) drawMiniNetwork(data);

            } else if (currentMode === "timestep") {
                renderFullTimestepChart(data.timestep);
                hideStats();
                clearAnimCanvas();
                drawMiniNetwork(data.network);

            } else if (currentMode === "combined") {
                prepareCombinedAnimation(data.animation);
                renderTimestepChartStrip(data.timestep);
                showStats();
                drawMiniNetwork(data.network);
            }
        });
}

// ══════════════════════════════════════════
// MODE 1 — NETWORK MAP (engineering schematic)
// ══════════════════════════════════════════
function renderNetworkMap(net) {
    if (!net) return;
    const canvas = document.getElementById("animCanvas");
    resizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // white/grey background grid
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // subtle grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const nodes = net.nodes || [];
    const links = net.links || [];
    if (!nodes.length) {
        ctx.fillStyle = "#4a5568";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No catchments to display", canvas.width / 2, canvas.height / 2);
        return;
    }

    const { posMap, sx, sy } = scalePositions(nodes, canvas.width, canvas.height, 100, 80);

    // draw links as engineering arrows
    links.forEach(lk => {
        const from = posMap[lk.from];
        const to   = posMap[lk.to];
        if (!from || !to) return;

        // channel line
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = "#4a90d9";
        ctx.lineWidth   = 2.5;
        ctx.setLineDash([]);
        ctx.stroke();

        // arrowhead at midpoint
        const mx    = (from.x + to.x) / 2;
        const my    = (from.y + to.y) / 2;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(-5,  5);
        ctx.closePath();
        ctx.fillStyle = "#4a90d9";
        ctx.fill();
        ctx.restore();

        // flow label on link
        const flow = lk.flow !== undefined ? lk.flow.toFixed(4) : "";
        if (flow) {
            ctx.save();
            ctx.translate(mx, my);
            ctx.fillStyle = "rgba(13,17,23,0.7)";
            ctx.fillRect(-24, -18, 48, 14);
            ctx.fillStyle = "#63b3ed";
            ctx.font      = "9px monospace";
            ctx.textAlign = "center";
            ctx.fillText(`${flow} m³/s`, 0, -7);
            ctx.restore();
        }
    });

    // draw nodes as engineering circles with labels
    nodes.forEach((node, idx) => {
        const pos = posMap[node.index];
        if (!pos) return;

        const R  = 22;
        const qp = node.q || 0;

        // outer ring
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
        ctx.strokeStyle = "#4a90d9";
        ctx.lineWidth   = 2;
        ctx.fillStyle   = "#1a2535";
        ctx.fill();
        ctx.stroke();

        // inner fill
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R - 4, 0, Math.PI * 2);
        ctx.fillStyle = "#0d1c2e";
        ctx.fill();

        // index number
        ctx.fillStyle   = "#63b3ed";
        ctx.font        = "bold 11px monospace";
        ctx.textAlign   = "center";
        ctx.fillText(`C${node.index + 1}`, pos.x, pos.y + 4);

        // name label above
        ctx.fillStyle = "#e2e8f0";
        ctx.font      = "bold 10px sans-serif";
        ctx.fillText(node.name, pos.x, pos.y - R - 10);

        // Q below
        ctx.fillStyle = "#68d391";
        ctx.font      = "9px monospace";
        ctx.fillText(`Q=${qp} m³/s`, pos.x, pos.y + R + 12);

        // Tc
        ctx.fillStyle = "#f6ad55";
        ctx.font      = "9px monospace";
        ctx.fillText(`Tc=${node.tc || "—"} min`, pos.x, pos.y + R + 23);
    });

    // legend
    ctx.fillStyle = "rgba(13,17,23,0.85)";
    ctx.fillRect(10, canvas.height - 60, 180, 50);
    ctx.strokeStyle = "#3d4e63";
    ctx.lineWidth   = 1;
    ctx.strokeRect(10, canvas.height - 60, 180, 50);

    ctx.fillStyle = "#a0aec0";
    ctx.font      = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("● Node = Catchment outlet", 18, canvas.height - 42);
    ctx.fillStyle = "#4a90d9";
    ctx.fillText("→ Link = Flow direction", 18, canvas.height - 28);
    ctx.fillStyle = "#68d391";
    ctx.fillText("Q = Cumulative peak flow", 18, canvas.height - 14);
}

// ══════════════════════════════════════════
// MODE 2 — FLOW TIME-SERIES (full chart, no canvas)
// ══════════════════════════════════════════
function renderFullTimestepChart(tsData) {
    if (!tsData) return;

    // hide canvas, give full space to chart
    document.getElementById("animArea").style.display  = "none";
    document.getElementById("chartStrip").style.display = "block";
    document.getElementById("chartStrip").style.height  = "100%";
    document.getElementById("chartStrip").style.flex    = "1";

    const ctx = document.getElementById("simChart").getContext("2d");
    if (simChart) simChart.destroy();

    const datasets = (tsData.series || []).map((s, i) => ({
        label:           `${s.name} — Qp=${s.Qp} m³/s | Tc=${s.Tc} min`,
        data:            s.flow,
        borderColor:     FLOW_COLORS[i % FLOW_COLORS.length],
        backgroundColor: FLOW_COLORS[i % FLOW_COLORS.length].replace("0.9", "0.08"),
        fill:            true,
        tension:         0.3,
        pointRadius:     0,
        borderWidth:     2
    }));

    simChart = new Chart(ctx, {
        type: "line",
        data: { labels: tsData.time, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    position: "top",
                    labels: { color: "#e2e8f0", font: { size: 11 }, boxWidth: 12, padding: 10 }
                },
                tooltip: {
                    mode: "index",
                    intersect: false,
                    callbacks: {
                        label: ctx => `${ctx.dataset.label.split("—")[0].trim()}: ${ctx.parsed.y.toFixed(5)} m³/s`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: "Time (min)", color: "#e2e8f0", font: { size: 12 } },
                    ticks: { color: "#a0aec0", font: { size: 10 }, maxTicksLimit: 12 },
                    grid:  { color: "#2d3748" }
                },
                y: {
                    title: { display: true, text: "Flow (m³/s)", color: "#e2e8f0", font: { size: 12 } },
                    ticks: { color: "#a0aec0", font: { size: 10 } },
                    grid:  { color: "#2d3748" }
                }
            },
            interaction: { mode: "nearest", axis: "x", intersect: false }
        }
    });

    // setup slider as time cursor
    const slider = document.getElementById("timeSlider");
    slider.max   = (tsData.time || []).length - 1;
    slider.value = 0;

    slider.oninput = function () {
        const idx = parseInt(this.value);
        const t   = tsData.time[idx];
        document.getElementById("timeLabel").textContent = `t = ${t ? t.toFixed(2) : "0.00"} min`;
        // draw vertical cursor line
        if (simChart) {
            simChart.data.datasets.forEach(ds => { ds.borderWidth = 2; });
            simChart.update("none");
        }
    };
}

// ══════════════════════════════════════════
// MODE 3 — NETWORK ANIMATION (hydraulic cross-sections)
// ══════════════════════════════════════════
function prepareAnimation(animData) {
    if (!animData) return;

    document.getElementById("animArea").style.display   = "block";
    document.getElementById("animArea").style.flex      = "1";
    document.getElementById("chartStrip").style.display = "none";

    const frames = animData.frames || [];
    const slider = document.getElementById("timeSlider");
    slider.max   = Math.max(frames.length - 1, 0);
    slider.value = 0;
    currentFrame = 0;

    document.getElementById("statMax").textContent = animData.max_flow || "—";
    renderCrossSectionFrame(animData, 0);

    slider.oninput = function () {
        currentFrame = parseInt(this.value);
        renderCrossSectionFrame(animData, currentFrame);
    };
}

function renderCrossSectionFrame(animData, frameIndex) {
    const frames = animData.frames || [];
    if (!frames.length) return;

    const frame  = frames[Math.min(frameIndex, frames.length - 1)];
    const canvas = document.getElementById("animCanvas");
    resizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawCrossSectionScene(ctx, frame.nodes, frame.links, canvas.width, canvas.height);

    document.getElementById("timeLabel").textContent = `t = ${frame.time.toFixed(2)} min`;
    document.getElementById("statTime").textContent  = frame.time.toFixed(2);
    document.getElementById("timeSlider").value      = frameIndex;

    if (frame.nodes && frame.nodes.length) {
        const peak = frame.nodes.reduce((a, b) => b.q > a.q ? b : a);
        document.getElementById("statPeak").textContent = `${peak.name} (${peak.q} m³/s)`;
    }
}

function drawCrossSectionScene(ctx, nodes, links, W, H) {
    if (!nodes || !nodes.length) {
        ctx.fillStyle = "#4a5568";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No catchments to display", W / 2, H / 2);
        return;
    }

    const { posMap } = scalePositions(nodes, W, H, 110, 90);

    // draw channels
    (links || []).forEach(lk => {
        const from = posMap[lk.from];
        const to   = posMap[lk.to];
        if (!from || !to) return;
        drawChannel(ctx, from, to, lk.fill_ratio || 0, lk.wave_pos || 0);
    });

    // draw cross-sections
    nodes.forEach(node => {
        const pos = posMap[node.index];
        if (!pos) return;
        drawCrossSection(ctx, pos.x, pos.y, node);
    });
}

// ══════════════════════════════════════════
// MODE 4 — COMBINED VIEW (bird's-eye flood spread + chart)
// ══════════════════════════════════════════
function prepareCombinedAnimation(animData) {
    if (!animData) return;

    document.getElementById("animArea").style.display = "block";
    document.getElementById("animArea").style.flex    = "1";

    const frames = animData.frames || [];
    const slider = document.getElementById("timeSlider");
    slider.max   = Math.max(frames.length - 1, 0);
    slider.value = 0;
    currentFrame = 0;

    document.getElementById("statMax").textContent = animData.max_flow || "—";
    renderFloodSpreadFrame(animData, 0);

    slider.oninput = function () {
        currentFrame = parseInt(this.value);
        renderFloodSpreadFrame(animData, currentFrame);
    };
}

function renderFloodSpreadFrame(animData, frameIndex) {
    const frames = animData.frames || [];
    if (!frames.length) return;

    const frame  = frames[Math.min(frameIndex, frames.length - 1)];
    const canvas = document.getElementById("animCanvas");
    resizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawFloodSpreadScene(ctx, frame.nodes, frame.links, canvas.width, canvas.height, animData.max_flow);

    document.getElementById("timeLabel").textContent = `t = ${frame.time.toFixed(2)} min`;
    document.getElementById("statTime").textContent  = frame.time.toFixed(2);
    document.getElementById("timeSlider").value      = frameIndex;

    if (frame.nodes && frame.nodes.length) {
        const peak = frame.nodes.reduce((a, b) => b.q > a.q ? b : a);
        document.getElementById("statPeak").textContent = `${peak.name} (${peak.q} m³/s)`;
    }
}

function drawFloodSpreadScene(ctx, nodes, links, W, H, maxFlow) {
    if (!nodes || !nodes.length) return;

    const { posMap } = scalePositions(nodes, W, H, 100, 80);

    // draw links as thick coloured pipes
    (links || []).forEach(lk => {
        const from = posMap[lk.from];
        const to   = posMap[lk.to];
        if (!from || !to) return;

        const fill  = lk.fill_ratio || 0;
        const wave  = lk.wave_pos  || 0;
        const thick = 4 + fill * 14;

        // pipe body
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = flowColor(fill);
        ctx.lineWidth   = thick;
        ctx.lineCap     = "round";
        ctx.stroke();

        // pipe outline
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth   = thick + 2;
        ctx.stroke();

        // wave particle
        if (fill > 0.02) {
            const dx  = to.x - from.x;
            const dy  = to.y - from.y;
            const px  = from.x + dx * wave;
            const py  = from.y + dy * wave;

            ctx.beginPath();
            ctx.arc(px, py, 4 + fill * 4, 0, Math.PI * 2);
            ctx.fillStyle   = "rgba(255,255,255,0.9)";
            ctx.shadowColor = "rgba(100,220,255,1)";
            ctx.shadowBlur  = 12;
            ctx.fill();
            ctx.shadowBlur  = 0;
        }
    });

    // draw nodes as pulsing circles
    nodes.forEach(node => {
        const pos       = posMap[node.index];
        if (!pos) return;

        const intensity = node.intensity || 0;
        const q         = node.q || 0;
        const R         = 16 + intensity * 20;

        // glow
        if (intensity > 0.05) {
            const glow = ctx.createRadialGradient(pos.x, pos.y, R * 0.3, pos.x, pos.y, R * 3);
            glow.addColorStop(0, `rgba(237,100,50,${intensity * 0.4})`);
            glow.addColorStop(1, "rgba(237,100,50,0)");
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, R * 3, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();
        }

        // circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, R, 0, Math.PI * 2);
        ctx.fillStyle   = flowColor(intensity);
        ctx.shadowColor = flowColor(intensity);
        ctx.shadowBlur  = intensity * 15;
        ctx.fill();
        ctx.shadowBlur  = 0;

        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // label
        ctx.fillStyle = "#ffffff";
        ctx.font      = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.name, pos.x, pos.y - R - 6);

        // flow
        ctx.fillStyle = flowColor(intensity);
        ctx.font      = "9px monospace";
        ctx.fillText(`${q} m³/s`, pos.x, pos.y + 3);

        // fill %
        if (intensity > 0) {
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.font      = "8px sans-serif";
            ctx.fillText(`${Math.round(intensity * 100)}%`, pos.x, pos.y + R + 12);
        }
    });

    // colour legend
    const lx = W - 110, ly = 14;
    ctx.fillStyle = "rgba(13,17,23,0.8)";
    ctx.fillRect(lx - 8, ly - 10, 110, 80);

    ctx.font      = "8px sans-serif";
    ctx.textAlign = "left";
    const legend  = [
        { color: flowColor(0.1),  label: "Low flow"      },
        { color: flowColor(0.4),  label: "Moderate flow" },
        { color: flowColor(0.7),  label: "High flow"     },
        { color: flowColor(0.95), label: "Near capacity" }
    ];
    legend.forEach((l, i) => {
        ctx.fillStyle = l.color;
        ctx.fillRect(lx, ly + i * 16, 12, 10);
        ctx.fillStyle = "#a0aec0";
        ctx.fillText(l.label, lx + 16, ly + i * 16 + 9);
    });
}

function renderTimestepChartStrip(tsData) {
    if (!tsData) return;
    document.getElementById("chartStrip").style.display  = "block";
    document.getElementById("chartStrip").style.height   = "200px";
    document.getElementById("chartStrip").style.flex     = "";

    const ctx = document.getElementById("simChart").getContext("2d");
    if (simChart) simChart.destroy();

    const datasets = (tsData.series || []).map((s, i) => ({
        label:           `${s.name} (Qp=${s.Qp} m³/s)`,
        data:            s.flow,
        borderColor:     FLOW_COLORS[i % FLOW_COLORS.length],
        backgroundColor: FLOW_COLORS[i % FLOW_COLORS.length].replace("0.9", "0.06"),
        fill:            false,
        tension:         0.3,
        pointRadius:     0,
        borderWidth:     1.5
    }));

    simChart = new Chart(ctx, {
        type: "line",
        data: { labels: tsData.time, datasets },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { labels: { color: "#fff", font: { size: 9 }, boxWidth: 8, padding: 6 } } },
            scales: {
                x: { title: { display: true, text: "Time (min)", color: "#fff" },
                     ticks: { color: "#a0aec0", font: { size: 9 }, maxTicksLimit: 10 },
                     grid:  { color: "#2d3748" } },
                y: { title: { display: true, text: "Flow (m³/s)", color: "#fff" },
                     ticks: { color: "#a0aec0", font: { size: 9 } },
                     grid:  { color: "#2d3748" } }
            }
        }
    });
}

// ══════════════════════════════════════════
// SHARED: CHANNEL LINK (used in animation mode)
// ══════════════════════════════════════════
function drawChannel(ctx, from, to, fillRatio, wavePos) {
    const dx    = to.x - from.x;
    const dy    = to.y - from.y;
    const len   = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const CW    = 14;

    ctx.save();
    ctx.translate(from.x, from.y);
    ctx.rotate(angle);

    ctx.fillStyle = "#1a2535";
    ctx.fillRect(0, -CW, len, CW * 2);

    ctx.strokeStyle = "#4a6080";
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, -CW); ctx.lineTo(len, -CW);
    ctx.moveTo(0,  CW); ctx.lineTo(len,  CW);
    ctx.stroke();

    if (fillRatio > 0) {
        const wH = CW * 2 * fillRatio;
        const wY = CW - wH;
        ctx.fillStyle = flowColor(fillRatio);
        ctx.fillRect(0, wY, len, wH);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, wY); ctx.lineTo(len, wY);
        ctx.stroke();
    }

    if (fillRatio > 0.02) {
        const px = wavePos * len;
        const wH = CW * 2 * fillRatio;
        const wY = CW - wH;
        ctx.beginPath();
        ctx.arc(px, wY + wH * 0.5, 3.5, 0, Math.PI * 2);
        ctx.fillStyle   = "rgba(255,255,255,0.85)";
        ctx.shadowColor = "rgba(100,200,255,0.9)";
        ctx.shadowBlur  = 6;
        ctx.fill();
        ctx.shadowBlur  = 0;
    }

    ctx.save();
    ctx.translate(len / 2, 0);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-8, -4); ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fillStyle = "rgba(150,200,255,0.5)";
    ctx.fill();
    ctx.restore();
    ctx.restore();
}

// ══════════════════════════════════════════
// SHARED: CROSS-SECTION NODE (used in animation mode)
// ══════════════════════════════════════════
function drawCrossSection(ctx, cx, cy, node) {
    const stype      = node.section_type;
    const fillRatio  = node.fill_ratio  || 0;
    const waterDepth = node.water_depth || 0;
    const dFull      = node.d_full      || 0;
    const b          = node.b           || 0;
    const a          = node.a           || b;
    const q          = node.q           || 0;

    const SCALE = 30;
    const drawD = Math.max(dFull * SCALE, 20);
    const drawW = Math.max(b * SCALE * 0.6, 40);
    const drawA = Math.max(a * SCALE * 0.6, 30);

    const left   = cx - drawW / 2;
    const right  = cx + drawW / 2;
    const top    = cy - drawD / 2;
    const bottom = cy + drawD / 2;

    ctx.strokeStyle = "#718096";
    ctx.lineWidth   = 2;
    ctx.fillStyle   = "#0d1117";

    if (!stype || stype === "Rectangular") {
        ctx.beginPath();
        ctx.moveTo(left, top); ctx.lineTo(left, bottom);
        ctx.lineTo(right, bottom); ctx.lineTo(right, top);
        ctx.stroke();
        ctx.fillRect(left, top, drawW, drawD);

        if (fillRatio > 0) {
            const wh   = drawD * fillRatio;
            const wTop = bottom - wh;
            ctx.fillStyle = flowColor(fillRatio);
            ctx.fillRect(left + 1, wTop, drawW - 2, wh);
            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(left + 1, wTop); ctx.lineTo(right - 1, wTop);
            ctx.stroke();
        }
    } else {
        const aW    = Math.max(drawA, 20);
        const slope = (drawW - aW) / 2;
        ctx.beginPath();
        ctx.moveTo(cx - aW / 2, bottom); ctx.lineTo(left, top);
        ctx.moveTo(cx + aW / 2, bottom); ctx.lineTo(right, top);
        ctx.moveTo(cx - aW / 2, bottom); ctx.lineTo(cx + aW / 2, bottom);
        ctx.stroke();
        ctx.fillStyle = "#0d1117";
        ctx.beginPath();
        ctx.moveTo(cx - aW / 2, bottom); ctx.lineTo(left, top);
        ctx.lineTo(right, top); ctx.lineTo(cx + aW / 2, bottom);
        ctx.closePath(); ctx.fill();

        if (fillRatio > 0) {
            const wh     = drawD * fillRatio;
            const wTop   = bottom - wh;
            const wSlope = slope * fillRatio;
            ctx.fillStyle = flowColor(fillRatio);
            ctx.beginPath();
            ctx.moveTo(cx - aW / 2, bottom);
            ctx.lineTo(cx - aW / 2 - wSlope, wTop);
            ctx.lineTo(cx + aW / 2 + wSlope, wTop);
            ctx.lineTo(cx + aW / 2, bottom);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(cx - aW / 2 - wSlope, wTop);
            ctx.lineTo(cx + aW / 2 + wSlope, wTop);
            ctx.stroke();
        }
    }

    if (dFull > 0 && waterDepth > 0) {
        const depthPx = drawD * fillRatio;
        ctx.fillStyle = "rgba(100,200,255,0.8)";
        ctx.font      = "9px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${waterDepth.toFixed(2)}m`, right + 5, bottom - depthPx / 2 + 3);
    }

    ctx.fillStyle = TEXT_COLOR;
    ctx.font      = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(node.name, cx, top - 14);

    ctx.fillStyle = flowColor(fillRatio);
    ctx.font      = "10px sans-serif";
    ctx.fillText(`${q} m³/s`, cx, top - 4);

    if (fillRatio > 0) {
        ctx.fillStyle = "rgba(200,200,200,0.6)";
        ctx.font      = "9px sans-serif";
        ctx.fillText(`${Math.round(fillRatio * 100)}%`, cx, bottom + 12);
    }
}

// ══════════════════════════════════════════
// FLOW COLOUR
// ══════════════════════════════════════════
function flowColor(ratio) {
    if (ratio <= 0)   return "rgba(30, 80, 180, 0.7)";
    if (ratio < 0.3)  return `rgba(30, ${Math.round(80 + ratio * 300)}, 220, 0.8)`;
    if (ratio < 0.6)  return `rgba(${Math.round(30 + ratio * 300)}, 180, ${Math.round(220 - ratio * 300)}, 0.85)`;
    if (ratio < 0.85) return `rgba(230, ${Math.round(160 - ratio * 100)}, 30, 0.9)`;
    return "rgba(220, 40, 40, 0.95)";
}

// ══════════════════════════════════════════
// MINI NETWORK — left panel
// ══════════════════════════════════════════
function drawMiniNetwork(net) {
    if (!net) return;
    const canvas = document.getElementById("networkCanvas");
    resizeCanvas(canvas);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const nodes = (net.nodes || []).map(n => ({ ...n, fill_ratio: 0, water_depth: 0, intensity: 0 }));
    const links = (net.links || []).map(l => ({ ...l, fill_ratio: 0, wave_pos: 0 }));

    if (!nodes.length) return;
    const { posMap } = scalePositions(nodes, canvas.width, canvas.height, 30, 30);

    // links
    links.forEach(lk => {
        const f = posMap[lk.from], t = posMap[lk.to];
        if (!f || !t) return;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = "#4a90d9";
        ctx.lineWidth   = 1.5;
        ctx.stroke();
    });

    // nodes
    nodes.forEach(node => {
        const pos = posMap[node.index];
        if (!pos) return;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        ctx.fillStyle   = "#1a2535";
        ctx.strokeStyle = "#4a90d9";
        ctx.lineWidth   = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#a0aec0";
        ctx.font      = "7px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`C${node.index + 1}`, pos.x, pos.y + 3);
    });
}

// ══════════════════════════════════════════
// SHARED POSITION SCALER
// ══════════════════════════════════════════
function scalePositions(nodes, W, H, padX, padY) {
    const allX   = nodes.map(n => n.x);
    const allY   = nodes.map(n => n.y);
    const minX   = Math.min(...allX), maxX = Math.max(...allX);
    const minY   = Math.min(...allY), maxY = Math.max(...allY);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    function sx(x) { return padX + ((x - minX) / rangeX) * (W - padX * 2); }
    function sy(y) { return padY + ((y - minY) / rangeY) * (H - padY * 2); }

    const posMap = {};
    nodes.forEach(n => { posMap[n.index] = { x: sx(n.x), y: sy(n.y) }; });

    return { posMap, sx, sy };
}

// ══════════════════════════════════════════
// PLAYBACK
// ══════════════════════════════════════════
function togglePlay() {
    playing = !playing;
    document.getElementById("playBtn").textContent = playing ? "⏸ Pause" : "▶ Play";

    if (playing) {
        const speed = parseInt(document.getElementById("speedSelect").value);

        animInterval = setInterval(() => {
            if (!simData) return;

            if (currentMode === "animation") {
                const frames = (simData.frames || []);
                if (!frames.length) return;
                currentFrame = (currentFrame + 1) % frames.length;
                renderCrossSectionFrame(simData, currentFrame);

            } else if (currentMode === "combined") {
                const frames = (simData.animation?.frames || []);
                if (!frames.length) return;
                currentFrame = (currentFrame + 1) % frames.length;
                renderFloodSpreadFrame(simData.animation, currentFrame);

            } else if (currentMode === "timestep") {
                const slider = document.getElementById("timeSlider");
                const max    = parseInt(slider.max) || 0;
                currentFrame = (currentFrame + 1) % (max + 1);
                slider.value = currentFrame;
                slider.dispatchEvent(new Event("input"));
            }

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
    document.getElementById("timeSlider").value      = 0;
    document.getElementById("timeLabel").textContent = "t = 0.00 min";
    // restore animArea visibility
    document.getElementById("animArea").style.display = "block";
    document.getElementById("animArea").style.flex    = "1";
    document.getElementById("chartStrip").style.height = "220px";
    document.getElementById("chartStrip").style.flex   = "";
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════
function resizeCanvas(canvas) {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}

function hideChartStrip() { document.getElementById("chartStrip").style.display = "none"; }
function showStats()       { document.getElementById("statsBar").style.display  = "flex"; }
function hideStats()       { document.getElementById("statsBar").style.display  = "none"; }

function clearAnimCanvas() {
    const c = document.getElementById("animCanvas");
    resizeCanvas(c);
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
}

window.addEventListener("resize", () => {
    if (!simData) return;
    if (currentMode === "network")   renderNetworkMap(simData.network);
    if (currentMode === "animation") renderCrossSectionFrame(simData, currentFrame);
    if (currentMode === "combined")  renderFloodSpreadFrame(simData.animation, currentFrame);
    const net = simData.network || (simData.nodes ? simData : null);
    if (net) drawMiniNetwork(net);
});
