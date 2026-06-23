// ============================================================
//  gt-utils.js  —  Pure utilities, geometry, modals, PWA
// ============================================================
'use strict';

function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function addDays(d, n) {
    const dt = new Date(d);
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
}

function daysBetween(a, b) { return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000)); }

function daysSince(d) { return daysBetween(d, todayStr()); }

function fmtDate(s) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function calcAreaHa(geometry) {
    if (!geometry) return 0;
    if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.reduce((sum, ring) => sum + calcAreaHa({ type: 'Polygon', coordinates: ring }), 0);
    }
    if (geometry.type !== 'Polygon') return 0;
    const coords = geometry.coordinates[0];
    const R = 6378137; // Updated to standard WGS84 Earth radius
    let area = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i],
            p2 = coords[i + 1];
        area += (p2[0] - p1[0]) * (2 + Math.sin(p1[1] * Math.PI / 180) + Math.sin(p2[1] * Math.PI / 180));
    }
    return Math.abs(area * R * R / 2 / 1000000) * 0.00017453292519943295; // Result in Hectares
}

function download(filename, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

function setStatus(msg) {
    const el = document.getElementById('statusMsg');
    if (el) el.textContent = msg;
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

document.querySelectorAll('.overlay').forEach(el => {
    el.addEventListener('click', e => {
        if (e.target !== el) return;
        el.style.display = 'none';
        if (el.id === 'modalName') cancelDraw();
        if (el.id === 'modalAutoSplit') asDestroyMap();
    });
});

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none');
    if (typeof currentTool !== 'undefined' && currentTool === 'draw') cancelDraw();
    if (typeof asDestroyMap !== 'undefined') asDestroyMap();
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    const b = document.getElementById('installBanner');
    if (b) b.classList.add('show');
});

function installApp() {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.then(() => {
        deferredInstall = null;
        const b = document.getElementById('installBanner');
        if (b) b.classList.remove('show');
    });
}