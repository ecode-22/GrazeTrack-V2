// ============================================================
// gt-map.js — Map, field management, tools, NDVI, and Heatmap
// ============================================================
'use strict';

let map, drawnItems, drawControl;
let pendingLayer = null;
let selectedFieldId = null;
let currentTool = 'select';
let vertexCount = 0;

// NDVI globals
let ndviLayer = null;
let ndviActive = false;

// Heatmap globals
let heatmapActive = false;

function _ndviRecentDate() {
    const d = new Date();
    d.setDate(d.getDate() - 21);
    return d.toISOString().slice(0, 10);
}

function toggleNDVIPanel() {
    const panel = document.getElementById('ndviPanel');
    const btn = document.getElementById('btnNDVI');
    if (!panel) return;

    ndviActive = !ndviActive;
    panel.style.display = ndviActive ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', ndviActive);

    if (ndviActive) {
        if (heatmapActive) togglePressureHeatmap(); // Disable heatmap if active

        const dateInput = document.getElementById('ndviDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = _ndviRecentDate();
        }
        applyNDVI();
        setStatus('Satellite view active');
    } else {
        _removeNDVI();
        setStatus('Ready');
    }
}

function applyNDVI() {
    _removeNDVI();
    const dateInput = document.getElementById('ndviDate');
    const opacityInput = document.getElementById('ndviOpacity');
    const date = dateInput ? dateInput.value : _ndviRecentDate();
    const opacity = opacityInput ? parseFloat(opacityInput.value) : 0.7;

    ndviLayer = L.tileLayer(
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`, {
            attribution: '🛰 NASA GIBS',
            maxNativeZoom: 9,
            maxZoom: 20,
            opacity: opacity,
            tileSize: 256
        }
    );
    ndviLayer.addTo(map);
    ndviLayer.on('tileerror', () => setStatus('⚠ NDVI tiles unavailable for this date.'));
}

function _removeNDVI() {
    if (ndviLayer && map && map.hasLayer(ndviLayer)) {
        map.removeLayer(ndviLayer);
    }
    ndviLayer = null;
}

function initMap() {
    if (!document.getElementById('map')) return;

    map = L.map('map', { zoomControl: false }).setView([-29, 25], 6);

    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri', maxZoom: 19 });
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 });
    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap'
    });

    const hyb = L.layerGroup([
        sat,
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.8 })
    ]);

    sat.addTo(map);
    L.control.layers({ 'Satellite': sat, 'Satellite + Labels': hyb, 'Street map': osm, '⛰️ Topography': topo }, {}, { position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);

    drawnItems = new L.FeatureGroup().addTo(map);
    drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
            polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#52b788', fillColor: '#52b788', fillOpacity: 0.25, weight: 2.5, dashArray: '6 4' } },
            rectangle: false,
            circle: false,
            circlemarker: false,
            marker: false,
            polyline: false
        },
        edit: { featureGroup: drawnItems, remove: false }
    });

    map.on(L.Draw.Event.CREATED, e => {
        // Auto-split mode: hand the layer off to the split tool instead of naming it
        if (window._asSplitMode) {
            window._asSplitMode = false;
            try { map.removeControl(drawControl); } catch(er) {}
            if (typeof _asOnBoundaryDrawn === 'function') _asOnBoundaryDrawn(e.layer);
            return;
        }

        pendingLayer = e.layer;
        drawnItems.addLayer(pendingLayer);
        vertexCount = 0;
        updateUndoBtn();
        if (typeof openModal === 'function') openModal('modalName');
        setTimeout(() => {
            const nameInput = document.getElementById('inName');
            if (nameInput) nameInput.focus();
        }, 80);
    });

    map.on('draw:drawvertex', e => {
        const pts = [];
        e.layers.eachLayer(l => pts.push(l.getLatLng()));
        vertexCount = pts.length;
        updateUndoBtn();
        if (pts.length >= 3) {
            const geo = {
                type: 'Polygon',
                coordinates: [
                    [...pts, pts[0]].map(p => [p.lng, p.lat])
                ]
            };
            setStatus(`Drawing — ${pts.length} points · ~${calcAreaHa(geo).toFixed(1)} ha · double-click to finish`);
        } else {
            setStatus(`Drawing — ${pts.length} point${pts.length !== 1 ? 's' : ''} placed · need at least 3`);
        }
    });

    map.on(L.Draw.Event.EDITED, e => {
        e.layers.eachLayer(layer => {
            const fields = loadFields();
            const field = fields.find(f => f.id === layer.options.fieldId);
            if (!field) return;
            field.geometry = layer.toGeoJSON().geometry;
            field.areaHa = calcAreaHa(field.geometry);
            saveFields(fields);
            if (layer.setTooltipContent) {
                layer.setTooltipContent(`<strong>${field.name}</strong><br>${field.areaHa.toFixed(1)} ha`);
            }
        });
        renderFieldList();
        updateStats();
        if (selectedFieldId) selectField(selectedFieldId);
        setStatus('Field shapes updated.');
        setTool('select');
    });

    map.on(L.Draw.Event.EDITSTOP, () => setTool('select'));
    map.on('click', () => { if (currentTool === 'select') deselectField(); });

    restoreFieldsOnMap();
    renderFieldList();
    updateStats();
    updateStorageBar();
}

function setTool(tool) {
    currentTool = tool;
    const btns = document.querySelectorAll('.tcrd');
    btns.forEach(b => b.classList.remove('active'));
    const ub = document.getElementById('btnUndo');
    const eb = document.getElementById('btnEdit');
    const db = document.getElementById('btnDelete');

    if (tool === 'draw') {
        const drawBtn = document.getElementById('btnDraw');
        if (drawBtn) drawBtn.classList.add('active');
        vertexCount = 0;
        if (map && drawControl) map.addControl(drawControl);
        setTimeout(() => { const b = document.querySelector('.leaflet-draw-draw-polygon'); if (b) b.click(); }, 60);
        setStatus('Click to place corners · double-click (or first point) to close · Esc to cancel');
        const toolHint = document.getElementById('toolHint');
        if (toolHint) toolHint.textContent = 'Each click adds a corner. ↩ Undo removes the last point. Double-click to finish.';
        if (eb) eb.style.display = 'none';
    } else if (tool === 'edit') {
        const editBtn = document.getElementById('btnEdit');
        if (editBtn) editBtn.classList.add('active');
        try { if (map && drawControl) map.addControl(drawControl); } catch (e) {}
        setTimeout(() => { const b = document.querySelector('.leaflet-draw-edit-edit'); if (b) b.click(); }, 60);
        setStatus('Drag handles to reshape · click Save in the map toolbar when done');
        if (ub) ub.style.display = 'none';
    } else {
        const selectBtn = document.getElementById('btnSelect');
        if (selectBtn) selectBtn.classList.add('active');
        vertexCount = 0;
        try { if (map && drawControl) map.removeControl(drawControl); } catch (e) {}
        setStatus('Ready — select a field or use the drawing tools');
        const toolHint = document.getElementById('toolHint');
        if (toolHint) toolHint.textContent = 'Click a field on the map or in the list to select it.';
        if (ub) ub.style.display = 'none';
        if (eb) eb.style.display = selectedFieldId ? 'flex' : 'none';
        if (db) db.style.display = selectedFieldId ? 'flex' : 'none';
    }
}

function updateUndoBtn() {
    const b = document.getElementById('btnUndo');
    if (b) b.style.display = (currentTool === 'draw' && vertexCount > 0) ? 'flex' : 'none';
}

function undoLastVertex() {
    const evt = new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(evt, 'keyCode', { get: () => 90 });
    document.dispatchEvent(evt);
    if (vertexCount > 0) vertexCount--;
    updateUndoBtn();
}

function setStatus(msg) {
    const el = document.getElementById('statusMsg');
    if (el) el.textContent = msg;
}

function cancelDraw() {
    if (pendingLayer && drawnItems) {
        drawnItems.removeLayer(pendingLayer);
        pendingLayer = null;
    }
    vertexCount = 0;
    updateUndoBtn();
    if (typeof closeModal === 'function') closeModal('modalName');
    setTool('select');
}

function saveNewField() {
    const nameInput = document.getElementById('inName');
    const typeSelect = document.getElementById('inType');
    const restInput = document.getElementById('inRest');
    const maxAUInput = document.getElementById('inMaxAU');

    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) { alert('Please enter a field name.'); return; }
    if (!pendingLayer) return;

    const geo = pendingLayer.toGeoJSON().geometry;
    const area = calcAreaHa(geo);
    const color = nextColor();
    const maxAU = maxAUInput ? parseFloat(maxAUInput.value) || null : null;

    const field = {
        id: uid(),
        name: name,
        type: typeSelect ? typeSelect.value : 'pasture',
        restTarget: (restInput ? parseInt(restInput.value) : 42) || 42,
        maxAUperHa: maxAU,
        geometry: geo,
        areaHa: area,
        color: color,
        createdAt: new Date().toISOString(),
        version: DB_VERSION || 4
    };

    styleLayer(pendingLayer, field);
    pendingLayer.options.fieldId = field.id;
    bindFieldLayer(pendingLayer, field);

    const fields = loadFields();
    fields.push(field);
    saveFields(fields);

    pendingLayer = null;
    vertexCount = 0;
    updateUndoBtn();
    if (typeof closeModal === 'function') closeModal('modalName');
    setTool('select');
    renderFieldList();
    updateStats();
    selectField(field.id);
    setStatus(`"${name}" saved — ${area.toFixed(1)} ha`);
}

function openEditFieldModal(fieldId) {
    const fields = loadFields();
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const editId = document.getElementById('editFieldId');
    const editName = document.getElementById('editName');
    const editType = document.getElementById('editType');
    const editRest = document.getElementById('editRest');
    const editMaxAU = document.getElementById('editMaxAU');
    const colorPicker = document.getElementById('editColorPicker');

    if (editId) editId.value = field.id;
    if (editName) editName.value = field.name;
    if (editType) editType.value = field.type;
    if (editRest) editRest.value = field.restTarget;
    if (editMaxAU) editMaxAU.value = field.maxAUperHa || '';
    if (colorPicker) {
        colorPicker.innerHTML = COLORS.map(c =>
            `<div class="color-swatch${c === field.color ? ' chosen' : ''}"
                 style="background:${c}"
                 onclick="selectColor(this)"
                 title="${c}"></div>`
        ).join('');
    }
    if (typeof openModal === 'function') openModal('modalEditField');
    setTimeout(() => { const en = document.getElementById('editName'); if (en) en.focus(); }, 80);
}

function selectColor(el) {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('chosen'));
    el.classList.add('chosen');
}

function saveFieldEdit() {
    const editId = document.getElementById('editFieldId');
    const editName = document.getElementById('editName');
    const editType = document.getElementById('editType');
    const editRest = document.getElementById('editRest');
    const editMaxAU = document.getElementById('editMaxAU');

    const id = editId ? editId.value : '';
    const name = editName ? editName.value.trim() : '';

    if (!name) { alert('Enter a field name.'); return; }

    const fields = loadFields();
    const idx = fields.findIndex(f => f.id === id);
    if (idx === -1) return;

    const chosenSwatch = document.querySelector('.color-swatch.chosen');
    const color = chosenSwatch ? chosenSwatch.title : fields[idx].color;

    fields[idx] = {
        ...fields[idx],
        name: name,
        type: editType ? editType.value : 'pasture',
        restTarget: (editRest ? parseInt(editRest.value) : 42) || 42,
        maxAUperHa: editMaxAU ? parseFloat(editMaxAU.value) || null : null,
        color: color
    };

    saveFields(fields);
    if (drawnItems) {
        drawnItems.eachLayer(layer => {
            if (layer.options && layer.options.fieldId === id) {
                styleLayer(layer, fields[idx]);
                bindFieldLayer(layer, fields[idx]);
            }
        });
    }

    if (typeof closeModal === 'function') closeModal('modalEditField');
    renderFieldList();
    if (selectedFieldId === id) selectField(id);
    setStatus(`"${name}" updated.`);
}

function styleLayer(layer, field) {
    if (!layer || !field) return;
    const fillColor = statusFillColor(field);
    layer.setStyle({ color: fillColor, fillColor: fillColor, fillOpacity: 0.38, weight: 2.5 });
}

function bindFieldLayer(layer, field) {
    if (!layer || !field) return;
    layer.options.fieldId = field.id;
    layer.off('click');
    layer.on('click', e => {
        L.DomEvent.stopPropagation(e);
        selectField(field.id);
    });
    layer.unbindTooltip();
    layer.bindTooltip(`<strong>${field.name}</strong><br>${field.areaHa.toFixed(1)} ha`, { permanent: true, direction: 'center', className: 'field-label' });
}

function deleteSelected() {
    if (!selectedFieldId) return;
    const fields = loadFields();
    const field = fields.find(f => f.id === selectedFieldId);
    if (!field || !confirm(`Delete "${field.name}"?\nAll grazing events will also be deleted.`)) return;

    if (drawnItems) {
        drawnItems.eachLayer(l => { if (l.options && l.options.fieldId === selectedFieldId) drawnItems.removeLayer(l); });
    }
    saveFields(fields.filter(f => f.id !== selectedFieldId));
    saveEvents(loadEvents().filter(e => e.fieldId !== selectedFieldId));

    deselectField();
    renderFieldList();
    updateStats();
    setStatus('Field deleted.');
}

function selectField(fieldId) {
    const fields = loadFields();
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    selectedFieldId = fieldId;
    const fieldItems = document.querySelectorAll('.field-item');
    fieldItems.forEach(el => el.classList.toggle('selected', el.dataset.id === fieldId));

    const events = loadEvents().filter(e => e.fieldId === fieldId).sort((a, b) => b.endDate.localeCompare(a.endDate));
    const last = events[0];
    const restDays = last ? daysSince(last.endDate) : null;
    const status = getStatus(field);
    const today = todayStr();
    const activeEvent = events.find(e => e.startDate <= today && e.endDate >= today);
    const pct = getReadinessPct(field);

    let stockHTML = '';
    if (last && field.maxAUperHa) {
        const auHa = last.animalCount / field.areaHa;
        if (auHa > field.maxAUperHa) {
            stockHTML = `<div class="warn-box alert" style="margin:8px 0;font-size:11px">⚠ Last event: ${auHa.toFixed(1)} AU/ha exceeds limit of ${field.maxAUperHa} AU/ha</div>`;
        }
    }

    const barClr = pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#9ca3af';
    const progHTML = `<div class="rest-prog"><div class="rest-prog-fill" style="width:${pct}%;background:${barClr}"></div></div>
        <div class="rest-prog-lbl"><span>Rest progress</span><span>${pct}%${pct < 100 ? ' · ' + (Math.max(0, field.restTarget - (restDays || 0))) + 'd left' : ' · Ready!'}</span></div>`;

    const endBtn = activeEvent ? `<button class="detail-btn end-graze" onclick="endGrazingToday('${activeEvent.id}','${fieldId}')">⏹ End Grazing</button>` : '';

    const detailSection = document.getElementById('detailSection');
    const fieldDetail = document.getElementById('fieldDetail');
    if (detailSection) detailSection.style.display = 'block';
    if (fieldDetail) {
        fieldDetail.innerHTML = `
            <div class="detail-row"><span class="detail-key">Name</span><span class="detail-val">${escapeHtml(field.name)}</span></div>
            <div class="detail-row"><span class="detail-key">Type</span><span class="detail-val">${cap(field.type)}</span></div>
            <div class="detail-row"><span class="detail-key">Area</span><span class="detail-val">${field.areaHa.toFixed(2)} ha</span></div>
            <div class="detail-row"><span class="detail-key">Status</span><span class="detail-val"><span class="pill pill-${status.cls}">${status.label}</span></span></div>
            <div class="detail-row"><span class="detail-key">Rest target</span><span class="detail-val">${field.restTarget} days</span></div>
            <div class="detail-row"><span class="detail-key">Days resting</span><span class="detail-val">${restDays !== null ? restDays + ' days' : 'No events yet'}</span></div>
            <div class="detail-row"><span class="detail-key">Max AU/ha</span><span class="detail-val">${field.maxAUperHa || '—'}</span></div>
            <div class="detail-row"><span class="detail-key">Events logged</span><span class="detail-val">${events.length}</span></div>
            ${progHTML}
            ${stockHTML}
            <div class="detail-actions">
                <button class="detail-btn edit" onclick="openEditFieldModal('${fieldId}')">✎ Edit</button>
                <button class="detail-btn" onclick="openHistoryModal('${fieldId}')">📋 History</button>
                ${endBtn}
                <button class="detail-btn primary" onclick="openGrazingModal('${fieldId}')">+ Graze</button>
            </div>`;
    }

    const deleteBtn = document.getElementById('btnDelete');
    const editBtn = document.getElementById('btnEdit');
    if (deleteBtn) deleteBtn.style.display = 'flex';
    if (editBtn) editBtn.style.display = 'flex';

    if (drawnItems) {
        drawnItems.eachLayer(l => { if (l.options && l.options.fieldId === fieldId && map) map.fitBounds(l.getBounds(), { padding: [60, 60], maxZoom: 17 }); });
    }
    setStatus(`${field.name} — ${field.areaHa.toFixed(2)} ha`);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function endGrazingToday(eventId, fieldId) {
    const events = loadEvents();
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    const today = todayStr();
    const days = daysBetween(ev.startDate, today);
    const fields = loadFields();
    const field = fields.find(f => f.id === fieldId);
    const name = field ? field.name : 'this field';

    if (!confirm(`End grazing on ${name} today?\n\n${ev.animalCount} ${ev.animalType} · ${days} day${days !== 1 ? 's' : ''} (${fmtDate(ev.startDate)} → ${fmtDate(today)})\n\nThe rest period will start from today.`)) return;

    ev.endDate = today;
    saveEvents(events);
    refreshMapColors();
    renderFieldList();
    updateStats();
    selectField(fieldId);
    setStatus(`Grazing ended on "${name}" — rest period started today.`);
}

function deselectField() {
    selectedFieldId = null;
    const fieldItems = document.querySelectorAll('.field-item');
    fieldItems.forEach(el => el.classList.remove('selected'));
    const detailSection = document.getElementById('detailSection');
    if (detailSection) detailSection.style.display = 'none';
    const deleteBtn = document.getElementById('btnDelete');
    const editBtn = document.getElementById('btnEdit');
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (editBtn) editBtn.style.display = 'none';
}

function renderFieldList() {
    const fields = loadFields();
    const fieldCount = document.getElementById('fieldCount');
    const fieldList = document.getElementById('fieldList');

    if (fieldCount) fieldCount.textContent = fields.length;
    if (!fieldList) return;

    if (!fields.length) {
        fieldList.innerHTML = `<div class="empty-state"><div class="empty-icon">🌾</div><p class="empty-msg">No fields yet</p><p class="empty-sub">Use Draw or Auto-split to add paddocks</p></div>`;
        return;
    }

    fieldList.innerHTML = fields.map(f => {
        const s = getStatus(f);
        return `<div class="field-item" data-id="${f.id}" onclick="selectField('${f.id}')">
            <span class="field-dot" style="background:${f.color}"></span>
            <div class="field-item-info">
                <div class="field-item-name">${escapeHtml(f.name)}</div>
                <div class="field-item-meta">${f.areaHa.toFixed(1)} ha · ${cap(f.type)}</div>
            </div>
            <span class="pill pill-${s.cls}">${s.label}</span>
        </div>`;
    }).join('');

    if (selectedFieldId) {
        document.querySelectorAll('.field-item').forEach(el => el.classList.toggle('selected', el.dataset.id === selectedFieldId));
    }
}

function updateStats() {
    const fields = loadFields();
    const totalHa = fields.reduce((s, f) => s + f.areaHa, 0);
    const statuses = fields.map(f => getStatus(f));

    const sFields = document.getElementById('sFields');
    const sHa = document.getElementById('sHa');
    const sGrazing = document.getElementById('sGrazing');
    const sReady = document.getElementById('sReady');

    if (sFields) sFields.textContent = fields.length;
    if (sHa) sHa.textContent = totalHa.toFixed(1) + ' ha';
    if (sGrazing) sGrazing.textContent = statuses.filter(s => s.cls === 'grazing').length || '—';
    if (sReady) sReady.textContent = statuses.filter(s => s.cls === 'ready').length;
}

function getStatus(field) {
    const events = loadEvents().filter(e => e.fieldId === field.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
    if (!events.length) return { label: 'Never grazed', cls: 'none' };
    const latest = events[0],
        today = todayStr();
    if (latest.startDate <= today && latest.endDate >= today) return { label: 'Grazing now', cls: 'grazing' };
    const rest = daysSince(latest.endDate);
    if (rest < 0) return { label: 'Planned', cls: 'resting' };
    if (rest >= field.restTarget) return { label: 'Ready', cls: 'ready' };
    if (rest >= field.restTarget * 0.6) return { label: `${rest}d rest`, cls: 'resting' };
    return { label: 'Needs rest', cls: 'danger' };
}

function getReadinessPct(field) {
    const events = loadEvents().filter(e => e.fieldId === field.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
    if (!events.length) return 100;
    const latest = events[0],
        today = todayStr();
    if (latest.startDate <= today && latest.endDate >= today) return 0;
    return Math.min(100, Math.round(Math.max(0, daysSince(latest.endDate)) / field.restTarget * 100));
}

function statusFillColor(field) {
    const s = getStatus(field);
    if (s.cls === 'grazing') return '#22c55e';
    if (s.cls === 'ready') return '#4ade80';
    if (s.cls === 'resting') return '#facc15';
    if (s.cls === 'danger') return '#f87171';
    return field.color || '#2d6a4f';
}

function restoreFieldsOnMap() {
    const fields = loadFields();
    if (!fields.length || !drawnItems) return;
    const bounds = [];
    fields.forEach(field => {
        try {
            const layer = L.geoJSON(field.geometry).getLayers()[0];
            if (layer) {
                styleLayer(layer, field);
                bindFieldLayer(layer, field);
                drawnItems.addLayer(layer);
                const latLngs = layer.getLatLngs ? layer.getLatLngs()[0] : null;
                if (latLngs) latLngs.forEach(ll => bounds.push(ll));
            }
        } catch (e) { console.warn('Error restoring field:', e); }
    });
    if (bounds.length && map) map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 16 });
}

function refreshMapColors() {
    const fields = loadFields();
    if (!drawnItems) return;
    drawnItems.eachLayer(layer => {
        if (!layer.options || !layer.options.fieldId) return;
        const field = fields.find(f => f.id === layer.options.fieldId);
        if (field) styleLayer(layer, field);
    });
}

function loadFarmConfig() {
    try {
        const cfg = JSON.parse(localStorage.getItem('gt_config') || '{}');
        const farmNameDisplay = document.getElementById('farmNameDisplay');
        if (farmNameDisplay && cfg.farmName) farmNameDisplay.textContent = cfg.farmName;
        if (cfg.lat && cfg.lng && map) map.setView([cfg.lat, cfg.lng], 14);
    } catch (e) {}
}

function checkFirstRun() {
    const done = localStorage.getItem('gt_setup_done');
    if (!done && typeof openSetup === 'function') openSetup();
}

// ── HEATMAP OVERLAY LOGIC ──────────────────────────────────────

function togglePressureHeatmap() {
    heatmapActive = !heatmapActive;
    const btn = document.getElementById('btnHeatmap');
    if (btn) btn.classList.toggle('active', heatmapActive);

    if (heatmapActive) {
        // Disable NDVI if active
        if (typeof ndviActive !== 'undefined' && ndviActive) toggleNDVIPanel();
        applyPressureHeatmap();
        setStatus('🔥 Grazing Pressure Heatmap active (Past 12 months)');
    } else {
        refreshMapColors();
        setStatus('Ready');
    }
}

function applyPressureHeatmap() {
    const fields = loadFields();
    const events = loadEvents();

    // Calculate cutoff date for the past year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10);

    let maxPressure = 0.0001; // Avoid division by zero
    const fieldPressures = {};

    // 1. Calculate pressure per hectare for each field
    fields.forEach(f => {
        const fEvents = events.filter(e => e.fieldId === f.id && e.endDate >= oneYearAgoStr);
        let totalAnimalDays = 0;

        fEvents.forEach(e => {
            // Only count grazing days within the last 365 days
            const start = e.startDate < oneYearAgoStr ? oneYearAgoStr : e.startDate;
            totalAnimalDays += (e.animalCount * daysBetween(start, e.endDate));
        });

        const density = f.areaHa > 0 ? (totalAnimalDays / f.areaHa) : 0;
        fieldPressures[f.id] = density;

        if (density > maxPressure) maxPressure = density;
    });

    // 2. Apply a Green -> Yellow -> Red gradient based on relative pressure
    if (drawnItems) {
        drawnItems.eachLayer(layer => {
            if (layer.options && layer.options.fieldId) {
                const density = fieldPressures[layer.options.fieldId] || 0;
                const ratio = density / maxPressure; // Normalizes from 0.0 to 1.0

                // Color calculation (0 = Green, 0.5 = Yellow, 1.0 = Red)
                const r = ratio < 0.5 ? Math.round(255 * (ratio * 2)) : 255;
                const g = ratio > 0.5 ? Math.round(255 * (1 - (ratio - 0.5) * 2)) : 255;
                const color = `rgb(${r}, ${g}, 0)`;

                layer.setStyle({
                    fillColor: color,
                    fillOpacity: 0.8,
                    color: '#ffffff', // White borders to make them stand out
                    weight: 2
                });

                // Update tooltip to show density
                const tt = layer.getTooltip();
                if (tt) {
                    layer.bindTooltip(`<strong>${tt.getContent().split('<br>')[0].replace(/<[^>]+>/g, '')}</strong><br>${density.toFixed(0)} Animal-Days/ha`, { permanent: false });
                }
            }
        });
    }
}