// ============================================================
// index.js — Scryboard Landing Page
// ============================================================

function handleGenerate() {
    const input = document.getElementById('cube-id-input');
    const error = document.getElementById('input-error');
    const id    = input.value.trim();

    if (!id) {
        error.classList.remove('hidden');
        input.focus();
        return;
    }

    error.classList.add('hidden');
    window.location.href = `cube.html?cube=${encodeURIComponent(id)}`;
}

function loadExample(id) {
    window.location.href = `cube.html?cube=${encodeURIComponent(id)}`;
}

function toggleTooltip() {
    const tooltip = document.getElementById('help-tooltip');
    tooltip.classList.toggle('hidden');
}

// Allow Enter key to trigger generate
document.getElementById('cube-id-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGenerate();
});

// Close tooltip if clicking outside
document.addEventListener('click', (e) => {
    const tooltip = document.getElementById('help-tooltip');
    const trigger = document.querySelector('.help-trigger');
    if (!tooltip.contains(e.target) && e.target !== trigger) {
        tooltip.classList.add('hidden');
    }
});

// If URL already has a cube param, redirect immediately
const params = new URLSearchParams(window.location.search);
if (params.get('cube')) {
    window.location.href = `cube.html?cube=${encodeURIComponent(params.get('cube'))}`;
}
