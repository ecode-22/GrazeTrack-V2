// ============================================================
//  GrazingTrack — setup.js
// ============================================================

let setupStep = 1;
const TOTAL_STEPS = 5;

let setupData = {
    farmName: '',
    farmLocation: { lat: null, lng: null },
    animalGroups: [],
    grazingCycle: 'standard',
    dayNightConfig: { dayHours: '06:00-18:00', nightHours: '18:00-06:00' },
    farmBoundary: null,
    campCount: 4,
    camps: [],
    skipAutoSplit: false
};

let setupMap = null;
let setupDraw = null;
let setupLayer = null;
let setupCampLayers = [];

function checkFirstRun() {
    const done = localStorage.getItem('gt_setup_done');
    if (!done) openSetup();
}

function openSetup() {
    setupStep = 1;
    setupData = {
        farmName: '',
        farmLocation: { lat: null, lng: null },
        animalGroups: [],
        grazingCycle: 'standard',
        dayNightConfig: { dayHours: '06:00-18:00', nightHours: '18:00-06:00' },
        farmBoundary: null,
        campCount: 4,
        camps: [],
        skipAutoSplit: false
    };
    document.getElementById('modalSetup').style.display = 'flex';
    renderSetupStep();
}

function closeSetup(completed) {
    document.getElementById('modalSetup').style.display = 'none';
    if (setupMap) {
        setupMap.remove();
        setupMap = null;
    }
    if (completed) {
        localStorage.setItem('gt_setup_done', '1');
        applySetupToApp();
    }
}

function renderSetupStep() {
    const body = document.getElementById('setupBody');
    const title = document.getElementById('setupTitle');

    const progress = document.getElementById('setupProgress');


    progress.style.width = ((setupStep / TOTAL_STEPS) * 100) + '%';
    document.getElementById('setupBack').style.display = setupStep > 1 ? 'flex' : 'none';
    document.getElementById('setupNext').textContent = setupStep === TOTAL_STEPS ? 'Finish setup ✓' : 'Next →';

    if (setupStep === 1) renderStep1(title, body);
    if (setupStep === 2) renderStep2(title, body);
    if (setupStep === 3) renderStep3(title, body);
    if (setupStep === 4) renderStep4(title, body);
    if (setupStep === 5) renderStep5(title, body);
}

function renderStep1(title, body) {
    title.textContent = '🌿 Welcome — let\'s set up your farm';
    body.innerHTML = `
    <p class="setup-desc">GrazingTrack will ask a few quick questions to personalise the app for how you farm. You can change any of this later in Settings.</p>
    <div class="setup-field">
      <label>Farm name</label>
      <input type="text" id="s1Name" placeholder="e.g. Riverside Farm" value="${setupData.farmName}" maxlength="50">
    </div>
    <div class="setup-field">
      <label>Your location <span class="setup-optional">(helps centre the map on your farm)</span></label>
      <div class="location-row">
        <input type="text" id="s1Lat" placeholder="Latitude e.g. -26.20" value="${setupData.farmLocation.lat || ''}">
        <input type="text" id="s1Lng" placeholder="Longitude e.g. 28.04" value="${setupData.farmLocation.lng || ''}">
        <button class="setup-locate-btn" onclick="autoLocate()">📍 Use GPS</button>
      </div>
      <small>Or leave blank — you can pan the map to your farm in the next steps.</small>
    </div>
    <div class="setup-tip">💡 <strong>Tip:</strong> Open Google Maps, right-click your farm, and copy the coordinates shown at the top of the menu.</div>`;
}

function autoLocate() {
    if (!navigator.geolocation) { alert('GPS not available on this device.'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
        document.getElementById('s1Lat').value = pos.coords.latitude.toFixed(5);
        document.getElementById('s1Lng').value = pos.coords.longitude.toFixed(5);
    }, () => alert('Could not get location. Enter coordinates manually.'));
}

function validateStep1() {
    const name = document.getElementById('s1Name').value.trim();
    if (!name) { alert('Please enter your farm name.'); return false; }
    setupData.farmName = name;
    const lat = parseFloat(document.getElementById('s1Lat').value);
    const lng = parseFloat(document.getElementById('s1Lng').value);
    if (!isNaN(lat) && !isNaN(lng)) setupData.farmLocation = { lat, lng };
    return true;
}

function renderStep2(title, body) {
    title.textContent = '🐄 Your animals';
    body.innerHTML = `
    <p class="setup-desc">Tell us about the animals on your farm. Add one group for each herd or flock that grazes separately.</p>
    <div id="animalGroups">${renderAnimalGroupsList()}</div>
    <button class="setup-add-btn" onclick="addAnimalGroup()">+ Add animal group</button>
    <div class="setup-tip">💡 <strong>Example:</strong> If you have 120 cattle in one herd and 80 sheep in a separate flock, add two groups.</div>`;
}

function renderAnimalGroupsList() {
    if (!setupData.animalGroups.length) return `<div class="setup-empty-groups">No animal groups yet. Click "+ Add animal group" below.</div>`;
    return setupData.animalGroups.map((g, i) => `
    <div class="animal-group-card" id="ag${i}">
      <div class="ag-header"><span class="ag-num">Group ${i + 1}</span><button class="ag-remove" onclick="removeAnimalGroup(${i})">✕</button></div>
      <div class="ag-fields">
        <div class="setup-field inline"><label>Group name</label><input type="text" placeholder="e.g. Main herd" value="${g.name}" onchange="updateGroup(${i},'name',this.value)"></div>
        <div class="setup-field inline"><label>Animal type</label><select onchange="updateGroup(${i},'type',this.value)">${['cattle','sheep','goats','horses','pigs','mixed'].map(t => `<option value="${t}" ${g.type===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}</select></div>
        <div class="setup-field inline"><label>Number of animals</label><input type="number" placeholder="e.g. 120" value="${g.count||''}" min="1" onchange="updateGroup(${i},'count',parseInt(this.value)||0)"></div>
      </div>
    </div>`).join('');
}

function addAnimalGroup() { setupData.animalGroups.push({ name: '', type: 'cattle', count: 0 }); document.getElementById('animalGroups').innerHTML = renderAnimalGroupsList(); }
function removeAnimalGroup(i) { setupData.animalGroups.splice(i, 1); document.getElementById('animalGroups').innerHTML = renderAnimalGroupsList(); }
function updateGroup(i, key, val) { setupData.animalGroups[i][key] = val; }
function validateStep2() { return true; }

function renderStep3(title, body) {
  title.textContent = '🔄 Grazing pattern';
  body.innerHTML = `
    <p class="setup-desc">How do your animals graze? This affects how GrazingTrack tracks usage and suggests rotation schedules.</p>
    <div class="cycle-options">
      <div class="cycle-card ${setupData.grazingCycle==='standard'?'selected':''}" onclick="selectCycle(event, 'standard')">
        <div class="cycle-icon">☀️</div><div class="cycle-name">Standard rotation</div><div class="cycle-desc">Animals graze one camp at a time.</div>
      </div>
      <div class="cycle-card ${setupData.grazingCycle==='daynight'?'selected':''}" onclick="selectCycle(event, 'daynight')">
        <div class="cycle-icon">🌗</div><div class="cycle-name">Day / Night rotation</div><div class="cycle-desc">Animals graze a different section during the day versus at night.</div>
      </div>
    </div>
    <div id="dayNightConfig" style="display:${setupData.grazingCycle==='daynight'?'block':'none'}">
      <div class="setup-tip" style="margin-top:14px">GrazingTrack will track day camps and night camps separately.</div>
      <div class="two-col" style="margin-top:12px">
        <div class="setup-field"><label>Day grazing hours</label><input type="text" id="s3DayHours" placeholder="06:00-18:00" value="${setupData.dayNightConfig.dayHours}"></div>
        <div class="setup-field"><label>Night grazing hours</label><input type="text" id="s3NightHours" placeholder="18:00-06:00" value="${setupData.dayNightConfig.nightHours}"></div>
      </div>
    </div>`;
}

function selectCycle(e, type) {
  setupData.grazingCycle = type;
  document.querySelectorAll('.cycle-card').forEach(c => c.classList.remove('selected'));
  e.currentTarget.classList.add('selected');
  document.getElementById('dayNightConfig').style.display = type === 'daynight' ? 'block' : 'none';
}

function validateStep3() {
  if (setupData.grazingCycle === 'daynight') {
    const dh = document.getElementById('s3DayHours').value.trim();
    const nh = document.getElementById('s3NightHours').value.trim();
    setupData.dayNightConfig = { dayHours: dh || '06:00-18:00', nightHours: nh || '18:00-06:00' };
  }
  return true;
}

function renderStep4(title, body) {
  title.textContent = '🗺 Draw your farm & detect camps';
  body.innerHTML = `
    <p class="setup-desc">You can either draw your farm boundary and let us split it into camps automatically, or skip this and draw each field manually on the main map later.</p>
    <div class="setup-field">
      <label style="display:flex; align-items:center; gap:8px;">
        <input type="checkbox" id="skipAutoSplit" ${setupData.skipAutoSplit ? 'checked' : ''} onchange="toggleAutoSplit()"> Skip auto‑split — I'll draw fields manually
      </label>
    </div>
    <div id="autoSplitSection" style="display:${setupData.skipAutoSplit ? 'none' : 'block'}">
      <div class="camp-count-row">
        <label>How many camps does your farm have?</label>
        <div class="camp-count-ctrl"><button onclick="changeCampCount(-1)">−</button><span id="campCountDisplay">${setupData.campCount}</span><button onclick="changeCampCount(1)">+</button></div>
      </div>
      <div class="split-direction-row"><label>Split method</label><select id="splitDir"><option value="grid">Grid (best for even division)</option><option value="vertical">Vertical strips</option><option value="horizontal">Horizontal strips</option></select></div>
      <div id="setupMapWrap"><div id="setupMap"></div><div class="setup-map-hint" id="setupMapHint">Click the polygon button, then click around your farm boundary. Double-click to finish.</div></div>
      <div class="setup-map-actions"><button class="setup-action-btn" onclick="redrawCamps()">⟳ Re-split camps</button><button class="setup-action-btn danger" onclick="clearFarmBoundary()">✕ Clear boundary</button></div>
      <div id="campNameEditor" style="display:none"><div class="setup-field" style="margin-top:12px"><label>Camp names</label><textarea id="campNamesTA" rows="6" style="font-size:12px;font-family:monospace"></textarea></div></div>
    </div>`;
  if (!setupData.skipAutoSplit) setTimeout(() => initSetupMap(), 80);
}

function toggleAutoSplit() {
  const cb = document.getElementById('skipAutoSplit');
  setupData.skipAutoSplit = cb.checked;
  document.getElementById('autoSplitSection').style.display = cb.checked ? 'none' : 'block';
  if (!cb.checked && !setupMap) setTimeout(() => initSetupMap(), 80);
}

function initSetupMap() {
  if (setupMap) { setupMap.remove(); setupMap = null; }
  const center = setupData.farmLocation.lat ? [setupData.farmLocation.lat, setupData.farmLocation.lng] : [-29.0, 25.0];
  setupMap = L.map('setupMap', { zoomControl: true }).setView(center, 13);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(setupMap);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.7 }).addTo(setupMap);
  const drawnSetup = new L.FeatureGroup().addTo(setupMap);
  setupDraw = new L.Control.Draw({ position: 'topright', draw: { polygon: { allowIntersection: false, shapeOptions: { color: '#2d6a4f', fillColor: '#2d6a4f', fillOpacity: 0.15, weight: 3 } }, rectangle: false, circle: false, circlemarker: false, marker: false, polyline: false }, edit: { featureGroup: drawnSetup, remove: true } });
  setupMap.addControl(setupDraw);
  if (setupData.farmBoundary) { setupLayer = L.geoJSON(setupData.farmBoundary, { style: { color: '#2d6a4f', fillColor: '#2d6a4f', fillOpacity: 0.12, weight: 3 } }).addTo(drawnSetup); drawCampSplits(); }
  setupMap.on(L.Draw.Event.CREATED, e => {
    if (setupLayer) drawnSetup.removeLayer(setupLayer);
    setupCampLayers.forEach(l => drawnSetup.removeLayer(l)); setupCampLayers = [];
    setupLayer = e.layer; drawnSetup.addLayer(setupLayer);
    setupData.farmBoundary = setupLayer.toGeoJSON().geometry;
    document.getElementById('setupMapHint').textContent = 'Farm boundary drawn! Camps have been auto-detected below.';
    drawCampSplits(); document.getElementById('campNameEditor').style.display = 'block'; fillCampNamesTA();
  });
  setupMap.on(L.Draw.Event.DELETED, () => { setupData.farmBoundary = null; setupCampLayers.forEach(l => drawnSetup.removeLayer(l)); setupCampLayers = []; document.getElementById('campNameEditor').style.display = 'none'; document.getElementById('setupMapHint').textContent = 'Boundary cleared. Draw again.'; });
}

function changeCampCount(delta) { setupData.campCount = Math.max(1, Math.min(20, setupData.campCount + delta)); document.getElementById('campCountDisplay').textContent = setupData.campCount; if (setupData.farmBoundary) drawCampSplits(); }
function clearFarmBoundary() { setupData.farmBoundary = null; if (setupMap) setupMap.eachLayer(l => { if (l instanceof L.Polygon || l instanceof L.Rectangle) setupMap.removeLayer(l); }); setupCampLayers.forEach(l => { if (setupMap) setupMap.removeLayer(l); }); setupCampLayers = []; document.getElementById('campNameEditor').style.display = 'none'; document.getElementById('setupMapHint').textContent = 'Boundary cleared. Draw again.'; }

function drawCampSplits() {
  if (!setupData.farmBoundary || !setupMap) return;
  setupCampLayers.forEach(l => setupMap.removeLayer(l)); setupCampLayers = [];
  const n = setupData.campCount; const dir = document.getElementById('splitDir') ? document.getElementById('splitDir').value : 'grid';
  const farmPoly = turf.polygon(setupData.farmBoundary.coordinates);
  const bbox = turf.bbox(farmPoly); let cellWidth, cellHeight;
  if (dir === 'vertical') { cellWidth = (bbox[2] - bbox[0]) / n; cellHeight = (bbox[3] - bbox[1]); } else if (dir === 'horizontal') { cellWidth = (bbox[2] - bbox[0]); cellHeight = (bbox[3] - bbox[1]) / n; } else { const cols = Math.ceil(Math.sqrt(n)); const rows = Math.ceil(n / cols); cellWidth = (bbox[2] - bbox[0]) / cols; cellHeight = (bbox[3] - bbox[1]) / rows; }
  const grid = turf.squareGrid(bbox, Math.max(cellWidth, cellHeight), { units: 'degrees' }); const intersections = [];
  grid.features.forEach(cell => { if (intersections.length >= n) return; const intersect = turf.intersect(turf.featureCollection([farmPoly, cell])); if (intersect) intersections.push(intersect); });
  const COLORS_CAMP = ['#2d6a4f','#52b788','#40916c','#74c69d','#1b4332','#34a0a4','#0077b6','#023e8a','#7b2d8b','#c77dff','#d97706','#dc2626','#0891b2','#059669','#7c3aed','#db2777','#b45309'];
  intersections.forEach((poly, idx) => {
    const color = COLORS_CAMP[idx % COLORS_CAMP.length];
    const layer = L.geoJSON(poly, { style: { color, fillColor: color, fillOpacity: 0.35, weight: 2, dashArray: '6 3' } }).addTo(setupMap);
    const centroid = turf.centroid(poly);
    const label = L.divIcon({ className: '', html: `<div style="background:rgba(0,0,0,0.55);color:#fff;padding:3px 7px;border-radius:5px;font-size:11px;font-weight:600;">Camp ${idx+1}</div>`, iconAnchor: [30, 10] });
    const marker = L.marker([centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]], { icon: label, interactive: false }).addTo(setupMap);
    setupCampLayers.push(layer); setupCampLayers.push(marker);
  });
  setupData.camps = intersections.map((poly, i) => ({ id: uid_setup(), name: `Camp ${i + 1}`, geometry: poly.geometry, color: COLORS_CAMP[i % COLORS_CAMP.length] }));
  fillCampNamesTA();
}

function redrawCamps() { if (!setupData.farmBoundary) { alert('Draw your farm boundary first.'); return; } drawCampSplits(); }
function fillCampNamesTA() { const ta = document.getElementById('campNamesTA'); if (!ta) return; ta.value = setupData.camps.map((c,i) => c.name || `Camp ${i+1}`).join('\n'); }

function validateStep4() {
  if (setupData.skipAutoSplit) { setupData.camps = []; return true; }
  if (!setupData.farmBoundary) { if (!confirm('No farm boundary drawn yet. You can draw individual fields manually after setup. Continue?')) return false; setupData.camps = []; return true; }
  const ta = document.getElementById('campNamesTA');
  if (ta && ta.value.trim()) { const names = ta.value.trim().split('\n').map(s => s.trim()).filter(Boolean); setupData.camps.forEach((c, i) => { if (names[i]) c.name = names[i]; }); }
  return true;
}

function renderStep5(title, body) {
  title.textContent = '✅ Review your setup';
  const groups = setupData.animalGroups; const totalAnimals = groups.reduce((s,g) => s + (g.count||0), 0);
  let campsHtml = setupData.skipAutoSplit ? '<div class="review-row"><span class="review-key">Camps</span><span class="review-val">You will draw them manually</span></div>' : setupData.camps.map(c => `<div class="review-row sub"><span class="review-key">• ${c.name}</span><span class="review-val" style="color:#9ca3af">${calcAreaHa_setup(c.geometry).toFixed(1)} ha</span></div>`).join('');
  body.innerHTML = `
    <p class="setup-desc">Everything looks good! Click <strong>Finish setup</strong> when ready.</p>
    <div class="review-card"><div class="review-row"><span class="review-key">Farm name</span><span class="review-val">${setupData.farmName || '—'}</span></div></div>
    <div class="review-card"><div class="review-row"><span class="review-key">Total animals</span><span class="review-val">${totalAnimals || '—'}</span></div></div>
    <div class="review-card"><div class="review-row"><span class="review-key">Camps</span><span class="review-val">${setupData.camps.length || '0'}</span></div>${campsHtml}</div>`;
}

function setupNext() {
  let valid = true;
  if (setupStep === 1) valid = validateStep1();
  if (setupStep === 2) valid = validateStep2();
  if (setupStep === 3) valid = validateStep3();
  if (setupStep === 4) valid = validateStep4();
  if (!valid) return;
  if (setupStep === TOTAL_STEPS) { closeSetup(true); return; }
  if (setupStep === 4 && setupMap) { setupMap.remove(); setupMap = null; }
  setupStep++; renderSetupStep();
}

function setupBack() { if (setupStep === 1) return; if (setupStep === 4 && setupMap) { setupMap.remove(); setupMap = null; } setupStep--; renderSetupStep(); }

function applySetupToApp() {
  const config = { farmName: setupData.farmName, farmLocation: setupData.farmLocation, animalGroups: setupData.animalGroups, grazingCycle: setupData.grazingCycle, dayNightConfig: setupData.dayNightConfig, setupAt: new Date().toISOString() };
  localStorage.setItem('gt_config', JSON.stringify(config));
  const subtitle = document.querySelector('.farm-subtitle'); if (subtitle && setupData.farmName) subtitle.textContent = setupData.farmName;
  if (setupData.farmLocation.lat && typeof map !== 'undefined' && map) map.setView([setupData.farmLocation.lat, setupData.farmLocation.lng], 14);
  if (setupData.camps.length > 0) {
    const existingFields = loadFields();
    const newFields = setupData.camps.map((camp, i) => ({ id: camp.id, name: camp.name, type: 'pasture', restTarget: 42, maxAUperHa: null, geometry: camp.geometry, areaHa: calcAreaHa_setup(camp.geometry), color: camp.color, createdAt: new Date().toISOString(), version: 3, grazingMode: setupData.grazingCycle === 'daynight' ? (i % 2 === 0 ? 'day' : 'night') : 'standard' }));
    saveFields([...existingFields, ...newFields]);
    if (typeof restoreFieldsOnMap !== 'undefined') { if (typeof drawnItems !== 'undefined' && drawnItems) drawnItems.clearLayers(); restoreFieldsOnMap(); renderFieldList(); updateStats(); }
  }
  if (setupData.grazingCycle === 'daynight') localStorage.setItem('gt_daynight', '1');
  const toast = document.createElement('div'); toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#2d6a4f;color:#fff;padding:12px 24px;border-radius:20px;font-size:13px;z-index:9999;'; toast.textContent = `Welcome, ${setupData.farmName}!`; document.body.appendChild(toast); setTimeout(() => toast.remove(), 4000);
}

function uid_setup() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function calcAreaHa_setup(geometry) {
  if (!geometry || geometry.type !== 'Polygon') return 0;
  const coords = geometry.coordinates[0]; const R = 6371000; let area = 0;
  for (let i = 0; i < coords.length - 1; i++) { const [lng1,lat1]=coords[i],[lng2,lat2]=coords[i+1]; const x1=lng1*Math.PI/180*R*Math.cos(lat1*Math.PI/180),y1=lat1*Math.PI/180*R; const x2=lng2*Math.PI/180*R*Math.cos(lat2*Math.PI/180),y2=lat2*Math.PI/180*R; area += x1*y2-x2*y1; }
  return Math.abs(area/2)/10000;
}