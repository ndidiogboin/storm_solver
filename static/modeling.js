let chart;
let hydroPrintChart = null;
let unitPrintChart = null;
let runoffPrintChart = null;
let idfPrintChart = null;
let activeDataset = null;

function loadVisualization() {
    const index = document.getElementById("catchmentSelect").value;
    const mode = document.getElementById("vizMode").value;

    fetch(`/api/visualization/${mode}/${index}`)
    .then(res => res.json())
    .then(data => {

        const ctx = document.getElementById("chart").getContext("2d");
        if (chart) chart.destroy();

        const baseOptions = {
            responsive: true,
            plugins: {
                legend: {
                    labels: {
                        color: "#ffffff",
                        font: { size: 10, weight: "normal" },
                        boxWidth: 10,
                        boxHeight: 10,
                        padding: 8
                    },
                    onClick: function (e, legendItem, legend) {
                        const index = legendItem.datasetIndex;
                        const ci = legend.chart;
                        const meta = ci.getDatasetMeta(index);
                        meta.hidden = meta.hidden === null
                            ? !ci.data.datasets[index].hidden
                            : null;
                        ci.update();
                    },
                    onHover: function (event, legendItem, legend) {
                        const index = legendItem.datasetIndex;
                        const ci = legend.chart;
                        activeDataset = index;
                        ci.data.datasets.forEach((ds, i) => {
                            ds.borderWidth = (i === index) ? 3 : 1;
                            ds.opacity = (i === index) ? 1 : 0.3;
                        });
                        ci.update();
                    },
                    onLeave: function (event, legendItem, legend) {
                        const ci = legend.chart;
                        activeDataset = null;
                        ci.data.datasets.forEach(ds => {
                            ds.borderWidth = 1;
                            ds.opacity = 1;
                        });
                        ci.update();
                    }
                },
                
                zoom: {
                    pan: {
                        enabled: true,
                        mode: "xy"
                    },
                    zoom: {
                        wheel: {
                            enabled: true
                        },
                        pinch: {
                            enabled: true
                        },
                        drag: {
                            enabled: true,
                            backgroundColor: "rgba(37,99,235,0.15)"
                        },
                        mode: "xy"
                    }
                }

            },
            scales: {
                x: {
                    title: { display: true, text: "Time (min)", color: "#ffffff" },
                    ticks: { color: "#ffffff", font: { size: 12 } },
                    grid: { color: "#4e4f5a" }
                },
                y: {
                    title: { display: true, text: "Flow (m³/s)", color: "#ffffff" },
                    ticks: { color: "#ffffff", font: { size: 12 } },
                    grid: { color: "#4e4f5a" }
                }
            }
        };

        // ── HYDROGRAPH & UNIT HYDROGRAPH ──
        if (mode === "hydrograph" || mode === "unit") {
            document.getElementById("chartTitle").textContent =
                mode === "unit" ? "Unit Hydrograph" : "Hydrograph";

            chart = new Chart(ctx, {
                type: "line",
                data: {
                    labels: data.time,
                    datasets: [{
                        label: data.label || "Discharge (m³/s)",
                        data: data.flow,
                        borderColor: "hsla(12, 100%, 50%, 0.72)",
                        backgroundColor: "hsla(12, 100%, 50%, 0.1)",
                        fill: true,
                        tension: 0.25,
                        borderWidth: 1,
                        pointRadius: 0
                    }]
                },
                options: baseOptions
            });

        // ── RAINFALL-RUNOFF ──
        } else if (mode === "rainfall_runoff") {
            document.getElementById("chartTitle").textContent = "Rainfall–Runoff";

            chart = new Chart(ctx, {
                type: "line",
                data: {
                    labels: data.time,
                    datasets: [
                        {
                            label: "Rainfall Intensity (mm/hr)",
                            data: data.rainfall,
                            borderColor: "hsla(210, 100%, 60%, 0.9)",
                            backgroundColor: "hsla(210, 100%, 60%, 0.15)",
                            fill: true,
                            tension: 0.25,
                            borderWidth: 1,
                            pointRadius: 0,
                            yAxisID: "y"
                        },
                        {
                            label: "Runoff (mm/hr)",
                            data: data.runoff,
                            borderColor: "hsla(12, 100%, 50%, 0.9)",
                            backgroundColor: "hsla(12, 100%, 50%, 0.15)",
                            fill: true,
                            tension: 0.25,
                            borderWidth: 1,
                            pointRadius: 0,
                            yAxisID: "y"
                        }
                    ]
                },
                options: {
                    ...baseOptions,
                    scales: {
                        x: baseOptions.scales.x,
                        y: {
                            title: { display: true, text: "Intensity (mm/hr)", color: "#ffffff" },
                            ticks: { color: "#ffffff", font: { size: 12 } },
                            grid: { color: "#4e4f5a" }
                        }
                    }
                }
            });
        } 
        // ── IDF CURVES ──
        else if (mode === "idf") {

            document.getElementById("chartTitle").textContent =
                "Intensity-Duration-Frequency Curves";

            const colors = [
                "hsla(12, 100%, 50%, 0.9)",
                "hsla(210, 100%, 60%, 0.9)",
                "hsla(120, 60%, 50%, 0.9)",
                "hsla(45, 100%, 55%, 0.9)",
                "hsla(280, 70%, 60%, 0.9)",
                "hsla(180, 70%, 50%, 0.9)"
            ];

            const datasets = data.curves.map((curve, i) => ({

                label: `${curve.return_period}-Year`,

                data: curve.intensity,

                borderColor: colors[i % colors.length],

                backgroundColor:
                    colors[i % colors.length].replace("0.9", "0.08"),

                fill: false,

                tension: 0.25,
                borderWidth: 1,
                pointRadius: 0
            }));

            chart = new Chart(ctx, {

                type: "line",

                data: {
                    labels: data.duration,
                    datasets: datasets
                },

                options: {
                    ...baseOptions,

                    scales: {

                        x: {
                            title: {
                                display: true,
                                text: "Duration (minutes)",
                                color: "#ffffff"
                            },
                            ticks: {
                                color: "#ffffff"
                            },
                            grid: {
                                color: "#4e4f5a"
                            }
                        },

                        y: {
                            title: {
                                display: true,
                                text: "Intensity (mm/hr)",
                                color: "#ffffff"
                            },
                            ticks: {
                                color: "#ffffff"
                            },
                            grid: {
                                color: "#4e4f5a"
                            }
                        }
                    }
                }
            });
        }
    });
}

async function buildPrintCharts(index) {

    hydroPrintChart?.destroy();
    unitPrintChart?.destroy();
    runoffPrintChart?.destroy();
    idfPrintChart?.destroy();

    const hydro  = await fetch(`/api/visualization/hydrograph/${index}`).then(r => r.json());
    const unit   = await fetch(`/api/visualization/unit/${index}`).then(r => r.json());
    const runoff = await fetch(`/api/visualization/rainfall_runoff/${index}`).then(r => r.json());
    const idf    = await fetch(`/api/visualization/idf/${index}`).then(r => r.json());
 
    console.log(hydroPrintChart);
    console.log(unitPrintChart);
    console.log(runoffPrintChart);
    console.log(idfPrintChart);

    hydroPrintChart = new Chart(
        document.getElementById("hydroPrintChart"),
        {
            type: "line",
            data: {
                labels: hydro.time,
                datasets: [{
                    label: "Hydrograph",
                    data: hydro.flow,
                    borderColor: "#356111",
                    borderWidth: 0.8,
                    tension: 0,
                    backgroundColor: "rgba(166, 211, 83, 0.15)",
                    fill: true,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: false,
                animation: false,
                scales: {
                    x: {
                        grid: { color: "#b8b8b8", lineWidth: 0.6},
                        ticks: {color: "#000", font: { size: 10 }}
                    },

                    y: {
                        grid: {color: "#b8b8b8", lineWidth: 0.6},
                        ticks: {color: "#000", font: { size: 10 }}
                    }
                }
            }
        });

    unitPrintChart = new Chart(
        document.getElementById("unitPrintChart"),
        {
            type: "line",
            data: {
                labels: unit.time,
                datasets: [{
                    label: "Unit Hydrograph",
                    data: unit.flow,
                    borderColor: "#d9480f",
                    borderWidth: 0.8,
                    tension: 0,
                    backgroundColor: "rgba(217,72,15,.15)",
                    fill: true,
                    pointRadius: 0
                }]
            },
             options: {
                responsive: false,
                animation: false,
                scales: {
                    x: {
                        grid: { color: "#b8b8b8", lineWidth: 0.6},
                        ticks: {color: "#000", font: { size: 10 }}
                    },

                    y: {
                        grid: {color: "#b8b8b8", lineWidth: 0.6},
                        ticks: {color: "#000", font: { size: 10 }}
                    }
                }
            }
        });

    runoffPrintChart = new Chart(
        document.getElementById("runoffPrintChart"),
        {
            type: "line",
            data: {
                labels: runoff.time,
                datasets: [
                    {
                        label: "Rainfall",
                        data: runoff.rainfall,
                        borderColor: "#2563eb",
                        borderWidth: 0.8,
                        tension: 0,
                        backgroundColor: "rgba(37,99,235,0.20)",
                        fill: true,
                        pointRadius: 0
                    },
                    {
                        label: "Runoff",
                        data: runoff.runoff,
                        borderColor: "#d9480f",
                        borderWidth: 0.8,
                        tension: 0,
                        backgroundColor: "rgba(217,72,15,0.20)",
                        fill: true,
                        pointRadius: 0
                    }
                ]
            },
             options: {
                responsive: false,
                animation: false,
                scales: {
                    x: {
                        grid: { color: "#b8b8b8", lineWidth: 0.6},
                        ticks: {color: "#000", font: { size: 10 }}
                    },

                    y: {
                        grid: {color: "#b8b8b8", lineWidth: 0.6},
                        ticks: {color: "#000", font: { size: 10 }}
                    }
                }
            }
        });

    idfPrintChart = new Chart(
        document.getElementById("idfPrintChart"),
        {
            type: "line",
            data: {
                labels: idf.duration,
                datasets: idf.curves.map(c => ({
                    label: c.return_period + "-Year",
                    data: c.intensity,
                    borderWidth: 0.8,
                    tension: 0,
                    pointRadius: 0,
                    pointHoverRadius: 0
                }))
            }, 

             options: {
                responsive: false,
                animation: false,
                scales: {
                    x: {
                        grid: { color: "#b8b8b8", lineWidth: 0.6},
                        ticks: {color: "#000", font: { size: 10 }}
                    },

                    y: {
                        grid: {color: "#b8b8b8", lineWidth: 0.6},
                        ticks: {color: "#000", font: { size: 10 }, maxTicksLimit: 50}
                    }
                }
            }
        });

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function printModelingReport() {

    const index = document.getElementById("catchmentSelect").value;

    await buildPrintCharts(index);

    const hydroImg = document.getElementById("hydroPrintChart").toDataURL("image/png"); 
    const unitImg = document.getElementById("unitPrintChart").toDataURL("image/png");
    const runoffImg = document.getElementById("runoffPrintChart").toDataURL("image/png");
    const idfImg = document.getElementById("idfPrintChart").toDataURL("image/png");

    const catchment =
    document.getElementById("catchmentSelect").selectedOptions[0].text;

    const data = await fetch("/compute_q").then(r => r.json());

    const c = data.catchments[index];

    const manning = data.parameters.manning_n;
    const slope = data.parameters.slope;
    const tc = c.tc;
    const peakFlow = c.q;
    const intensity = c.intensity;

    // Next we build the report HTML
    const content = `
    <html>
    <head>
        <title>Storm Solver - Modeling Report</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: Arial, sans-serif;
                color: #111;
                background: white;
                font-size: 11px;
            }

            .report-page {
                padding: 55px 44px 50px 44px;
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
                height: 100%;
                object-fit: fill;
                display: block;
            }

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
            <h1>Modeling Report</h1>
            <p>
                 Generated: ${new Date().toLocaleString()}
            </p>
        </div>

        <div class="section-title">Model Parameters</div>

        <div class="param-box">
            <div><strong>Catchment:</strong> ${c.name}</div>
            <div><strong>Area:</strong> ${c.area} m²</div>
            <div><strong>Manning n:</strong> ${manning}</div>
            <div><strong>Channel Slope:</strong> ${slope}</div>
            <div><strong>Time of Concentration:</strong> ${tc} min</div>
            <div><strong>Peak Flow:</strong> ${peakFlow} m³/s</div>
            <div><strong>Rainfall Intensity:</strong> ${intensity} mm/hr</div>
        </div>

        <div class="section-title">Charts</div>
        <div class="chart-grid">

            <div class="chart-box">
                <h4>Hydrograph</h4>
                <img src="${hydroImg}">
            </div>

            <div class="chart-box">
                <h4>Unit Hydrograph</h4>
                <img src="${unitImg}">
            </div>

            <div class="chart-box">
                <h4>IDF Curves</h4>
                <img src="${idfImg}">
            </div>

            <div class="chart-box">
                <h4>Rainfall–Runoff</h4>
                <img src="${runoffImg}">
            </div>

        </div>

        <div class="page-footer">
            <span>Storm Solver — Modeling Report</span>
            <span>${c.name}</span>
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

document.getElementById("chart").addEventListener("dblclick", () => {
    if (chart) {
        chart.resetZoom();
    }
});

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


