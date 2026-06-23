// ============================================================
//  gt-split.js  —  Farm boundary split tool (Improved workflow)
//  Simplified UI: Draw → Count → Adjust sizes & orientations
// ============================================================
'use strict';

// ── State ─────────────────────────────────────────────────────
const AS = {
    map: null,
    drawn: null,
    drawControl: null,
    boundary: null,
    boundaryLayer: null,
    campLayers: [],

    count: 4,
    dir: 'vertical',
    dividers: [{ pos: 0.25, angle: 0 }, { pos: 0.50, angle: 0 }, { pos: 0.75, angle: 0 }],
    colDividers: [0.50],
    rowDividers: [0.50],

    camps: [],

    reshapeIdx: null,
    reshapeGroup: null,
    reshapeControl: null,

    _refreshTimer: null
};

const AS_COLORS = [
    '#2d6a4f', '#52b788', '#40916c', '#74c69d', '#1b4332', '#34a0a4',
    '#0077b6', '#7b2d8b', '#d97706', '#dc2626', '#0891b2', '#059669',
    '#7c3aed', '#db2777', '#b45309', '#374151', '#16a34a', '#ca8a04',
    '#9333ea', '#e11d48', '#0369a1', '#15803d', '#b91c1c', '#7e22ce'
];

// ── Open / close ──────────────────────────────────────────────
function openAutoSplit() {
    Object.assign(AS, {
        boundary: null,
        boundaryLayer: null,
        campLayers: [],
        count: 4,
        dir: 'vertical',
        dividers: [{ pos: 0.25, angle: 0 }, { pos: 0.50, angle: 0 }, { pos: 0.75, angle: 0 }],
        colDividers: [0.50],
        rowDividers: [0.50],
        camps: [],
        reshapeIdx: null,
        reshapeGroup: null,
        reshapeControl: null,
        drawControl: null,
        _refreshTimer: null
    });
    openModal('modalAutoSplit');
    _asRenderPanel();
    setTimeout(_asInitMap, 150);
}

function closeAutoSplit() {
    if (AS._refreshTimer) {
        clearTimeout(AS._refreshTimer);
        AS._refreshTimer = null;
    }
    _asFinishReshape(false);
    closeModal('modalAutoSplit');
    _asDestroyMap();
}

function asDestroyMap() { _asDestroyMap(); }

// ── Map setup ─────────────────────────────────────────────────
function _asInitMap() {
    if (AS.map) {
        try { AS.map.remove(); } catch (e) {}
        AS.map = null;
    }

    let center = [-29, 25],
        zoom = 6;
    const fields = loadFields();
    if (fields.length) {
        const lats = [],
            lngs = [];
        fields.forEach(f => f.geometry.coordinates[0].forEach(([lng, lat]) => {
            lats.push(lat);
            lngs.push(lng);
        }));
        center = [(Math.min(...lats) + Math.max(...lats)) / 2,
            (Math.min(...lngs) + Math.max(...lngs)) / 2
        ];
        zoom = 13;
    } else {
        try {
            const cfg = JSON.parse(localStorage.getItem('gt_config') || '{}');
            if (cfg.lat) {
                center = [cfg.lat, cfg.lng];
                zoom = 14;
            }
        } catch (e) {}
    }

    AS.map = L.map('asMap', { zoomControl: true }).setView(center, zoom);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri', maxZoom: 19 }).addTo(AS.map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.7 }).addTo(AS.map);

    AS.drawn = new L.FeatureGroup().addTo(AS.map);

    AS.drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
            polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#2d6a4f', fillColor: '#2d6a4f', fillOpacity: 0.12, weight: 3, dashArray: '6 3' } },
            polyline: false,
            rectangle: false,
            circle: false,
            circlemarker: false,
            marker: false
        },
        edit: { featureGroup: AS.drawn, remove: false }
    });
    AS.map.addControl(AS.drawControl);

    setTimeout(() => {
        const mapEl = document.getElementById('asMap');
        if (mapEl) {
            const btn = mapEl.querySelector('.leaflet-draw-draw-polygon');
            if (btn) btn.click();
        }
    }, 300);

    AS.map.on(L.Draw.Event.CREATED, e => {
        if (AS.boundaryLayer) AS.drawn.removeLayer(AS.boundaryLayer);
        _asClearCampLayers();
        AS.boundaryLayer = e.layer;
        AS.boundaryLayer.setStyle({ color: '#2d6a4f', fillColor: '#2d6a4f', fillOpacity: 0.12, weight: 3 });
        AS.drawn.addLayer(AS.boundaryLayer);
        AS.boundary = AS.boundaryLayer.toGeoJSON().geometry;
        _asResetDividers();
        _asRebuildCamps();
        _asDrawCampLayers();
        _asRenderPanel();
    });
}

function _asDestroyMap() {
    if (AS.map) {
        try { AS.map.remove(); } catch (e) {}
        AS.map = null;
    }
}

// ── UI Render ──────────────────────────────────────────────────
function _asRenderPanel() {
    const panel = document.getElementById('asControlPanel');
    if (!panel) return;

    if (AS.reshapeIdx !== null) {
        const camp = AS.camps[AS.reshapeIdx];
        panel.innerHTML = `
            <div class="as-reshape-state">
                <div class="as-reshape-icon" style="background:${camp.color}">✎</div>
                <p class="as-reshape-title">Reshaping: ${camp.name}</p>
                <p class="as-reshape-sub">
                    Drag the white handles on the map to move corners.<br>
                    Click on a boundary line to add a new corner.
                </p>
                <div class="as-reshape-actions">
                    <button class="btn-primary" onclick="_asFinishReshape(true)">✓ Save shape</button>
                    <button class="btn-ghost"   onclick="_asFinishReshape(false)">✕ Cancel</button>
                </div>
                <p class="as-reshape-note">
                    Changing count or direction will recalculate all camps and reset reshaping.
                </p>
            </div>`;
        document.getElementById('asSaveBtn').disabled = true;
        return;
    }

    if (!AS.boundary) {
        panel.innerHTML = `
            <div class="as-welcome">
                <div class="as-welcome-icon">⬡</div>
                <p class="as-welcome-title">Draw your farm boundary</p>
                <p class="as-welcome-sub">Click the polygon tool on the map, trace the outer edge of your farm, then double-click the last point to close the shape.</p>
            </div>`;
        document.getElementById('asSaveBtn').disabled = true;
        return;
    }

    const totalHa = AS.camps.reduce((s, c) => s + c.areaHa, 0);
    panel.innerHTML = `
        <div class="as-section">
            <div class="as-section-title">How many camps?</div>
            <div class="as-count-input-row">
                <button class="as-count-btn" onclick="asSetCount(AS.count-1)">−</button>
                <input type="number" id="asCampNumInput" class="as-count-input" min="1" max="50" value="${AS.count}"
                    onchange="asSetCount(parseInt(this.value))" onkeydown="if(event.key==='Enter')asSetCount(parseInt(this.value))">
                <button class="as-count-btn" onclick="asSetCount(AS.count+1)">+</button>
            </div>
        </div>

        <div class="as-section">
            <div class="as-section-title">Split direction</div>
            <div class="as-dir-row">
                <button class="as-dir-btn${AS.dir==='vertical'  ?' active':''}" onclick="asSetDir('vertical')">↕ Vertical</button>
                <button class="as-dir-btn${AS.dir==='horizontal'?' active':''}" onclick="asSetDir('horizontal')">↔ Horizontal</button>
                <button class="as-dir-btn${AS.dir==='grid'      ?' active':''}" onclick="asSetDir('grid')">⊞ Grid</button>
            </div>
        </div>

        <div class="as-section">
            <div class="as-section-title">Adjust sizes & orientation</div>
            ${AS.camps.length === 0
                ? '<p class="as-no-dividers" style="color:#dc2626">Could not split — try a different direction or a simpler farm shape.</p>'
                : _asBuildDividerHTML()}
        </div>

        <div class="as-section">
            <div class="as-section-title">Camp names & reshape</div>
            <div class="as-name-list">
                ${AS.camps.map((c,i) => `
                <div class="as-name-row">
                    <span class="as-camp-dot" style="background:${c.color}"></span>
                    <input class="as-name-input" type="text" value="${c.name}"
                        oninput="AS.camps[${i}].name=this.value" placeholder="Camp name">
                    <span class="as-size-lbl" id="as-size-${i}">${c.areaHa.toFixed(1)} ha</span>
                    <button class="as-reshape-btn" title="Reshape this camp" onclick="asReshapeCamp(${i})">✎</button>
                </div>`).join('')}
            </div>
        </div>

        <div class="as-total-badge" id="asTotalBadge">
            ${AS.camps.length} camp${AS.camps.length!==1?'s':''} · ${totalHa.toFixed(1)} ha total
        </div>

        <div class="as-action-row" style="margin-top:12px;display:flex;gap:8px;">
            <button class="as-redraw-btn" style="flex:1;" onclick="_asRedrawBoundary()">↺ Redraw boundary</button>
        </div>`;

    document.getElementById('asSaveBtn').disabled = AS.camps.length === 0;
}

// ── Redraw boundary without closing the modal ─────────────────
function _asRedrawBoundary() {
    if (AS.boundaryLayer) {
        AS.drawn.removeLayer(AS.boundaryLayer);
        AS.boundaryLayer = null;
    }
    _asClearCampLayers();
    AS.boundary = null;
    AS.camps    = [];
    _asRenderPanel();
    setTimeout(() => {
        const mapEl = document.getElementById('asMap');
        if (mapEl) {
            const btn = mapEl.querySelector('.leaflet-draw-draw-polygon');
            if (btn) btn.click();
        }
    }, 80);
}

// ── Divider HTML ──────────────────────────────────────────────
function _asBuildDividerHTML() {
    if (AS.camps.length <= 1)
        return '<p class="as-no-dividers">Only one camp — increase the count above.</p>';

    if (AS.dir === 'grid') {
        let html = '';
        if (AS.colDividers.length) {
            html += '<div class="as-div-group-lbl">Column widths</div>';
            html += AS.colDividers.map((v,i) => {
                const pct = Math.round(v*100);
                const lo  = i===0 ? 5 : Math.round(AS.colDividers[i-1]*100)+5;
                const hi  = i===AS.colDividers.length-1 ? 95 : Math.round(AS.colDividers[i+1]*100)-5;
                return `<div class="as-div-row">
                    <span class="as-div-lbl">Col ${i+1}|${i+2}</span>
                    <input type="range" id="as-cdiv-${i}" class="as-div-slider" min="${lo}" max="${hi}" value="${pct}"
                        oninput="asOnColDiv(${i},this.value)">
                    <span class="as-div-pct" id="as-cdiv-pct-${i}">${pct}%</span>
                </div>`;
            }).join('');
        }
        if (AS.rowDividers.length) {
            html += '<div class="as-div-group-lbl" style="margin-top:8px">Row heights</div>';
            html += AS.rowDividers.map((v,i) => {
                const pct = Math.round(v*100);
                const lo  = i===0 ? 5 : Math.round(AS.rowDividers[i-1]*100)+5;
                const hi  = i===AS.rowDividers.length-1 ? 95 : Math.round(AS.rowDividers[i+1]*100)-5;
                return `<div class="as-div-row">
                    <span class="as-div-lbl">Row ${i+1}|${i+2}</span>
                    <input type="range" id="as-rdiv-${i}" class="as-div-slider" min="${lo}" max="${hi}" value="${pct}"
                        oninput="asOnRowDiv(${i},this.value)">
                    <span class="as-div-pct" id="as-rdiv-pct-${i}">${pct}%</span>
                </div>`;
            }).join('');
        }
        return html;
    }

    return `<div class="as-div-controls-wrapper">` +
        `<div class="as-div-sizes">` +
        AS.dividers.map((div,i) => {
            const pct = Math.round(div.pos*100);
            const lo  = i===0 ? 5 : Math.round(AS.dividers[i-1].pos*100)+5;
            const hi  = i===AS.dividers.length-1 ? 95 : Math.round(AS.dividers[i+1].pos*100)-5;
            return `<div class="as-div-row as-size-row">
                <label class="as-div-lbl">Camp ${i+1}/${i+2}</label>
                <input type="range" id="as-div-${i}" class="as-div-slider" min="${lo}" max="${hi}" value="${pct}"
                    oninput="asOnDiv(${i},this.value)">
                <span class="as-div-pct" id="as-div-pct-${i}">${pct}%</span>
            </div>`;
        }).join('') +
        `</div>` +
        `<div class="as-div-angles">` +
        AS.dividers.map((div,i) => {
            const ang = div.angle || 0;
            return `<div class="as-div-row as-angle-row">
                <label class="as-div-lbl">Orientation ${i+1}</label>
                <input type="range" id="as-div-ang-${i}" class="as-div-slider as-ang-slider" min="-45" max="45" value="${ang}"
                    oninput="asOnDivAngle(${i},this.value)">
                <span class="as-div-pct" id="as-div-ang-pct-${i}">${ang>0?'+':''}${ang}°</span>
            </div>`;
        }).join('') +
        `</div>` +
        `</div>`;
}

// ── Slider handlers ───────────────────────────────────────────
function asSetCount(n) {
    AS.count = Math.max(1, Math.min(50, n));
    const input = document.getElementById('asCampNumInput');
    if (input) input.value = AS.count;
    _asResetDividers();
    _asRebuildCamps();
    _asClearCampLayers();
    _asDrawCampLayers();
    _asRenderPanel();
}

function asSetDir(dir) {
    AS.dir = dir;
    _asResetDividers();
    _asRebuildCamps();
    _asClearCampLayers();
    _asDrawCampLayers();
    _asRenderPanel();
}

function asOnDiv(idx, val) {
    const rawVal = parseInt(val);
    AS.dividers[idx].pos = rawVal / 100;
    const pEl = document.getElementById(`as-div-pct-${idx}`); if(pEl) pEl.textContent = rawVal+'%';
    const prev = document.getElementById(`as-div-${idx-1}`); if(prev) prev.max = parseInt(rawVal)-5;
    const next = document.getElementById(`as-div-${idx+1}`); if(next) next.min = parseInt(rawVal)+5;
    _asScheduleRefresh();
}

function asOnColDiv(idx, val) {
    const rawVal = parseInt(val);
    AS.colDividers[idx] = rawVal / 100;
    const pEl = document.getElementById(`as-cdiv-pct-${idx}`); if(pEl) pEl.textContent = rawVal+'%';
    const prev = document.getElementById(`as-cdiv-${idx-1}`); if(prev) prev.max = parseInt(rawVal)-5;
    const next = document.getElementById(`as-cdiv-${idx+1}`); if(next) next.min = parseInt(rawVal)+5;
    _asScheduleRefresh();
}

function asOnRowDiv(idx, val) {
    const rawVal = parseInt(val);
    AS.rowDividers[idx] = rawVal / 100;
    const pEl = document.getElementById(`as-rdiv-pct-${idx}`); if(pEl) pEl.textContent = rawVal+'%';
    const prev = document.getElementById(`as-rdiv-${idx-1}`); if(prev) prev.max = parseInt(rawVal)-5;
    const next = document.getElementById(`as-rdiv-${idx+1}`); if(next) next.min = parseInt(rawVal)+5;
    _asScheduleRefresh();
}

function asOnDivAngle(idx, val) {
    AS.dividers[idx].angle = parseInt(val);
    const pEl = document.getElementById(`as-div-ang-pct-${idx}`);
    if(pEl) {
        const ang = AS.dividers[idx].angle;
        pEl.textContent = (ang>0?'+':'') + ang + '°';
    }
    _asScheduleRefresh();
}

// Debounce — 80ms after the last slider move before recomputing.
function _asScheduleRefresh() {
    if (AS._refreshTimer) clearTimeout(AS._refreshTimer);
    AS._refreshTimer = setTimeout(() => {
        AS._refreshTimer = null;
        _asRebuildAndRefresh();
    }, 80);
}

function _asRebuildAndRefresh() {
    _asRebuildCamps();
    _asClearCampLayers();
    _asDrawCampLayers();
    AS.camps.forEach((c,i) => {
        const el = document.getElementById(`as-size-${i}`);
        if (el) el.textContent = c.areaHa.toFixed(1)+' ha';
    });
    const badge = document.getElementById('asTotalBadge');
    if (badge) {
        const total = AS.camps.reduce((s,c) => s+c.areaHa, 0);
        badge.textContent = `${AS.camps.length} camp${AS.camps.length!==1?'s':''} · ${total.toFixed(1)} ha total`;
    }
    if (AS.camps.length === 0) _asRenderPanel();
    const saveBtn = document.getElementById('asSaveBtn');
    if (saveBtn) saveBtn.disabled = AS.camps.length === 0;
}

// ── Split algorithm ───────────────────────────────────────────
function _asRebuildCamps() {
    if (!AS.boundary) { AS.camps = []; return; }

    try {
        const farmPoly = turf.polygon(AS.boundary.coordinates);
        const bbox     = turf.bbox(farmPoly);
        const oldNames = AS.camps.map(c => c.name);
        let polys      = [];

        if (AS.dir === 'grid') {
            const [minLng,minLat,maxLng,maxLat] = bbox;
            const colBreaks = [0,...AS.colDividers,1];
            const rowBreaks = [0,...AS.rowDividers,1];
            let idx = 0;
            outer: for (let r=0; r<rowBreaks.length-1; r++) {
                for (let c=0; c<colBreaks.length-1; c++) {
                    if (idx++ >= AS.count) break outer;
                    const sLng = minLng + colBreaks[c]  *(maxLng-minLng);
                    const eLng = minLng + colBreaks[c+1]*(maxLng-minLng);
                    const sLat = minLat + rowBreaks[r]  *(maxLat-minLat);
                    const eLat = minLat + rowBreaks[r+1]*(maxLat-minLat);
                    const ix = turf.intersect(farmPoly, turf.bboxPolygon([sLng,sLat,eLng,eLat]));
                    if (ix) polys.push(ix);
                }
            }
        } else {
            let remaining = farmPoly;
            for (const div of AS.dividers) {
                const line = _asDividerLine(div, bbox);
                const cuts = _asCutWithLine(remaining, line);
                if (cuts.length === 2) {
                    const ci = AS.dir==='vertical' ? 0 : 1;
                    const c0 = turf.centroid(cuts[0]).geometry.coordinates[ci];
                    const c1 = turf.centroid(cuts[1]).geometry.coordinates[ci];
                    const [before, after] = c0<c1 ? [cuts[0],cuts[1]] : [cuts[1],cuts[0]];
                    polys.push(before);
                    remaining = _asLargestPolygon(after);
                }
            }
            polys.push(remaining);
        }

        const valid = polys.filter(p => calcAreaHa(p.geometry) > 0.01);
        AS.camps = valid.map((p,i) => ({
            id:       uid(),
            name:     oldNames[i] || `Camp ${i+1}`,
            geometry: p.geometry,
            color:    AS_COLORS[i % AS_COLORS.length],
            areaHa:   calcAreaHa(p.geometry)
        }));

    } catch(err) {
        // Log error for debugging but don't expose to user
        AS.camps = [];
    }
}

// Return the largest simple Polygon from a Feature<Polygon|MultiPolygon>.
function _asLargestPolygon(feature) {
    if (!feature || !feature.geometry) return feature;
    if (feature.geometry.type !== 'MultiPolygon') return feature;
    let bestArea = -1, bestCoords = null;
    for (const ring of feature.geometry.coordinates) {
        const area = calcAreaHa({ type:'Polygon', coordinates:ring });
        if (area > bestArea) { bestArea = area; bestCoords = ring; }
    }
    return bestCoords ? turf.polygon(bestCoords) : feature;
}

// Build the divider line for a {pos, angle} divider.
function _asDividerLine(div, bbox) {
    const [minLng,minLat,maxLng,maxLat] = bbox;
    const ang = (div.angle||0) * Math.PI/180;
    const L   = 3 * Math.max(maxLng-minLng, maxLat-minLat);
    let baseX, baseY, dx, dy;
    if (AS.dir === 'vertical') {
        baseX = minLng + div.pos*(maxLng-minLng);
        baseY = (minLat+maxLat)/2;
        dx = Math.sin(ang); dy = Math.cos(ang);
    } else {
        baseX = (minLng+maxLng)/2;
        baseY = minLat + div.pos*(maxLat-minLat);
        dx = Math.cos(ang); dy = Math.sin(ang);
    }
    return [[baseX-L*dx, baseY-L*dy],[baseX+L*dx, baseY+L*dy]];
}

// Cut a Turf polygon with a two-point line. Returns [left,right] or [poly].
function _asCutWithLine(poly, linePts) {
    try {
        const [p1, p2] = linePts;
        const dx = p2[0]-p1[0], dy = p2[1]-p1[1];
        const len = Math.sqrt(dx*dx+dy*dy) || 1;
        const nx = -dy/len, ny = dx/len;
        const ext = len;

        const lc = [p1, p2, [p2[0]+nx*ext,p2[1]+ny*ext], [p1[0]+nx*ext,p1[1]+ny*ext], [p1[0],p1[1]]];
        const rc = [p1, p2, [p2[0]-nx*ext,p2[1]-ny*ext], [p1[0]-nx*ext,p1[1]-ny*ext], [p1[0],p1[1]]];

        const inputPoly = (poly.geometry && poly.geometry.type==='MultiPolygon')
            ? _asLargestPolygon(poly)
            : poly;

        const left  = turf.intersect(inputPoly, turf.polygon([lc]));
        const right = turf.intersect(inputPoly, turf.polygon([rc]));
        const result = [];
        if (left)  result.push(left);
        if (right) result.push(right);
        return result.length === 2 ? result : [poly];
    } catch(e) {
        return [poly];
    }
}

// ── Map layer helpers ─────────────────────────────────────────
function _asClearCampLayers() {
    AS.campLayers.forEach(l => { try { AS.map && AS.map.removeLayer(l); } catch(e){} });
    AS.campLayers = [];
}

function _asDrawCampLayers() {
    if (!AS.map) return;
    AS.camps.forEach(camp => {
        try {
            const layer = L.geoJSON(
                { type:'Feature', geometry:camp.geometry, properties:{} },
                { style:{ color:camp.color, fillColor:camp.color, fillOpacity:0.4, weight:2 } }
            ).addTo(AS.map);

            let cLat, cLng;
            try {
                const c = turf.centroid({ type:'Feature', geometry:camp.geometry, properties:{} });
                [cLng, cLat] = c.geometry.coordinates;
            } catch(e) {
                const ring = camp.geometry.type==='Polygon'
                    ? camp.geometry.coordinates[0]
                    : camp.geometry.coordinates[0][0];
                cLng = ring.reduce((s,p)=>s+p[0],0)/ring.length;
                cLat = ring.reduce((s,p)=>s+p[1],0)/ring.length;
            }

            const icon = L.divIcon({
                className:'',
                html:`<div class="camp-lbl">${camp.name}</div>`,
                iconAnchor:[30,10]
            });
            const m = L.marker([cLat,cLng], { icon, interactive:false }).addTo(AS.map);
            AS.campLayers.push(layer, m);
        } catch(e) {}
    });
}

// ── Reshape ───────────────────────────────────────────────────
function asReshapeCamp(idx) {
    if (AS.reshapeIdx !== null) return;
    AS.reshapeIdx = idx;

    if (AS.drawControl) {
        try { AS.map.removeControl(AS.drawControl); } catch(e) {}
    }

    _asClearCampLayers();
    AS.camps.forEach((camp,i) => {
        if (i === idx) return;
        try {
            const layer = L.geoJSON(
                { type:'Feature', geometry:camp.geometry, properties:{} },
                { style:{ color:camp.color, fillColor:camp.color, fillOpacity:0.12, weight:1.5, dashArray:'4 3' } }
            ).addTo(AS.map);
            AS.campLayers.push(layer);
        } catch(e) {}
    });

    AS.reshapeGroup = new L.FeatureGroup().addTo(AS.map);
    try {
        L.geoJSON(
            { type:'Feature', geometry:AS.camps[idx].geometry, properties:{} },
            { style:{ color:AS.camps[idx].color, fillColor:AS.camps[idx].color, fillOpacity:0.55, weight:3 } }
        ).eachLayer(l => AS.reshapeGroup.addLayer(l));
    } catch(e) {}

    AS.reshapeControl = new L.Control.Draw({
        position:'topright', draw:false,
        edit:{ featureGroup:AS.reshapeGroup, remove:false }
    });
    AS.map.addControl(AS.reshapeControl);

    setTimeout(() => {
        const mapEl = document.getElementById('asMap');
        if (mapEl) {
            const btn = mapEl.querySelector('.leaflet-draw-edit-edit');
            if (btn) btn.click();
        }
    }, 80);

    _asRenderPanel();
}

function _asFinishReshape(save) {
    if (AS.reshapeIdx === null) return;

    if (save && AS.reshapeGroup) {
        AS.reshapeGroup.eachLayer(l => {
            try {
                const geo = l.toGeoJSON().geometry;
                if (geo) {
                    AS.camps[AS.reshapeIdx].geometry = geo;
                    AS.camps[AS.reshapeIdx].areaHa   = calcAreaHa(geo);
                }
            } catch(e) {}
        });
    }

    if (AS.reshapeControl) {
        try {
            const mapEl = document.getElementById('asMap');
            const saveBtn = mapEl && mapEl.querySelector('.leaflet-draw-edit-save');
            if (saveBtn) saveBtn.click();
            AS.map.removeControl(AS.reshapeControl);
        } catch(e) {}
        AS.reshapeControl = null;
    }
    if (AS.reshapeGroup) {
        try { AS.map.removeLayer(AS.reshapeGroup); } catch(e) {}
        AS.reshapeGroup = null;
    }

    AS.reshapeIdx = null;

    if (AS.drawControl && AS.map) {
        try { AS.map.addControl(AS.drawControl); } catch(e) {}
    }

    _asClearCampLayers();
    _asDrawCampLayers();
    _asRenderPanel();
}

// ── Reset dividers ─────────────────────────────────────────────
function _asResetDividers() {
    if (AS.dir === 'grid') {
        const cols = Math.ceil(Math.sqrt(AS.count));
        const rows = Math.ceil(AS.count / cols);
        AS.colDividers = [];
        AS.rowDividers = [];
        for (let i = 1; i < cols; i++) AS.colDividers.push(i/cols);
        for (let i = 1; i < rows; i++) AS.rowDividers.push(i/rows);
    } else {
        AS.dividers = [];
        for (let i = 1; i < AS.count; i++) {
            AS.dividers.push({ pos: i/AS.count, angle:0 });
        }
    }
}

// ── Save to main map ──────────────────────────────────────────
function asSave() {
    if (!AS.camps.length) { alert('No camps to save — draw a boundary first.'); return; }
    document.querySelectorAll('.as-name-input').forEach((inp,i) => {
        if (AS.camps[i]) AS.camps[i].name = inp.value.trim() || AS.camps[i].name;
    });
    const existing  = loadFields();
    const newFields = AS.camps.map(c => ({
        id:         c.id,
        name:       c.name,
        type:       'pasture',
        restTarget: 42,
        maxAUperHa: null,
        geometry:   c.geometry,
        areaHa:     c.areaHa,
        color:      c.color,
        createdAt:  new Date().toISOString(),
        version:    DB_VERSION
    }));
    saveFields([...existing, ...newFields]);
    drawnItems.clearLayers();
    restoreFieldsOnMap();
    renderFieldList();
    updateStats();
    closeAutoSplit();
    setStatus(`${newFields.length} camp${newFields.length!==1?'s':''} created.`);
    if (newFields.length) setTimeout(() => selectField(newFields[0].id), 300);
}
