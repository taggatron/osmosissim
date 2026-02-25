const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// --- Configuration ---
let width, height;
const waterCount = 450; // Total water molecules (more visible)
const waterRadius = 3;
const soluteRadius = 8;
const speed = 1; // Base speed for particles (Reduced from 2)
const membraneGapSize = 12; // Gaps in membrane
const membraneWidth = 6;
const stickyDistance = 25; // Distance to stick
const unstickChance = 0.005; // Chance to break free each frame
const maxWatersPerSolute = 6; // Binding capacity per solute (hydration shell limit)

// --- State ---
let particles = [];
let leftSoluteTarget = 10;
let rightSoluteTarget = 10;

// --- DOM Elements ---
const leftSlider = document.getElementById('leftSoluteSlider');
const rightSlider = document.getElementById('rightSoluteSlider');
const leftCountSpan = document.getElementById('leftSoluteCount');
const rightCountSpan = document.getElementById('rightSoluteCount');
const resetBtn = document.getElementById('resetBtn');

// --- Resize Handling ---
function resize() {
    // Get the display size of the canvas
    const rect = canvas.getBoundingClientRect();
    // Increase internal resolution for sharpness on retina screens
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    // Reset any previous scaling to avoid compounding transforms
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    // Adjust logic width/height to match CSS pixels (easier for math)
    width = rect.width;
    height = rect.height;

    // Preserve existing particle counts relative if needed, or just reset.
    // Given the simplicity, a reset is cleaner visually than squashing particles.
    initParticles();
}

// --- Classes ---
class Particle {
    constructor(type, x, y) {
        this.type = type; // 'water' or 'solute'
        this.x = x;
        this.y = y;
        this.radius = type === 'water' ? waterRadius : soluteRadius;
        this.color = type === 'water' ? '#3498db' : '#ff6b6b';
        
        // Random velocity
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        // Slower movement for heavy solute
        if (type === 'solute') {
            this.vx *= 0.5;
            this.vy *= 0.5;
        }

        // Per-solute binding capacity (how many waters can stick)
        if (type === 'solute') {
            this.boundCount = 0;
            this.maxBinds = maxWatersPerSolute;
        }

        // Binding state for hydration shells
        this.boundTo = null; // Reference to solute particle
        this.angleOffset = Math.random() * Math.PI * 2; // Where it sticks on the solute
    }

    update() {
        // If bound to a solute, follow it
        if (this.boundTo) {
            // Check if solute still exists (it might have been removed by slider)
            if (!particles.includes(this.boundTo)) {
                this.boundTo = null;
            } else {
                // Stick to solute surface
                const targetX = this.boundTo.x + Math.cos(this.angleOffset) * (soluteRadius + waterRadius + 2);
                const targetY = this.boundTo.y + Math.sin(this.angleOffset) * (soluteRadius + waterRadius + 2);
                
                // Ease towards position
                this.x += (targetX - this.x) * 0.2;
                this.y += (targetY - this.y) * 0.2;
                
                // Slowly rotate
                this.angleOffset += 0.05;

                // Random chance to unstick
                if (Math.random() < unstickChance) {
                    if (typeof this.boundTo.boundCount === 'number') {
                        this.boundTo.boundCount = Math.max(0, this.boundTo.boundCount - 1);
                    }
                    this.boundTo = null;
                    // Give it a kick away
                    this.vx = (Math.random() - 0.5) * speed * 2;
                    this.vy = (Math.random() - 0.5) * speed * 2;
                }
                
                return; // Skip normal movement physics
            }
        }

        // Normal movement when not bound
        this.x += this.vx;
        this.y += this.vy;

        // Wall Collisions
        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx *= -1;
        }
        if (this.x + this.radius > width) {
            this.x = width - this.radius;
            this.vx *= -1;
        }
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy *= -1;
        }
        if (this.y + this.radius > height) {
            this.y = height - this.radius;
            this.vy *= -1;
        }

        // Membrane Collision
        const membraneX = width / 2;
        const distToMembrane = Math.abs(this.x - membraneX);
        const hittingMembrane = distToMembrane < (this.radius + membraneWidth/2);
        
        // Only trigger collision if moving TOWARDS the membrane
        // If on left (x < mid) and moving right (vx > 0)
        // If on right (x > mid) and moving left (vx < 0)
        const movingTowards = (this.x < membraneX && this.vx > 0) || (this.x > membraneX && this.vx < 0);
        
        // Membrane only blocks SOLUTE. Water passes straight through.
        if (hittingMembrane && movingTowards && this.type === 'solute') {
            // Solute BLOCKED
            // Bounce back
            if (this.x < membraneX) {
                this.x = membraneX - membraneWidth/2 - this.radius - 1;
                this.vx = -Math.abs(this.vx);
            } else {
                this.x = membraneX + membraneWidth/2 + this.radius + 1;
                this.vx = Math.abs(this.vx);
            }
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        
        // Add a highlight reflection for "shiny" look
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Stroke for solute to make them pop
        if (this.type === 'solute') {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

// --- Initialization ---
function initParticles() {
    particles = [];
    
    // Add Water
    // Distribute evenly initially
    for (let i = 0; i < waterCount; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        particles.push(new Particle('water', x, y));
    }
    
    updateSolutes();
}

function updateSolutes() {
    // Current counts
    const currentLeft = particles.filter(p => p.type === 'solute' && p.x < width/2).length;
    const currentRight = particles.filter(p => p.type === 'solute' && p.x > width/2).length;
    
    // Adjust Left
    // Get ALL solutes currently on the left side
    const currentLeftSolutes = particles.filter(p => p.type === 'solute' && p.x < width/2);
    const currentLeftCount = currentLeftSolutes.length;
    
    if (currentLeftCount < leftSoluteTarget) {
        for (let i = 0; i < leftSoluteTarget - currentLeftCount; i++) {
            particles.push(new Particle('solute', Math.random() * (width/2 - 20), Math.random() * height));
        }
    } else if (currentLeftCount > leftSoluteTarget) {
        let toRemove = currentLeftCount - leftSoluteTarget;
        // Ideally remove the oldest or random ones from the left side
        // Iterate backwards through main array to safely splice
        for (let i = particles.length - 1; i >= 0; i--) {
            if (toRemove > 0 && particles[i].type === 'solute' && particles[i].x < width/2) {
                particles.splice(i, 1);
                toRemove--;
            }
        }
    }

    // Adjust Right
    const currentRightSolutes = particles.filter(p => p.type === 'solute' && p.x > width/2);
    const currentRightCount = currentRightSolutes.length;

    if (currentRightCount < rightSoluteTarget) {
        for (let i = 0; i < rightSoluteTarget - currentRightCount; i++) {
            particles.push(new Particle('solute', (width/2 + 20) + Math.random() * (width/2 - 30), Math.random() * height));
        }
    } else if (currentRightCount > rightSoluteTarget) {
        let toRemove = currentRightCount - rightSoluteTarget;
        for (let i = particles.length - 1; i >= 0; i--) {
            if (toRemove > 0 && particles[i].type === 'solute' && particles[i].x > width/2) {
                particles.splice(i, 1);
                toRemove--;
            }
        }
    }
}

// --- Animation Loop ---
function animate() {
    ctx.clearRect(0, 0, width, height);

    // Draw Membrane
    ctx.fillStyle = '#bdc3c7';
    const membraneX = width / 2;
    
    // Draw dashed line for membrane
    // Make it look more porous: larger gaps, smaller solid sections
    const membranePeriod = membraneGapSize * 3;
    const gapHeight = membraneGapSize * 2; // 2/3 of the membrane is gap
    const solidHeight = membranePeriod - gapHeight; // 1/3 solid
    for (let y = 0; y < height; y += membranePeriod) {
        ctx.fillRect(membraneX - membraneWidth/2, y + gapHeight, membraneWidth, solidHeight);
    }
    
    // Separate water from solutes for layering (draw solutes on top)
    const waterParticles = [];
    const soluteParticles = [];

    particles.forEach(p => {
        p.update();
        if(p.type === 'solute') soluteParticles.push(p);
        else waterParticles.push(p);
    });

    // Draw water first
    waterParticles.forEach(p => p.draw());
    // Draw solutes on top
    soluteParticles.forEach(p => p.draw());

    // --- Interaction Physics: Hydration Shells ---
    // Make water stick to solutes
    waterParticles.forEach(water => {
        if (!water.boundTo) {
            // Check against all solutes
            for (let solute of soluteParticles) {
                // Only allow so many waters to stick to each solute
                if (typeof solute.boundCount === 'number' && typeof solute.maxBinds === 'number') {
                    if (solute.boundCount >= solute.maxBinds) continue;
                }

                const dx = water.x - solute.x;
                const dy = water.y - solute.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                // If close enough, stick!
                // Don't stick if it's already crossing the membrane roughly
                if (dist < stickyDistance) {
                    // Check if they are on same side of membrane to avoid sticking through wall
                    const mid = width/2;
                    if ((water.x < mid && solute.x < mid) || (water.x > mid && solute.x > mid)) {
                         water.boundTo = solute;
                         // Calculate initial angle so it doesn't snap weirdly
                         water.angleOffset = Math.atan2(dy, dx);
                         if (typeof solute.boundCount === 'number') {
                             solute.boundCount += 1;
                         }
                         break; // Bound to one, stop checking
                    }
                }
            }
        }
    });

    // Calculate Water Balance (water level indicators)
    // We use current positions every frame, so bars match where the water actually is.
    const leftWater = waterParticles.filter(p => p.x < width/2).length;
    const rightWater = waterParticles.filter(p => p.x > width/2).length;
    
    // Update bars
    const totalWater = waterParticles.length;
    // Prevent divide by zero
    if (totalWater > 0) {
        const leftPercent = (leftWater / totalWater) * 100;
        const rightPercent = (rightWater / totalWater) * 100;

        const leftBar = document.getElementById('leftWaterBar');
        const rightBar = document.getElementById('rightWaterBar');
        // Smooth the UI a bit so it doesn't jitter
        const smoothValue = (current, target) => current + (target - current) * 0.12;
        if (leftBar && rightBar) {
            const currentLeft = parseFloat(leftBar.style.width || '50') || 50;
            const nextLeft = Math.max(0, Math.min(100, smoothValue(currentLeft, leftPercent)));
            leftBar.style.width = nextLeft.toFixed(1) + '%';
            rightBar.style.width = (100 - nextLeft).toFixed(1) + '%';
        } else {
            if (leftBar) {
                const currentLeft = parseFloat(leftBar.style.width || '50') || 50;
                const nextLeft = Math.max(0, Math.min(100, smoothValue(currentLeft, leftPercent)));
                leftBar.style.width = nextLeft.toFixed(1) + '%';
            }
            if (rightBar) {
                const currentRight = parseFloat(rightBar.style.width || '50') || 50;
                const nextRight = Math.max(0, Math.min(100, smoothValue(currentRight, rightPercent)));
                rightBar.style.width = nextRight.toFixed(1) + '%';
            }
        }
        
        // Optional: color change if unbalanced
        // ...
    }

    requestAnimationFrame(animate);
}

// --- Event Listeners ---
leftSlider.addEventListener('input', (e) => {
    leftSoluteTarget = parseInt(e.target.value);
    leftCountSpan.textContent = leftSoluteTarget;
    updateSolutes();
});

rightSlider.addEventListener('input', (e) => {
    rightSoluteTarget = parseInt(e.target.value);
    rightCountSpan.textContent = rightSoluteTarget;
    updateSolutes();
});

resetBtn.addEventListener('click', () => {
    leftSoluteTarget = 10;
    rightSoluteTarget = 10;
    leftSlider.value = 10;
    rightSlider.value = 10;
    leftCountSpan.textContent = 10;
    rightCountSpan.textContent = 10;
    initParticles();
});

window.addEventListener('resize', resize);

// Start
resize();
animate();