// ============================================================
//  gt-rain.js  —  Dynamic Rest Targets from Rainfall
//
//  How it works:
//  • Caches 14-day rainfall from Open-Meteo (1-hour TTL)
//  • Computes a drought extension for every field based on
//    how far below the "adequate rain" threshold the farm is
//  • getEffectiveRestTarget(field) → adjusted day count
//  • getRainStatus() → { total14, deficit, extensionDays, label, cls }
//  • Exposes refreshRainCache() for manual/scheduled refresh
//
//  Config (stored in gt_config):
//    droughtThreshMm  — 14-day total considered "adequate" (default 20)
//    droughtSensitivity — extra days per mm of deficit (default 1.0)
//    droughtMaxExtPct — cap extension as % of base target (default 50)
//    dynamicRestEnabled — master on/off switch (default true)
// ============================================================
'use strict';

const RAIN_CACHE_KEY  = 'gt_rain_cache';
const RAIN_CACHE_TTL  = 60 * 60 * 1000; // 1 hour in ms

// ── Config helpers ────────────────────────────────────────────
function getRainConfig() {
    try {
        const cfg = JSON.parse(localStorage.getItem('gt_config') || '{}');
        return {
            enabled:      cfg.dynamicRestEnabled !== false,   // default true
            threshMm:     cfg.droughtThreshMm     ?? 20,
            sensitivity:  cfg.droughtSensitivity  ?? 1.0,
            maxExtPct:    cfg.droughtMaxExtPct     ?? 50
        };
    } catch (e) {
        return { enabled: true, threshMm: 20, sensitivity: 1.0, maxExtPct: 50 };
    }
}

function saveRainConfig(patch) {
    try {
        const cfg = JSON.parse(localStorage.getItem('gt_config') || '{}');
        Object.assign(cfg, patch);
        localStorage.setItem('gt_config', JSON.stringify(cfg));
    } catch (e) {}
}

// ── Rainfall cache ────────────────────────────────────────────
function _getRainCache() {
    try {
        const raw = localStorage.getItem(RAIN_CACHE_KEY);
        if (!raw) return null;
        const c = JSON.parse(raw);
        if (Date.now() - c.fetchedAt > RAIN_CACHE_TTL) return null;
        return c;
    } catch (e) { return null; }
}

function _setRainCache(data) {
    try {
        localStorage.setItem(RAIN_CACHE_KEY, JSON.stringify({ ...data, fetchedAt: Date.now() }));
    } catch (e) {}
}

// Returns { total14, dailyRain, dates } or null
async function fetchRainData() {
    // Use getFarmCenter() which is already defined in gt-dashboard.js / inline script
    const center = (typeof getFarmCenter === 'function') ? getFarmCenter() : null;
    if (!center) return null;

    try {
        const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${center.lat.toFixed(4)}&longitude=${center.lng.toFixed(4)}` +
            `&daily=precipitation_sum` +
            `&past_days=14&forecast_days=0&timezone=auto`;

        const res  = await fetch(url);
        if (!res.ok) return null;
        const json = await res.json();

        const dates    = json.daily.time;
        const dailyRain = json.daily.precipitation_sum.map(v => v ?? 0);
        const today    = todayStr();

        // Only count historical days (not today's forecast)
        const histRain = dailyRain.filter((_, i) => dates[i] < today);
        const total14  = histRain.reduce((s, v) => s + v, 0);

        const result = { total14: parseFloat(total14.toFixed(1)), dailyRain, dates, fetchedAt: Date.now() };
        _setRainCache(result);
        return result;
    } catch (e) {
        return null;
    }
}

// Public: refresh the cache (call on tab switch to dashboard or manual refresh)
async function refreshRainCache() {
    return await fetchRainData();
}

// Sync read — uses cache only (no await needed in getStatus/getReadinessPct)
function getRainCached() {
    return _getRainCache();
}

// ── Core calculation ──────────────────────────────────────────

/**
 * Returns the drought-adjusted rest target for a field (in days).
 * If dynamic rest is disabled or no rain data, returns field.restTarget unchanged.
 */
function getEffectiveRestTarget(field) {
    const cfg = getRainConfig();
    if (!cfg.enabled) return field.restTarget;

    const cache = getRainCached();
    if (!cache) return field.restTarget;

    const { total14, threshMm, sensitivity, maxExtPct } = { ...cache, ...cfg };
    const deficit = Math.max(0, threshMm - total14);
    if (deficit === 0) return field.restTarget;

    const rawExt   = deficit * sensitivity;
    const maxExt   = Math.round(field.restTarget * maxExtPct / 100);
    const extension = Math.min(Math.round(rawExt), maxExt);

    return field.restTarget + extension;
}

/**
 * Returns a rain status summary for display in UI.
 * { total14, deficit, extensionDays, label, cls, enabled }
 *   cls: 'good' | 'moderate' | 'dry' | 'drought'
 */
function getRainStatus() {
    const cfg   = getRainConfig();
    const cache = getRainCached();

    if (!cfg.enabled) return { enabled: false, total14: null, deficit: 0, extensionDays: 0, label: 'Dynamic rest off', cls: 'off' };
    if (!cache)       return { enabled: true,  total14: null, deficit: 0, extensionDays: 0, label: 'No rainfall data yet', cls: 'off' };

    const total14  = cache.total14;
    const deficit  = Math.max(0, cfg.threshMm - total14);
    const rawExt   = deficit * cfg.sensitivity;

    // Use a representative field for the max-ext cap — just use 42 (default)
    const repTarget = 42;
    const maxExt    = Math.round(repTarget * cfg.maxExtPct / 100);
    const extensionDays = Math.min(Math.round(rawExt), maxExt);

    let cls, label;
    if (total14 >= cfg.threshMm) {
        cls   = 'good';
        label = `Good rainfall — ${total14} mm (14d) · No target extension`;
    } else if (deficit <= cfg.threshMm * 0.3) {
        cls   = 'moderate';
        label = `Slightly dry — ${total14} mm (14d) · +${extensionDays}d extension`;
    } else if (deficit <= cfg.threshMm * 0.7) {
        cls   = 'dry';
        label = `Dry conditions — ${total14} mm (14d) · +${extensionDays}d extension`;
    } else {
        cls   = 'drought';
        label = `Drought stress — ${total14} mm (14d) · +${extensionDays}d extension`;
    }

    return { enabled: true, total14, deficit: parseFloat(deficit.toFixed(1)), extensionDays, label, cls };
}

// ── Settings modal ────────────────────────────────────────────

function openDynRestSettings() {
    const cfg = getRainConfig();
    const status = getRainStatus();

    const html = `
    <div class="drs-wrap">
        <div class="drs-header">
            <div class="drs-icon">🌧</div>
            <div>
                <div class="drs-title">Dynamic Rest Targets</div>
                <div class="drs-subtitle">Automatically extends rest periods during dry spells</div>
            </div>
        </div>

        <div class="drs-status drs-status-${status.cls}">
            ${status.cls === 'good'     ? '✅' :
              status.cls === 'moderate' ? '🌤' :
              status.cls === 'dry'      ? '☀️' :
              status.cls === 'drought'  ? '🔥' : '⏸'}
            ${status.label}
        </div>

        <div class="drs-toggle-row">
            <label class="drs-lbl">Enable dynamic rest targets</label>
            <label class="drs-switch">
                <input type="checkbox" id="drsEnabled" ${cfg.enabled ? 'checked' : ''}
                    onchange="saveDynRestSettings()">
                <span class="drs-slider"></span>
            </label>
        </div>

        <div id="drsControls" style="display:${cfg.enabled ? 'block' : 'none'}">
            <div class="drs-field">
                <label class="drs-lbl">
                    Adequate rainfall threshold
                    <span class="drs-hint">14-day total (mm) — below this, rest targets extend</span>
                </label>
                <div class="drs-slider-row">
                    <input type="range" id="drsThresh" min="5" max="60" step="5"
                        value="${cfg.threshMm}" oninput="drsPreview()">
                    <span class="drs-val" id="drsThreshVal">${cfg.threshMm} mm</span>
                </div>
            </div>

            <div class="drs-field">
                <label class="drs-lbl">
                    Sensitivity
                    <span class="drs-hint">Extra rest days added per mm of deficit</span>
                </label>
                <div class="drs-slider-row">
                    <input type="range" id="drsSens" min="0.5" max="3.0" step="0.5"
                        value="${cfg.sensitivity}" oninput="drsPreview()">
                    <span class="drs-val" id="drsSensVal">${cfg.sensitivity}d/mm</span>
                </div>
            </div>

            <div class="drs-field">
                <label class="drs-lbl">
                    Maximum extension
                    <span class="drs-hint">Cap as % of each field's base rest target</span>
                </label>
                <div class="drs-slider-row">
                    <input type="range" id="drsMaxExt" min="10" max="100" step="10"
                        value="${cfg.maxExtPct}" oninput="drsPreview()">
                    <span class="drs-val" id="drsMaxExtVal">${cfg.maxExtPct}%</span>
                </div>
            </div>

            <div class="drs-preview" id="drsPreviewBox">
                ${_drsPreviewHtml(cfg)}
            </div>
        </div>

        <div class="drs-explainer">
            <strong>How it works:</strong> GrazingTrack checks your farm's 14-day rainfall total each hour.
            If it falls below the threshold, every field's rest target is extended proportionally —
            so pastures get more recovery time when the veld is under drought stress.
            The map, rotation tab, and all status indicators update automatically.
        </div>
    </div>`;

    document.getElementById('dynRestBody').innerHTML = html;
    openModal('modalDynRest');

    // Trigger a background refresh of rain cache when opening
    refreshRainCache().then(() => {
        const s = getRainStatus();
        const el = document.querySelector('.drs-status');
        if (el) {
            el.className = `drs-status drs-status-${s.cls}`;
            el.innerHTML = `${s.cls === 'good' ? '✅' : s.cls === 'moderate' ? '🌤' : s.cls === 'dry' ? '☀️' : s.cls === 'drought' ? '🔥' : '⏸'} ${s.label}`;
        }
        drsPreview();
    });
}

function closeDynRestSettings() {
    closeModal('modalDynRest');
    // Refresh the map and rotation after settings change
    if (typeof refreshMapColors === 'function') refreshMapColors();
    if (typeof renderFieldList  === 'function') renderFieldList();
    if (typeof updateStats      === 'function') updateStats();
}

function saveDynRestSettings() {
    const enabled = document.getElementById('drsEnabled').checked;
    saveRainConfig({ dynamicRestEnabled: enabled });

    const controls = document.getElementById('drsControls');
    if (controls) controls.style.display = enabled ? 'block' : 'none';
    drsPreview();
}

function drsPreview() {
    const threshEl  = document.getElementById('drsThresh');
    const sensEl    = document.getElementById('drsSens');
    const maxExtEl  = document.getElementById('drsMaxExt');
    const enabled   = document.getElementById('drsEnabled').checked;

    if (!threshEl) return;

    const thresh  = parseFloat(threshEl.value);
    const sens    = parseFloat(sensEl.value);
    const maxExt  = parseFloat(maxExtEl.value);

    document.getElementById('drsThreshVal').textContent  = thresh  + ' mm';
    document.getElementById('drsSensVal').textContent    = sens    + 'd/mm';
    document.getElementById('drsMaxExtVal').textContent  = maxExt  + '%';

    // Save live as user drags
    saveRainConfig({
        dynamicRestEnabled: enabled,
        droughtThreshMm:    thresh,
        droughtSensitivity: sens,
        droughtMaxExtPct:   maxExt
    });

    const preview = document.getElementById('drsPreviewBox');
    if (preview) preview.innerHTML = _drsPreviewHtml({ enabled, threshMm: thresh, sensitivity: sens, maxExtPct: maxExt });
}

function _drsPreviewHtml(cfg) {
    const cache = getRainCached();
    if (!cache) return `<div class="drs-prev-row">📡 No rain data yet — will load when connected</div>`;

    const total14  = cache.total14;
    const deficit  = Math.max(0, cfg.threshMm - total14);

    const fields   = (typeof loadFields === 'function') ? loadFields() : [];
    if (!fields.length) return `<div class="drs-prev-row">Add fields to see target preview</div>`;

    const rows = fields.slice(0, 5).map(f => {
        const ext    = deficit <= 0 ? 0 : Math.min(Math.round(deficit * cfg.sensitivity), Math.round(f.restTarget * cfg.maxExtPct / 100));
        const effTgt = f.restTarget + ext;
        return `<div class="drs-prev-row">
            <span class="drs-prev-name">${f.name}</span>
            <span class="drs-prev-base">${f.restTarget}d base</span>
            <span class="drs-prev-arrow">${ext > 0 ? '→' : '='}</span>
            <span class="drs-prev-eff${ext > 0 ? ' extended' : ''}">${effTgt}d${ext > 0 ? ' (+' + ext + ')' : ''}</span>
        </div>`;
    }).join('');

    const moreNote = fields.length > 5 ? `<div class="drs-prev-more">…and ${fields.length - 5} more fields</div>` : '';

    return `
        <div class="drs-prev-title">Current effect <span style="font-weight:400;color:var(--text-muted)">(${total14} mm / 14d · ${deficit > 0 ? deficit.toFixed(0) + ' mm deficit' : 'no deficit'})</span></div>
        ${rows}${moreNote}`;
}

// ── Auto-init: refresh cache on load if online ────────────────
window.addEventListener('load', () => {
    // Kick off a background rain fetch after a short delay (don't block render)
    setTimeout(() => {
        if (navigator.onLine) refreshRainCache();
    }, 3000);
});