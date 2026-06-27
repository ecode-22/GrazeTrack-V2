// ============================================================
//  gt-split.js  —  Auto-split: draw on main map, panel inline
//  Flow: click "Auto-split" → draw boundary → panel slides in
//        → adjust camps live → "Create camps" → done
// ============================================================
'use strict';

// ── State ─────────────────────────────────────────────────────
const AS = {
    campGroup:    null,   // L.FeatureGroup added to the main map
    boundary:     null,
    boundaryLayer:null,
    campLayers:   [],

    count:  4,
    dir:    'vertical',
    dividers:    [{ pos: 0.25, angle: 0 }, { pos: 0.50, angle: 0 }, { pos: 0.75, angle: 0 }],
    colDividers: [0.50],
    rowDividers: [0.50],

    camps: [],

    reshapeIdx:     null,
    reshapeGroup:   null,
    reshapeControl: null,

    _refreshTimer: null
};

const AS_COLORS = [
    '#2d6a4f','#52b788','#40916c','#74c69d','#1b4332','#34a0a4',
    '#0077b6','#7b2d8b','#d97706','#dc2626','#0891b2','#059669',
    '#7c3aed','#db2777','#b45309','#374151','#16a34a','#ca8a04',
    '#9333ea','#e11d48','#0369a1','#15803d','#b91c1c','#7e22ce'
];

// ── Open — activate draw on main map ─────────────────────────
function openAutoSplit() {
    // Reset state
    Object.assign(AS, {
        boundary: null, boundaryLayer: null, campLayers: [],
        count: 4, dir: 'vertical',
        dividers:    [{ pos:0.25,angle:0 },{ pos:0.50,angle:0 },{ pos:0.75,angle:0 }],
        colDividers: [0.50], rowDividers: [0.50],
        camps: [], reshapeIdx: null, reshapeGroup: null, reshapeControl: null,
        _refreshTimer: null
    });

    // Set up a fresh layer group for camp previews on the main map
    if (AS.campGroup) { try { map.removeLayer(AS.campGroup); } catch(e) {} }
    AS.campGroup = new L.FeatureGroup().addTo(map);

    // Make sure we're on the map tab
    if (typeof switchTab === 'function') switchTab('map');

    // Activate the Leaflet polygon draw tool on the main map
    window._asSplitMode = true;
    try { map.addControl(drawControl); } catch(e) {}
    setTimeout(() => {
        const btn = document.querySelector('#map .leaflet-draw-draw-polygon');
        if (btn) btn.click();
    }, 120);

    setStatus('✏️ Auto-split: trace your farm outer boundary — double-click to finish');
}

// ── Called by gt-map.js after polygon is finished ─────────────
function _asOnBoundaryDrawn(layer) {
    // Clear any previous attempt
    if (AS.boundaryLayer) { try { map.removeLayer(AS.boundaryLayer); } catch(e) {} }
    _asClearCampLayers();

    // Style and keep the boundary outline
    layer.setStyle({ color:'#2d6a4f', fillColor:'#2d6a4f', fillOpacity:0.07, weight:2.5, dashArray:'6 3' });
    layer.addTo(map);
    AS.boundaryLayer = layer;
    AS.boundary      = layer.toGeoJSON().geometry;

    // Compute camps
    _asResetDividers();
    _asRebuildCamps();
    _asDrawCampLayers();

    // Slide the panel in
    const panel = document.getElementById('asSplitPanel');
    if (panel) panel.classList.add('open');
    _asRenderPanel();

    // Fit the map around the boundary with room for the panel
    try { map.fitBounds(layer.getBounds(), { paddingTopLeft:[20,20], paddingBottomRight:[340,20], maxZoom:17 }); } catch(e) {}
    setStatus(`${AS.camps.length} camps ready — adjust in the panel →`);
}

// ── Close — tear down everything ──────────────────────────────
function closeAutoSplit() {
    window._asSplitMode = false;
    if (AS._refreshTimer) { clearTimeout(AS._refreshTimer); AS._refreshTimer = null; }

    _asFinishReshape(false);
    _asClearCampLayers();

    if (AS.boundaryLayer) { try { map.removeLayer(AS.boundaryLayer); } catch(e) {} AS.boundaryLayer = null; }
    if (AS.campGroup)     { try { map.removeLayer(AS.campGroup);     } catch(e) {} AS.campGroup = null; }

    AS.boundary = null;
    AS.camps    = [];

    const panel = document.getElementById('asSplitPanel');
    if (panel) panel.classList.remove('open');

    // Restore the draw control to its default hidden state
    try { map.removeControl(drawControl); } catch(e) {}

    setStatus('Ready — select a field or use the drawing tools');
}

// Kept for backward-compat (ESC handler in gt-utils.js calls this)
function asDestroyMap() { closeAutoSplit(); }

// ── Redraw boundary without closing panel ─────────────────────
function _asRedrawBoundary() {
    if (AS.boundaryLayer) { try { map.removeLayer(AS.boundaryLayer); } catch(e) {} AS.boundaryLayer = null; }
    _asClearCampLayers();
    AS.boundary = null;
    AS.camps    = [];

    // Slide panel back out
    const panel = document.getElementById('asSplitPanel');
    if (panel) panel.classList.remove('open');

    // Re-activate the draw tool
    window._asSplitMode = true;
    try { map.addControl(drawControl); } catch(e) {}
    setTimeout(() => {
        const btn = document.querySelector('#map .leaflet-draw-draw-polygon');
        if (btn) btn.click();
    }, 100);
    setStatus('✏️ Redraw: trace the farm outer boundary — double-click to finish');
}

// ── Save camps to main field list ─────────────────────────────
function asSave() {
    if (!AS.camps.length) { alert('No camps to save — draw a boundary first.'); return; }

    // Collect any edited names from inputs
    document.querySelectorAll('.as-name-input').forEach((inp, i) => {
        if (AS.camps[i]) AS.camps[i].name = inp.value.trim() || AS.camps[i].name;
    });

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

    saveFields([...loadFields(), ...newFields]);

    // Replace preview layers with proper styled field layers
    _asClearCampLayers();
    if (AS.campGroup) { try { map.removeLayer(AS.campGroup); } catch(e) {} AS.campGroup = null; }
    if (AS.boundaryLayer) { try { map.removeLayer(AS.boundaryLayer); } catch(e) {} AS.boundaryLayer = null; }

    newFields.forEach(field => {
        try {
            const layer = L.geoJSON(field.geometry).getLayers()[0];
            if (layer) { styleLayer(layer, field); bindFieldLayer(layer, field); drawnItems.addLayer(layer); }
        } catch(e) {}
    });

    renderFieldList();
    updateStats();

    const panel = document.getElementById('asSplitPanel');
    if (panel) panel.classList.remove('open');
    AS.boundary = null; AS.camps = []; window._asSplitMode = false;

    setStatus(`✅ ${newFields.length} camp${newFields.length!==1?'s':''} created.`);
    if (newFields.length) setTimeout(() => selectField(newFields[0].id), 300);
}

// ── Panel render ──────────────────────────────────────────────
function _asRenderPanel() {
    const panel = document.getElementById('asControlPanel');
    if (!panel) return;

    // Reshape state
    if (AS.reshapeIdx !== null) {
        const camp = AS.camps[AS.reshapeIdx];
        panel.innerHTML = `
            <div class="as-reshape-state">
                <div class="as-reshape-icon" style="background:${camp.color}">✎</div>
                <p class="as-reshape-title">Reshaping: ${camp.name}</p>
                <p class="as-reshape-sub">
                    Drag the white handles on the map to move corners.<br>
                    Click a boundary edge to add a new corner.
                </p>
                <div class="as-reshape-actions">
                    <button class="btn-primary" onclick="_asFinishReshape(true)">✓ Save shape</button>
                    <button class="btn-ghost"   onclick="_asFinishReshape(false)">✕ Cancel</button>
                </div>
                <p class="as-reshape-note">
                    Changing camp count or direction will recalculate all camps and discard manual reshaping.
                </p>
            </div>`;
        document.getElementById('asSaveBtn').disabled = true;
        return;
    }

    // No boundary yet
    if (!AS.boundary) {
        panel.innerHTML = `
            <div class="as-welcome">
                <div class="as-welcome-icon">⬡</div>
                <h2 class="as-welcome-title">Draw your boundary</h2>
                <p class="as-welcome-sub">Click the polygon tool on the map to trace your farm's outer edge, then double-click to close the shape.</p>
            </div>`;
        document.getElementById('asSaveBtn').disabled = true;
        return;
    }

    // SVG icons for direction buttons
    const SVG_V = `<svg viewBox="0 0 32 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="30" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><line x1="11" y1="1" x2="11" y2="19" stroke="currentColor" stroke-width="1.2"/><line x1="21" y1="1" x2="21" y2="19" stroke="currentColor" stroke-width="1.2"/></svg>`;
    const SVG_H = `<svg viewBox="0 0 32 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="30" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="7.5" x2="31" y2="7.5" stroke="currentColor" stroke-width="1.2"/><line x1="1" y1="13.5" x2="31" y2="13.5" stroke="currentColor" stroke-width="1.2"/></svg>`;
    const SVG_G = `<svg viewBox="0 0 32 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="30" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="10.5" x2="31" y2="10.5" stroke="currentColor" stroke-width="1.2"/><line x1="16" y1="1" x2="16" y2="19" stroke="currentColor" stroke-width="1.2"/></svg>`;

    const totalHa = AS.camps.reduce((s, c) => s + c.areaHa, 0);

    panel.innerHTML = `
        <div class="as-section">
            <div class="as-section-title">Number of camps</div>
            <div class="as-count-input-row">
                <button class="as-count-btn" onclick="asSetCount(AS.count-1)" aria-label="Fewer">−</button>
                <input type="number" id="asCampNumInput" class="as-count-input" min="1" max="50" value="${AS.count}"
                    onchange="asSetCount(parseInt(this.value)||1)"
                    onkeydown="if(event.key==='Enter')asSetCount(parseInt(this.value)||1)">
                <button class="as-count-btn" onclick="asSetCount(AS.count+1)" aria-label="More">+</button>
            </div>
        </div>

        <div class="as-section">
            <div class="as-section-title">Split direction</div>
            <div class="as-dir-row">
                <button class="as-dir-btn${AS.dir==='vertical'  ?' active':''}" onclick="asSetDir('vertical')">
                    ${SVG_V}<span>Vertical</span>
                </button>
                <button class="as-dir-btn${AS.dir==='horizontal'?' active':''}" onclick="asSetDir('horizontal')">
                    ${SVG_H}<span>Horizontal</span>
                </button>
                <button class="as-dir-btn${AS.dir==='grid'      ?' active':''}" onclick="asSetDir('grid')">
                    ${SVG_G}<span>Grid</span>
                </button>
            </div>
        </div>

        ${(AS.dividers.length > 0 || AS.dir === 'grid') ? `
        <div class="as-section">
            <div class="as-section-title">Fine-tune dividers <span class="as-section-hint">drag to resize</span></div>
            ${AS.camps.length === 0
                ? '<p class="as-no-dividers" style="color:#dc2626">Could not split — try a different direction or a simpler shape.</p>'
                : _asBuildDividerHTML()}
        </div>` : ''}

        <div class="as-section">
            <div class="as-section-title">
                Camps
                <span class="as-total-badge" id="asTotalBadge">${AS.camps.length} · ${totalHa.toFixed(1)} ha</span>
            </div>
            <div class="as-name-list">
                ${AS.camps.map((c,i) => `
                <div class="as-name-row">
                    <span class="as-camp-dot" style="background:${c.color}"></span>
                    <input class="as-name-input" type="text" value="${c.name}"
                        oninput="AS.camps[${i}].name=this.value" placeholder="Camp name">
                    <span class="as-size-lbl" id="as-size-${i}">${c.areaHa.toFixed(1)} ha</span>
                    <button class="as-reshape-btn" title="Reshape on map" onclick="asReshapeCamp(${i})">✎</button>
                </div>`).join('')}
            </div>
        </div>

        <button class="as-redraw-btn" onclick="_asRedrawBoundary()">↺ Redraw boundary</button>`;

    document.getElementById('asSaveBtn').disabled = AS.camps.length === 0;
}

// ── Divider controls ──────────────────────────────────────────
function _asBuildDividerHTML() {
    if (AS.camps.length <= 1)
        return '<p class="as-no-dividers">Only one camp — increase the count above.</p>';

    if (AS.dir === 'grid') {
        let html = '';
        if (AS.colDividers.length) {
            html += '<div class="as-div-group-lbl">↔ Column dividers</div>';
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
            html += '<div class="as-div-group-lbl" style="margin-top:10px">↕ Row dividers</div>';
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

    // Vertical/Horizontal: one card per divider showing position + tilt together
    return AS.dividers.map((div,i) => {
        const pct  = Math.round(div.pos*100);
        const lo   = i===0 ? 5 : Math.round(AS.dividers[i-1].pos*100)+5;
        const hi   = i===AS.dividers.length-1 ? 95 : Math.round(AS.dividers[i+1].pos*100)-5;
        const ang  = div.angle || 0;
        const dotA = AS_COLORS[i       % AS_COLORS.length];
        const dotB = AS_COLORS[(i+1)   % AS_COLORS.length];
        return `
        <div class="as-div-card">
            <div class="as-div-card-hdr">
                <span class="as-div-card-swatch" style="background:${dotA}"></span>
                <span class="as-div-card-sep">↔</span>
                <span class="as-div-card-swatch" style="background:${dotB}"></span>
                <span class="as-div-card-title">Divider ${i+1}</span>
                <span class="as-div-card-camps">Camp ${i+1} / ${i+2}</span>
            </div>
            <div class="as-div-row">
                <label class="as-div-lbl">Position</label>
                <input type="range" id="as-div-${i}" class="as-div-slider" min="${lo}" max="${hi}" value="${pct}"
                    oninput="asOnDiv(${i},this.value)">
                <span class="as-div-pct" id="as-div-pct-${i}">${pct}%</span>
            </div>
            <div class="as-div-row">
                <label class="as-div-lbl">Tilt</label>
                <input type="range" id="as-div-ang-${i}" class="as-div-slider as-ang-slider" min="-45" max="45" value="${ang}"
                    oninput="asOnDivAngle(${i},this.value)">
                <span class="as-div-pct" id="as-div-ang-pct-${i}">${ang>0?'+':''}${ang}°</span>
            </div>
        </div>`;
    }).join('');
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
    AS.dividers[idx].pos = parseInt(val)/100;
    const pEl = document.getElementById(`as-div-pct-${idx}`); if(pEl) pEl.textContent = val+'%';
    const prev = document.getElementById(`as-div-${idx-1}`); if(prev) prev.max = parseInt(val)-5;
    const next = document.getElementById(`as-div-${idx+1}`); if(next) next.min = parseInt(val)+5;
    _asScheduleRefresh();
}

function asOnColDiv(idx, val) {
    AS.colDividers[idx] = parseInt(val)/100;
    const pEl = document.getElementById(`as-cdiv-pct-${idx}`); if(pEl) pEl.textContent = val+'%';
    const prev = document.getElementById(`as-cdiv-${idx-1}`); if(prev) prev.max = parseInt(val)-5;
    const next = document.getElementById(`as-cdiv-${idx+1}`); if(next) next.min = parseInt(val)+5;
    _asScheduleRefresh();
}

function asOnRowDiv(idx, val) {
    AS.rowDividers[idx] = parseInt(val)/100;
    const pEl = document.getElementById(`as-rdiv-pct-${idx}`); if(pEl) pEl.textContent = val+'%';
    const prev = document.getElementById(`as-rdiv-${idx-1}`); if(prev) prev.max = parseInt(val)-5;
    const next = document.getElementById(`as-rdiv-${idx+1}`); if(next) next.min = parseInt(val)+5;
    _asScheduleRefresh();
}

function asOnDivAngle(idx, val) {
    AS.dividers[idx].angle = parseInt(val);
    const pEl = document.getElementById(`as-div-ang-pct-${idx}`);
    if (pEl) { const ang = AS.dividers[idx].angle; pEl.textContent = (ang>0?'+':'')+ang+'°'; }
    _asScheduleRefresh();
}

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
        const total = AS.camps.reduce((s,c)=>s+c.areaHa,0);
        badge.textContent = `${AS.camps.length} · ${total.toFixed(1)} ha`;
    }
    if (AS.camps.length===0) _asRenderPanel();
    const saveBtn = document.getElementById('asSaveBtn');
    if (saveBtn) saveBtn.disabled = AS.camps.length===0;
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
                    const [before,after] = c0<c1 ? [cuts[0],cuts[1]] : [cuts[1],cuts[0]];
                    polys.push(before);
                    remaining = _asLargestPolygon(after);
                }
            }
            polys.push(remaining);
        }

        const valid = polys.filter(p => calcAreaHa(p.geometry) > 0.01);
        AS.camps = valid.map((p,i) => ({
            id:      uid(),
            name:    oldNames[i] || `Camp ${i+1}`,
            geometry:p.geometry,
            color:   AS_COLORS[i % AS_COLORS.length],
            areaHa:  calcAreaHa(p.geometry)
        }));
    } catch(err) {
        AS.camps = [];
    }
}

function _asLargestPolygon(feature) {
    if (!feature || !feature.geometry) return feature;
    if (feature.geometry.type !== 'MultiPolygon') return feature;
    let bestArea=-1, bestCoords=null;
    for (const ring of feature.geometry.coordinates) {
        const area = calcAreaHa({ type:'Polygon', coordinates:ring });
        if (area > bestArea) { bestArea = area; bestCoords = ring; }
    }
    return bestCoords ? turf.polygon(bestCoords) : feature;
}

function _asDividerLine(div, bbox) {
    const [minLng,minLat,maxLng,maxLat] = bbox;
    const ang = (div.angle||0) * Math.PI/180;
    const L   = 3 * Math.max(maxLng-minLng, maxLat-minLat);
    let baseX, baseY, dx, dy;
    if (AS.dir === 'vertical') {
        baseX=minLng+div.pos*(maxLng-minLng); baseY=(minLat+maxLat)/2;
        dx=Math.sin(ang); dy=Math.cos(ang);
    } else {
        baseX=(minLng+maxLng)/2; baseY=minLat+div.pos*(maxLat-minLat);
        dx=Math.cos(ang); dy=Math.sin(ang);
    }
    return [[baseX-L*dx,baseY-L*dy],[baseX+L*dx,baseY+L*dy]];
}

function _asCutWithLine(poly, linePts) {
    try {
        const [p1,p2] = linePts;
        const dx=p2[0]-p1[0], dy=p2[1]-p1[1];
        const len=Math.sqrt(dx*dx+dy*dy)||1;
        const nx=-dy/len, ny=dx/len, ext=len;
        const lc=[p1,p2,[p2[0]+nx*ext,p2[1]+ny*ext],[p1[0]+nx*ext,p1[1]+ny*ext],[p1[0],p1[1]]];
        const rc=[p1,p2,[p2[0]-nx*ext,p2[1]-ny*ext],[p1[0]-nx*ext,p1[1]-ny*ext],[p1[0],p1[1]]];
        const inp=(poly.geometry&&poly.geometry.type==='MultiPolygon')?_asLargestPolygon(poly):poly;
        const left =turf.intersect(inp,turf.polygon([lc]));
        const right=turf.intersect(inp,turf.polygon([rc]));
        const result=[];
        if(left)  result.push(left);
        if(right) result.push(right);
        return result.length===2?result:[poly];
    } catch(e) { return [poly]; }
}

// ── Map layer helpers ─────────────────────────────────────────
function _asClearCampLayers() {
    if (AS.campGroup) AS.campGroup.clearLayers();
    AS.campLayers = [];
}

function _asDrawCampLayers() {
    if (!map || !AS.campGroup) return;
    AS.camps.forEach(camp => {
        try {
            const layer = L.geoJSON(
                { type:'Feature', geometry:camp.geometry, properties:{} },
                { style:{ color:camp.color, fillColor:camp.color, fillOpacity:0.38, weight:2 } }
            );
            AS.campGroup.addLayer(layer);
            AS.campLayers.push(layer);

            let cLat, cLng;
            try {
                const c = turf.centroid({ type:'Feature', geometry:camp.geometry, properties:{} });
                [cLng,cLat] = c.geometry.coordinates;
            } catch(e) {
                const ring = camp.geometry.type==='Polygon'
                    ? camp.geometry.coordinates[0]
                    : camp.geometry.coordinates[0][0];
                cLng = ring.reduce((s,p)=>s+p[0],0)/ring.length;
                cLat = ring.reduce((s,p)=>s+p[1],0)/ring.length;
            }
            const icon = L.divIcon({ className:'', html:`<div class="camp-lbl">${camp.name}</div>`, iconAnchor:[30,10] });
            const m = L.marker([cLat,cLng],{ icon, interactive:false });
            AS.campGroup.addLayer(m);
            AS.campLayers.push(m);
        } catch(e) {}
    });
}

// ── Reshape a single camp ─────────────────────────────────────
function asReshapeCamp(idx) {
    if (AS.reshapeIdx !== null) return;
    AS.reshapeIdx = idx;

    _asClearCampLayers();

    // Draw other camps dimly
    AS.camps.forEach((camp,i) => {
        if (i === idx) return;
        try {
            const l = L.geoJSON(
                { type:'Feature', geometry:camp.geometry, properties:{} },
                { style:{ color:camp.color, fillColor:camp.color, fillOpacity:0.1, weight:1.5, dashArray:'4 3' } }
            );
            AS.campGroup.addLayer(l);
            AS.campLayers.push(l);
        } catch(e) {}
    });

    // Editable feature group for the selected camp
    AS.reshapeGroup = new L.FeatureGroup().addTo(map);
    try {
        L.geoJSON(
            { type:'Feature', geometry:AS.camps[idx].geometry, properties:{} },
            { style:{ color:AS.camps[idx].color, fillColor:AS.camps[idx].color, fillOpacity:0.55, weight:3 } }
        ).eachLayer(l => AS.reshapeGroup.addLayer(l));
    } catch(e) {}

    AS.reshapeControl = new L.Control.Draw({
        position:'topleft', draw:false,
        edit:{ featureGroup:AS.reshapeGroup, remove:false }
    });
    map.addControl(AS.reshapeControl);
    setTimeout(() => { const b=document.querySelector('.leaflet-draw-edit-edit'); if(b) b.click(); }, 80);

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
            const saveBtn = document.querySelector('.leaflet-draw-edit-save');
            if (saveBtn) saveBtn.click();
            map.removeControl(AS.reshapeControl);
        } catch(e) {}
        AS.reshapeControl = null;
    }
    if (AS.reshapeGroup) {
        try { map.removeLayer(AS.reshapeGroup); } catch(e) {}
        AS.reshapeGroup = null;
    }

    AS.reshapeIdx = null;
    _asClearCampLayers();
    _asDrawCampLayers();
    _asRenderPanel();
}

// ── Reset dividers to equal spacing ──────────────────────────
function _asResetDividers() {
    if (AS.dir === 'grid') {
        const cols = Math.ceil(Math.sqrt(AS.count));
        const rows = Math.ceil(AS.count / cols);
        AS.colDividers = [];
        AS.rowDividers = [];
        for (let i=1; i<cols; i++) AS.colDividers.push(i/cols);
        for (let i=1; i<rows; i++) AS.rowDividers.push(i/rows);
    } else {
        AS.dividers = [];
        for (let i=1; i<AS.count; i++) AS.dividers.push({ pos:i/AS.count, angle:0 });
    }
}