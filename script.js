const concentrations = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
const PRACTICAL_HOURS = 24;
const RUN_DURATION_MS = 9000;

const isotonicSlider = document.getElementById('isotonicSlider');
const isotonicValue = document.getElementById('isotonicValue');
const runBtn = document.getElementById('runBtn');
const resetBtn = document.getElementById('resetBtn');
const timeLabel = document.getElementById('timeLabel');
const runState = document.getElementById('runState');
const timelineBar = document.getElementById('timelineBar');
const beakerGrid = document.getElementById('beakerGrid');
const resultsBody = document.getElementById('resultsBody');
const summaryText = document.getElementById('summaryText');
const chartCanvas = document.getElementById('resultsChart');

const state = {
    isotonicPoint: parseFloat(isotonicSlider.value),
    beakers: [],
    chart: null,
    running: false,
    startTime: 0,
    rafId: null
};

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

function formatMass(value) {
    return `${value.toFixed(2)} g`;
}

function formatPercent(value) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function calculatePercentChange(initialMass, currentMass) {
    return ((currentMass - initialMass) / initialMass) * 100;
}

function colorForConcentration(concentration) {
    const ratio = concentration / concentrations[concentrations.length - 1];
    const hue = 197 + ratio * 20;
    const sat = 58 + ratio * 10;
    const lightStrong = 74 - ratio * 20;
    const lightSoft = 88 - ratio * 14;
    return {
        soft: `hsl(${hue} ${sat}% ${lightSoft}%)`,
        strong: `hsl(${hue} ${sat}% ${lightStrong}%)`
    };
}

function movementLabel(percentChange) {
    if (percentChange > 0.35) {
        return 'Water entered tissue';
    }
    if (percentChange < -0.35) {
        return 'Water left tissue';
    }
    return 'Near isotonic';
}

function changeClass(percentChange) {
    if (percentChange > 0.12) {
        return 'positive';
    }
    if (percentChange < -0.12) {
        return 'negative';
    }
    return 'neutral';
}

function modeledPercentChange(concentration, isotonicPoint) {
    const difference = isotonicPoint - concentration;
    const linearComponent = difference * 24;
    const curveComponent = difference * Math.abs(difference) * 8;
    const noise = randomRange(-0.7, 0.7);
    return clamp(linearComponent + curveComponent + noise, -24, 18);
}

function createBeakerCard(concentration) {
    const card = document.createElement('article');
    card.className = 'beaker-card';

    const color = colorForConcentration(concentration);

    card.innerHTML = `
        <h3 class="beaker-title">${concentration.toFixed(2)} mol/dm3</h3>
        <div class="beaker-visual">
            <div class="solution" style="--fill-soft: ${color.soft}; --fill-strong: ${color.strong};">
                <span class="bubble b1"></span>
                <span class="bubble b2"></span>
                <span class="bubble b3"></span>
                <div class="potato-cylinder"></div>
            </div>
        </div>
        <div class="mass-readings">
            <p class="mass-line">Initial: <strong data-field="initial">5.00 g</strong></p>
            <p class="mass-line">Current: <strong data-field="current">5.00 g</strong></p>
            <p class="mass-line">Final: <strong data-field="final">-</strong></p>
        </div>
        <div class="change-row">
            <span class="change-pill neutral" data-field="percent">+0.00%</span>
            <span class="direction-indicator" data-field="direction">Ready</span>
        </div>
    `;

    const refs = {
        card,
        cylinder: card.querySelector('.potato-cylinder'),
        initial: card.querySelector('[data-field="initial"]'),
        current: card.querySelector('[data-field="current"]'),
        final: card.querySelector('[data-field="final"]'),
        percent: card.querySelector('[data-field="percent"]'),
        direction: card.querySelector('[data-field="direction"]')
    };

    beakerGrid.appendChild(card);
    return refs;
}

function initializeBeakers() {
    beakerGrid.innerHTML = '';
    state.beakers = concentrations.map((concentration) => {
        const refs = createBeakerCard(concentration);
        return {
            concentration,
            refs,
            initialMass: 0,
            finalMass: 0,
            currentMass: 0,
            targetPercent: 0
        };
    });
}

function prepareScenario(options = { regenerateInitialMass: true }) {
    state.beakers.forEach((beaker) => {
        if (options.regenerateInitialMass || beaker.initialMass === 0) {
            beaker.initialMass = randomRange(4.8, 5.25);
        }

        beaker.targetPercent = modeledPercentChange(beaker.concentration, state.isotonicPoint);
        beaker.finalMass = beaker.initialMass * (1 + beaker.targetPercent / 100);
        beaker.currentMass = beaker.initialMass;
    });
}

function renderBeaker(beaker, progress, showFinal) {
    const eased = easeInOutSine(progress);
    beaker.currentMass =
        beaker.initialMass + (beaker.finalMass - beaker.initialMass) * eased;

    const currentPercent = calculatePercentChange(beaker.initialMass, beaker.currentMass);
    const relativeScale = clamp(beaker.currentMass / beaker.initialMass, 0.72, 1.28);
    const widthScale = clamp(0.94 + (relativeScale - 1) * 0.45, 0.84, 1.16);

    beaker.refs.cylinder.style.transform =
        `translateX(-50%) scaleX(${widthScale.toFixed(3)}) scaleY(${relativeScale.toFixed(3)})`;
    beaker.refs.initial.textContent = formatMass(beaker.initialMass);
    beaker.refs.current.textContent = formatMass(beaker.currentMass);
    beaker.refs.final.textContent = showFinal ? formatMass(beaker.finalMass) : '-';
    beaker.refs.percent.textContent = formatPercent(currentPercent);
    beaker.refs.percent.className = `change-pill ${changeClass(currentPercent)}`;
    beaker.refs.direction.textContent = movementLabel(currentPercent);
}

function renderAllBeakers(progress, showFinal) {
    state.beakers.forEach((beaker) => renderBeaker(beaker, progress, showFinal));
}

function renderResultsTable(showFinal) {
    resultsBody.innerHTML = '';

    state.beakers.forEach((beaker) => {
        const percent = calculatePercentChange(beaker.initialMass, beaker.currentMass);
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${beaker.concentration.toFixed(2)}</td>
            <td>${beaker.initialMass.toFixed(2)}</td>
            <td>${showFinal ? beaker.finalMass.toFixed(2) : beaker.currentMass.toFixed(2)}</td>
            <td>${percent.toFixed(2)}</td>
        `;

        resultsBody.appendChild(row);
    });
}

function getCurrentPoints() {
    return state.beakers.map((beaker) => ({
        x: Number(beaker.concentration.toFixed(2)),
        y: Number(calculatePercentChange(beaker.initialMass, beaker.currentMass).toFixed(3))
    }));
}

function linearRegression(points) {
    const n = points.length;
    if (n < 2) {
        return null;
    }

    const sums = points.reduce(
        (acc, point) => {
            acc.x += point.x;
            acc.y += point.y;
            acc.xy += point.x * point.y;
            acc.xx += point.x * point.x;
            return acc;
        },
        { x: 0, y: 0, xy: 0, xx: 0 }
    );

    const denominator = n * sums.xx - sums.x * sums.x;
    if (Math.abs(denominator) < 1e-8) {
        return null;
    }

    const slope = (n * sums.xy - sums.x * sums.y) / denominator;
    const intercept = (sums.y - slope * sums.x) / n;
    return { slope, intercept };
}

function updateChart(showTrend) {
    const points = getCurrentPoints();
    state.chart.data.datasets[0].data = points;

    if (!showTrend) {
        state.chart.data.datasets[1].data = [];
        state.chart.update('none');
        return;
    }

    const regression = linearRegression(points);
    if (!regression) {
        state.chart.data.datasets[1].data = [];
        state.chart.update('none');
        return;
    }

    const minX = concentrations[0];
    const maxX = concentrations[concentrations.length - 1];
    state.chart.data.datasets[1].data = [
        { x: minX, y: regression.slope * minX + regression.intercept },
        { x: maxX, y: regression.slope * maxX + regression.intercept }
    ];

    state.chart.update('none');
}

function updateSummaryAfterRun() {
    const points = getCurrentPoints();
    const regression = linearRegression(points);

    if (!regression || Math.abs(regression.slope) < 1e-8) {
        summaryText.textContent = 'No clear isotonic crossing was detected in this run.';
        return;
    }

    const estimatedIsotonic = -regression.intercept / regression.slope;
    const inRange =
        estimatedIsotonic >= concentrations[0] &&
        estimatedIsotonic <= concentrations[concentrations.length - 1];

    if (inRange) {
        summaryText.textContent = `Estimated isotonic concentration from the line of best fit: ${estimatedIsotonic.toFixed(2)} mol/dm3.`;
    } else {
        summaryText.textContent =
            `Best-fit isotonic estimate (${estimatedIsotonic.toFixed(2)} mol/dm3) lies outside the tested range.`;
    }
}

function resetVisualProgress() {
    timelineBar.style.width = '0%';
    timeLabel.textContent = 'Time elapsed: 0 h';
    runState.textContent = 'Ready';
    document.body.classList.remove('running');
}

function finishRun() {
    state.running = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Run Again';

    renderAllBeakers(1, true);
    renderResultsTable(true);
    updateChart(true);

    timelineBar.style.width = '100%';
    timeLabel.textContent = `Time elapsed: ${PRACTICAL_HOURS} h`;
    runState.textContent = 'Complete';
    document.body.classList.remove('running');

    updateSummaryAfterRun();
}

function runFrame(timestamp) {
    if (!state.running) {
        return;
    }

    const elapsed = timestamp - state.startTime;
    const progress = clamp(elapsed / RUN_DURATION_MS, 0, 1);
    const hour = progress * PRACTICAL_HOURS;

    renderAllBeakers(progress, progress >= 1);
    renderResultsTable(progress >= 1);
    updateChart(progress > 0.06);

    timelineBar.style.width = `${(progress * 100).toFixed(1)}%`;
    timeLabel.textContent = `Time elapsed: ${hour.toFixed(1)} h`;
    runState.textContent = 'Diffusing...';

    if (progress >= 1) {
        finishRun();
        return;
    }

    state.rafId = window.requestAnimationFrame(runFrame);
}

function startRun() {
    if (state.running) {
        return;
    }

    state.running = true;
    state.startTime = performance.now();
    runBtn.disabled = true;
    runBtn.textContent = 'Running...';
    runState.textContent = 'Diffusing...';
    document.body.classList.add('running');
    summaryText.textContent = 'Practical running: collecting mass changes over 24 simulated hours.';

    state.rafId = window.requestAnimationFrame(runFrame);
}

function resetExperiment() {
    if (state.rafId) {
        window.cancelAnimationFrame(state.rafId);
        state.rafId = null;
    }

    state.running = false;
    runBtn.disabled = false;
    runBtn.textContent = 'Start 24h Practical';

    prepareScenario({ regenerateInitialMass: true });
    renderAllBeakers(0, false);
    renderResultsTable(false);
    updateChart(false);
    resetVisualProgress();
    summaryText.textContent = 'Run the practical to generate data points and a trend line.';
}

function createChart() {
    state.chart = new Chart(chartCanvas, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: '% change in mass',
                    data: [],
                    backgroundColor: '#0f9bb8',
                    borderColor: '#0f9bb8',
                    pointRadius: 5,
                    pointHoverRadius: 6,
                    showLine: false
                },
                {
                    label: 'Line of best fit',
                    type: 'line',
                    data: [],
                    borderColor: '#f0932b',
                    borderWidth: 2,
                    borderDash: [7, 6],
                    pointRadius: 0,
                    tension: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    labels: {
                        usePointStyle: true,
                        boxWidth: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const x = context.parsed.x.toFixed(2);
                            const y = context.parsed.y.toFixed(2);
                            return `${x} mol/dm3, ${y}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: 1,
                    ticks: {
                        stepSize: 0.2,
                        callback(value) {
                            return Number(value).toFixed(1);
                        }
                    },
                    grid: {
                        color: '#e2eaf4'
                    },
                    title: {
                        display: true,
                        text: 'Sucrose concentration (mol/dm3)'
                    }
                },
                y: {
                    suggestedMin: -22,
                    suggestedMax: 18,
                    ticks: {
                        callback(value) {
                            return `${value}%`;
                        }
                    },
                    grid: {
                        color(context) {
                            return context.tick.value === 0 ? '#9fb3c8' : '#e2eaf4';
                        },
                        lineWidth(context) {
                            return context.tick.value === 0 ? 2 : 1;
                        }
                    },
                    title: {
                        display: true,
                        text: '% change in mass'
                    }
                }
            }
        }
    });
}

function onIsotonicInput(event) {
    state.isotonicPoint = parseFloat(event.target.value);
    isotonicValue.textContent = state.isotonicPoint.toFixed(2);

    if (state.running) {
        return;
    }

    prepareScenario({ regenerateInitialMass: false });
    renderAllBeakers(0, false);
    renderResultsTable(false);
    updateChart(false);
    summaryText.textContent = 'Isotonic estimate updated. Start the practical to collect new results.';
}

function setupEvents() {
    runBtn.addEventListener('click', startRun);
    resetBtn.addEventListener('click', resetExperiment);
    isotonicSlider.addEventListener('input', onIsotonicInput);
}

function init() {
    initializeBeakers();
    createChart();
    setupEvents();
    resetExperiment();
}

init();