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

const osmosisCanvas = document.getElementById('osmosisCanvas');
const osmosisLeftSlider = document.getElementById('osmosisLeftSoluteSlider');
const osmosisRightSlider = document.getElementById('osmosisRightSoluteSlider');
const osmosisLeftCount = document.getElementById('osmosisLeftSoluteCount');
const osmosisRightCount = document.getElementById('osmosisRightSoluteCount');
const osmosisResetBtn = document.getElementById('osmosisResetBtn');
const osmosisLeftWaterBar = document.getElementById('osmosisLeftWaterBar');
const osmosisRightWaterBar = document.getElementById('osmosisRightWaterBar');
const osmosisLeftSideLabel = document.getElementById('osmosisLeftSideLabel');
const osmosisRightSideLabel = document.getElementById('osmosisRightSideLabel');
const osmosisSummary = document.getElementById('osmosisSummary');

const state = {
    isotonicPoint: parseFloat(isotonicSlider.value),
    beakers: [],
    chart: null,
    running: false,
    startTime: 0,
    rafId: null
};

const OSMOSIS_CONFIG = {
    waterCount: 420,
    waterRadius: 2.8,
    soluteRadius: 7,
    speed: 0.95,
    membraneGapSize: 12,
    membraneWidth: 6,
    stickyDistance: 22,
    unstickChance: 0.004,
    maxWatersPerSolute: 6
};

const osmosisState = {
    particles: [],
    width: 0,
    height: 0,
    ctx: null,
    leftSoluteTarget: 10,
    rightSoluteTarget: 10,
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
        return 'Water into tissue';
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

class OsmosisParticle {
    constructor(type, x, y) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.radius = type === 'water' ? OSMOSIS_CONFIG.waterRadius : OSMOSIS_CONFIG.soluteRadius;
        this.color = type === 'water' ? '#2b9fc6' : '#f08f52';

        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * OSMOSIS_CONFIG.speed;
        this.vy = Math.sin(angle) * OSMOSIS_CONFIG.speed;

        if (type === 'solute') {
            this.vx *= 0.55;
            this.vy *= 0.55;
            this.boundCount = 0;
            this.maxBinds = OSMOSIS_CONFIG.maxWatersPerSolute;
        }

        this.boundTo = null;
        this.angleOffset = Math.random() * Math.PI * 2;
    }

    update(sim) {
        if (this.boundTo) {
            if (!sim.particles.includes(this.boundTo)) {
                this.boundTo = null;
            } else {
                const targetX =
                    this.boundTo.x + Math.cos(this.angleOffset) * (OSMOSIS_CONFIG.soluteRadius + OSMOSIS_CONFIG.waterRadius + 2);
                const targetY =
                    this.boundTo.y + Math.sin(this.angleOffset) * (OSMOSIS_CONFIG.soluteRadius + OSMOSIS_CONFIG.waterRadius + 2);

                this.x += (targetX - this.x) * 0.24;
                this.y += (targetY - this.y) * 0.24;
                this.angleOffset += 0.045;

                if (Math.random() < OSMOSIS_CONFIG.unstickChance) {
                    if (typeof this.boundTo.boundCount === 'number') {
                        this.boundTo.boundCount = Math.max(0, this.boundTo.boundCount - 1);
                    }
                    this.boundTo = null;
                    this.vx = (Math.random() - 0.5) * OSMOSIS_CONFIG.speed * 2;
                    this.vy = (Math.random() - 0.5) * OSMOSIS_CONFIG.speed * 2;
                }

                return;
            }
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx *= -1;
        }
        if (this.x + this.radius > sim.width) {
            this.x = sim.width - this.radius;
            this.vx *= -1;
        }
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy *= -1;
        }
        if (this.y + this.radius > sim.height) {
            this.y = sim.height - this.radius;
            this.vy *= -1;
        }

        const membraneX = sim.width / 2;
        const distToMembrane = Math.abs(this.x - membraneX);
        const touchingMembrane = distToMembrane < this.radius + OSMOSIS_CONFIG.membraneWidth / 2;
        const movingTowards =
            (this.x < membraneX && this.vx > 0) ||
            (this.x > membraneX && this.vx < 0);

        if (this.type === 'solute' && touchingMembrane && movingTowards) {
            if (this.x < membraneX) {
                this.x = membraneX - OSMOSIS_CONFIG.membraneWidth / 2 - this.radius - 1;
                this.vx = -Math.abs(this.vx);
            } else {
                this.x = membraneX + OSMOSIS_CONFIG.membraneWidth / 2 + this.radius + 1;
                this.vx = Math.abs(this.vx);
            }
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(
            this.x - this.radius * 0.35,
            this.y - this.radius * 0.35,
            this.radius * 0.35,
            0,
            Math.PI * 2
        );
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fill();

        if (this.type === 'solute') {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
}

function updateOsmosisBars(leftWater, rightWater) {
    const totalWater = leftWater + rightWater;
    if (!totalWater || !osmosisLeftWaterBar || !osmosisRightWaterBar) {
        return;
    }

    const targetLeft = (leftWater / totalWater) * 100;
    const currentLeft = parseFloat(osmosisLeftWaterBar.style.width || '50') || 50;
    const smoothedLeft = currentLeft + (targetLeft - currentLeft) * 0.12;
    const boundedLeft = clamp(smoothedLeft, 0, 100);

    osmosisLeftWaterBar.style.width = `${boundedLeft.toFixed(1)}%`;
    osmosisRightWaterBar.style.width = `${(100 - boundedLeft).toFixed(1)}%`;
}

function updateOsmosisSummary() {
    const left = osmosisState.leftSoluteTarget;
    const right = osmosisState.rightSoluteTarget;
    const difference = Math.abs(left - right);

    if (left === right) {
        if (osmosisLeftSideLabel) {
            osmosisLeftSideLabel.textContent = 'Equal Concentration';
        }
        if (osmosisRightSideLabel) {
            osmosisRightSideLabel.textContent = 'Equal Concentration';
        }

        if (osmosisSummary) {
            osmosisSummary.textContent =
                'Both sides have equal solute concentration, so water moves both ways but there is no net movement.';
        }
        return;
    }

    if (left > right) {
        if (osmosisLeftSideLabel) {
            osmosisLeftSideLabel.textContent = 'Concentrated Side';
        }
        if (osmosisRightSideLabel) {
            osmosisRightSideLabel.textContent = 'Dilute Side';
        }

        if (osmosisSummary) {
            osmosisSummary.textContent =
                `Left side is more concentrated (${difference} higher solute units, lower water potential), so net water movement is from right to left until conditions become closer to equilibrium.`;
        }
        return;
    }

    if (osmosisLeftSideLabel) {
        osmosisLeftSideLabel.textContent = 'Dilute Side';
    }
    if (osmosisRightSideLabel) {
        osmosisRightSideLabel.textContent = 'Concentrated Side';
    }

    if (!osmosisSummary) {
        return;
    }

    osmosisSummary.textContent =
        `Right side is more concentrated (${difference} higher solute units, lower water potential), so net water movement is from left to right until conditions become closer to equilibrium.`;
}

function drawOsmosisMembrane() {
    const { ctx, width, height } = osmosisState;
    const membraneX = width / 2;
    const membranePeriod = OSMOSIS_CONFIG.membraneGapSize * 3;
    const gapHeight = OSMOSIS_CONFIG.membraneGapSize * 2;
    const solidHeight = membranePeriod - gapHeight;

    ctx.fillStyle = 'rgba(96, 120, 149, 0.85)';
    for (let y = 0; y < height; y += membranePeriod) {
        ctx.fillRect(
            membraneX - OSMOSIS_CONFIG.membraneWidth / 2,
            y + gapHeight,
            OSMOSIS_CONFIG.membraneWidth,
            solidHeight
        );
    }
}

function updateOsmosisHydration(waterParticles, soluteParticles) {
    waterParticles.forEach((water) => {
        if (water.boundTo) {
            return;
        }

        for (let i = 0; i < soluteParticles.length; i += 1) {
            const solute = soluteParticles[i];

            if (typeof solute.boundCount === 'number' && solute.boundCount >= solute.maxBinds) {
                continue;
            }

            const dx = water.x - solute.x;
            const dy = water.y - solute.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance >= OSMOSIS_CONFIG.stickyDistance) {
                continue;
            }

            const mid = osmosisState.width / 2;
            const sameSide =
                (water.x < mid && solute.x < mid) ||
                (water.x > mid && solute.x > mid);

            if (sameSide) {
                water.boundTo = solute;
                water.angleOffset = Math.atan2(dy, dx);
                solute.boundCount += 1;
                break;
            }
        }
    });
}

function updateOsmosisSolutes() {
    const half = osmosisState.width / 2;
    if (!half) {
        return;
    }

    const leftSolutes = osmosisState.particles.filter(
        (particle) => particle.type === 'solute' && particle.x < half
    );
    const rightSolutes = osmosisState.particles.filter(
        (particle) => particle.type === 'solute' && particle.x > half
    );

    if (leftSolutes.length < osmosisState.leftSoluteTarget) {
        for (let i = 0; i < osmosisState.leftSoluteTarget - leftSolutes.length; i += 1) {
            osmosisState.particles.push(
                new OsmosisParticle(
                    'solute',
                    Math.random() * (half - 16),
                    Math.random() * osmosisState.height
                )
            );
        }
    } else if (leftSolutes.length > osmosisState.leftSoluteTarget) {
        let toRemove = leftSolutes.length - osmosisState.leftSoluteTarget;
        for (let i = osmosisState.particles.length - 1; i >= 0 && toRemove > 0; i -= 1) {
            const particle = osmosisState.particles[i];
            if (particle.type === 'solute' && particle.x < half) {
                osmosisState.particles.splice(i, 1);
                toRemove -= 1;
            }
        }
    }

    if (rightSolutes.length < osmosisState.rightSoluteTarget) {
        for (let i = 0; i < osmosisState.rightSoluteTarget - rightSolutes.length; i += 1) {
            osmosisState.particles.push(
                new OsmosisParticle(
                    'solute',
                    half + 16 + Math.random() * (half - 28),
                    Math.random() * osmosisState.height
                )
            );
        }
    } else if (rightSolutes.length > osmosisState.rightSoluteTarget) {
        let toRemove = rightSolutes.length - osmosisState.rightSoluteTarget;
        for (let i = osmosisState.particles.length - 1; i >= 0 && toRemove > 0; i -= 1) {
            const particle = osmosisState.particles[i];
            if (particle.type === 'solute' && particle.x > half) {
                osmosisState.particles.splice(i, 1);
                toRemove -= 1;
            }
        }
    }
}

function initializeOsmosisParticles() {
    osmosisState.particles = [];

    for (let i = 0; i < OSMOSIS_CONFIG.waterCount; i += 1) {
        osmosisState.particles.push(
            new OsmosisParticle(
                'water',
                Math.random() * osmosisState.width,
                Math.random() * osmosisState.height
            )
        );
    }

    updateOsmosisSolutes();
}

function animateOsmosis() {
    const { ctx, width, height } = osmosisState;
    if (!ctx || !width || !height) {
        return;
    }

    ctx.clearRect(0, 0, width, height);
    drawOsmosisMembrane();

    const waterParticles = [];
    const soluteParticles = [];

    osmosisState.particles.forEach((particle) => {
        particle.update(osmosisState);
        if (particle.type === 'water') {
            waterParticles.push(particle);
        } else {
            soluteParticles.push(particle);
        }
    });

    updateOsmosisHydration(waterParticles, soluteParticles);

    waterParticles.forEach((particle) => particle.draw(ctx));
    soluteParticles.forEach((particle) => particle.draw(ctx));

    const half = width / 2;
    const leftWater = waterParticles.filter((particle) => particle.x < half).length;
    const rightWater = waterParticles.length - leftWater;
    updateOsmosisBars(leftWater, rightWater);

    osmosisState.rafId = window.requestAnimationFrame(animateOsmosis);
}

function resetOsmosisDemo() {
    osmosisState.leftSoluteTarget = 10;
    osmosisState.rightSoluteTarget = 10;

    if (osmosisLeftSlider && osmosisRightSlider) {
        osmosisLeftSlider.value = '10';
        osmosisRightSlider.value = '10';
    }
    if (osmosisLeftCount && osmosisRightCount) {
        osmosisLeftCount.textContent = '10';
        osmosisRightCount.textContent = '10';
    }

    updateOsmosisSummary();

    initializeOsmosisParticles();
    if (osmosisLeftWaterBar && osmosisRightWaterBar) {
        osmosisLeftWaterBar.style.width = '50%';
        osmosisRightWaterBar.style.width = '50%';
    }
}

function resizeOsmosisCanvas() {
    if (!osmosisCanvas || !osmosisState.ctx) {
        return;
    }

    const rect = osmosisCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
        return;
    }

    const dpr = window.devicePixelRatio || 1;
    osmosisCanvas.width = Math.round(rect.width * dpr);
    osmosisCanvas.height = Math.round(rect.height * dpr);
    osmosisState.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    osmosisState.width = rect.width;
    osmosisState.height = rect.height;

    initializeOsmosisParticles();
}

function initOsmosisSim() {
    if (
        !osmosisCanvas ||
        !osmosisLeftSlider ||
        !osmosisRightSlider ||
        !osmosisLeftCount ||
        !osmosisRightCount ||
        !osmosisResetBtn
    ) {
        return;
    }

    osmosisState.ctx = osmosisCanvas.getContext('2d');
    resizeOsmosisCanvas();

    osmosisLeftSlider.addEventListener('input', (event) => {
        osmosisState.leftSoluteTarget = parseInt(event.target.value, 10);
        osmosisLeftCount.textContent = String(osmosisState.leftSoluteTarget);
        updateOsmosisSolutes();
        updateOsmosisSummary();
    });

    osmosisRightSlider.addEventListener('input', (event) => {
        osmosisState.rightSoluteTarget = parseInt(event.target.value, 10);
        osmosisRightCount.textContent = String(osmosisState.rightSoluteTarget);
        updateOsmosisSolutes();
        updateOsmosisSummary();
    });

    osmosisResetBtn.addEventListener('click', resetOsmosisDemo);
    window.addEventListener('resize', resizeOsmosisCanvas);

    if (osmosisState.rafId) {
        window.cancelAnimationFrame(osmosisState.rafId);
    }

    updateOsmosisSummary();
    animateOsmosis();
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
    initOsmosisSim();
}

init();