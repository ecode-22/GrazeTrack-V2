// ============================================================
//  gt-dashboard.js  —  Dashboard, rainfall/weather, rotation,
//                       reports, PDF generation, export/import
// ============================================================
'use strict';

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
    const fields = loadFields();
    const events = loadEvents();
    const today = todayStr();
    const thisMonth = today.slice(0, 7);
    const totalHa = fields.reduce((s, f) => s + f.areaHa, 0);
    const statuses = fields.map(f => getStatus(f));
    const nG = statuses.filter(s => s.cls === 'grazing').length;
    const nR = statuses.filter(s => s.cls === 'ready').length;
    const nRe = statuses.filter(s => s.cls === 'resting').length;
    const nD = statuses.filter(s => s.cls === 'danger').length;
    const evM = events.filter(e => e.startDate.startsWith(thisMonth)).length;

    document.getElementById('dashGrid').innerHTML = [
        { label: 'Total fields', val: fields.length, sub: totalHa.toFixed(1) + ' ha' },
        { label: 'Grazing now', val: nG, sub: nG ? 'fields active' : 'none active' },
        { label: 'Ready to graze', val: nR, sub: 'rest target met' },
        { label: 'Events this month', val: evM, sub: thisMonth },
        { label: 'Resting', val: nRe, sub: 'building up' },
        { label: 'Need rest', val: nD, sub: nD ? '⚠ check these' : 'all ok' }
    ].map(c => `<div class="kpi">
        <div class="kpi-lbl">${c.label}</div>
        <div class="kpi-val">${c.val}</div>
        <div class="kpi-sub">${c.sub}</div>
    </div>`).join('');

    document.getElementById('dashFieldStatus').innerHTML = `
        <div class="card-title">Field status overview</div>
        ${fields.length
            ? `<div class="status-grid">${fields.map(f => {
                const s  = getStatus(f);
                const bg = statusFillColor(f);
                return `<div class="status-tile" style="background:${bg}"
                    onclick="switchTab('map');setTimeout(()=>selectField('${f.id}'),100)">
                    <div class="status-tile-name">${f.name}</div>
                    <div class="status-tile-sub">${f.areaHa.toFixed(1)} ha · ${s.label}</div>
                </div>`;
              }).join('')}</div>`
            : '<p style="color:#9ca3af;font-size:12px">No fields yet.</p>'}`;

    const recent = events.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 8);
    document.getElementById('dashRecentEvents').innerHTML = `
        <div class="card-title">Recent grazing events</div>
        ${recent.length
            ? `<table class="htbl"><thead><tr><th>Field</th><th>Start</th><th>Animals</th><th>Days</th></tr></thead>
               <tbody>${recent.map(e => {
                   const f = fields.find(x => x.id === e.fieldId);
                   return `<tr>
                       <td>${f ? f.name : '—'}</td>
                       <td>${fmtDate(e.startDate)}</td>
                       <td>${e.animalCount} ${e.animalType}</td>
                       <td>${daysBetween(e.startDate, e.endDate)}</td>
                   </tr>`;
               }).join('')}</tbody></table>`
            : '<p class="no-history">No events logged yet.</p>'}`;

    const si = fields.map(f => {
        const fe = events.filter(e => e.fieldId === f.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
        if (!fe.length) return null;
        const last = fe[0];
        const auHa = (last.animalCount / f.areaHa).toFixed(1);
        const over = f.maxAUperHa && (last.animalCount / f.areaHa) > f.maxAUperHa;
        return `<div class="detail-row">
            <span class="detail-key">${f.name}</span>
            <span class="detail-val" style="color:${over ? '#dc2626' : '#166534'}">${auHa} AU/ha ${over ? '⚠' : ''}</span>
        </div>`;
    }).filter(Boolean);
    document.getElementById('dashStocking').innerHTML =
        `<div class="card-title">Stocking rates</div>` +
        (si.length ? si.join('') : '<p style="color:#9ca3af;font-size:12px">No events yet.</p>');

    renderAnimalGroupsCard();
    fetchRainfall();
}

// ── Animal Groups card ────────────────────────────────────────
function renderAnimalGroupsCard() {
    const el = document.getElementById('dashAnimalGroups');
    if (!el) return;
    const groups = loadGroups();

    el.innerHTML = `
        <div class="card-title">
            🐄 Animal Groups
            <button class="grp-add-btn" onclick="openGroupModal(null)">+ Add group</button>
        </div>
        ${!groups.length
            ? `<div class="grp-empty-card">
                <p>No animal groups yet.</p>
                <p style="font-size:11px;color:var(--faint);margin-top:4px">
                    Groups let you log grazing with one tap — the animal type, count and herd fill in automatically.
                </p>
                <button class="btn-primary" style="margin-top:12px;width:100%" onclick="openGroupModal(null)">
                    + Add your first group
                </button>
               </div>`
            : `<div class="grp-list">
                ${groups.map(g => `
                <div class="grp-row">
                    <div class="grp-row-icon">${_groupEmoji(g.type)}</div>
                    <div class="grp-row-info">
                        <div class="grp-row-name">${g.name}</div>
                        <div class="grp-row-sub">${g.count} ${g.type}${g.herd ? ' · ' + g.herd : ''}</div>
                    </div>
                    <div class="grp-row-actions">
                        <button class="grp-btn" onclick="openGroupModal('${g.id}')" title="Edit">✎</button>
                        <button class="grp-btn red" onclick="deleteGroup('${g.id}')" title="Delete">✕</button>
                    </div>
                </div>`).join('')}
               </div>`}`;
}

function _groupEmoji(type) {
    const map = { cattle:'🐄', sheep:'🐑', goats:'🐐', horses:'🐎', pigs:'🐷', mixed:'🐾' };
    return map[(type||'').toLowerCase()] || '🐾';
}

// ── Group modal CRUD ──────────────────────────────────────────
function openGroupModal(id) {
    const groups = loadGroups();
    const g      = id ? groups.find(x => x.id === id) : null;

    document.getElementById('groupModalTitle').textContent = g ? '✎ Edit group' : '🐄 Add animal group';
    document.getElementById('groupEditId').value  = g ? g.id : '';
    document.getElementById('groupName').value    = g ? g.name  : '';
    document.getElementById('groupType').value    = g ? g.type  : '';
    document.getElementById('groupCount').value   = g ? g.count : '';
    document.getElementById('groupHerd').value    = g ? (g.herd || '') : '';

    openModal('modalGroup');
    setTimeout(() => document.getElementById('groupName').focus(), 80);
}

function saveGroup() {
    const name   = document.getElementById('groupName').value.trim();
    const type   = document.getElementById('groupType').value.trim();
    const count  = parseInt(document.getElementById('groupCount').value);
    const herd   = document.getElementById('groupHerd').value.trim();
    const editId = document.getElementById('groupEditId').value;

    if (!name)               { alert('Enter a group name.'); return; }
    if (!type)               { alert('Enter an animal type.'); return; }
    if (!count || count < 1) { alert('Enter a valid number of animals.'); return; }

    const groups = loadGroups();
    let savedId  = editId;

    if (editId) {
        const idx = groups.findIndex(g => g.id === editId);
        if (idx !== -1) groups[idx] = { ...groups[idx], name, type, count, herd };
    } else {
        savedId = 'grp-' + uid();
        groups.push({ id: savedId, name, type, count, herd });
    }

    saveGroups(groups);
    closeModal('modalGroup');
    renderAnimalGroupsCard();

    // If opened from within the grazing modal, refresh the picker
    // and auto-select the group that was just created/edited.
    if (window._addingGroupFromGrazing) {
        _groupSavedFromGrazing(savedId);
    }
}

function deleteGroup(id) {
    const groups = loadGroups();
    const g      = groups.find(x => x.id === id);
    if (!g || !confirm(`Delete group "${g.name}"?`)) return;
    saveGroups(groups.filter(x => x.id !== id));
    renderAnimalGroupsCard();
}

// ── Rainfall & 7-day forecast ─────────────────────────────────
function getFarmCenter() {
    const fields = loadFields();
    if (!fields.length) return null;
    const lats = [], lngs = [];
    fields.forEach(f => f.geometry.coordinates[0].forEach(([lng, lat]) => { lats.push(lat); lngs.push(lng); }));
    return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
}

// Map WMO weather interpretation codes to a display emoji + label.
function wmoInfo(code) {
    if (code === 0)  return { icon: '☀️',  desc: 'Clear' };
    if (code <= 2)   return { icon: '🌤',  desc: 'Partly cloudy' };
    if (code === 3)  return { icon: '☁️',  desc: 'Overcast' };
    if (code <= 48)  return { icon: '🌫️', desc: 'Foggy' };
    if (code <= 55)  return { icon: '🌦️', desc: 'Drizzle' };
    if (code <= 65)  return { icon: '🌧️', desc: 'Rain' };
    if (code <= 75)  return { icon: '❄️',  desc: 'Snow' };
    if (code === 77) return { icon: '🌨️', desc: 'Snow grains' };
    if (code <= 82)  return { icon: '🌧️', desc: 'Showers' };
    if (code <= 86)  return { icon: '🌨️', desc: 'Snow showers' };
    if (code === 95) return { icon: '⛈️', desc: 'Thunderstorm' };
    return { icon: '⛈️', desc: 'Severe storm' };
}

function dayAbbr(dateStr) {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(dateStr + 'T12:00:00').getDay()];
}

async function fetchRainfall() {
    const el = document.getElementById('dashRainfall');
    if (!el) return;
    el.innerHTML = '<div class="card-title">🌧 Rainfall &amp; Forecast</div><p style="color:#9ca3af;font-size:12px;padding:8px 0">Loading weather data…</p>';

    const center = getFarmCenter();
    if (!center) {
        el.innerHTML = '<div class="card-title">🌧 Rainfall &amp; Forecast</div><p style="color:#9ca3af;font-size:12px">Add fields to see rainfall for your farm location.</p>';
        return;
    }

    try {
        // Single call: 14 days history + 7 days forecast.
        // weathercode, temp max/min, precipitation, and rain probability.
        const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${center.lat.toFixed(4)}&longitude=${center.lng.toFixed(4)}` +
            `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
            `&past_days=14&forecast_days=7&timezone=auto`;

        const res  = await fetch(url);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const { time: dates, weathercode: codes, temperature_2m_max: tMax, temperature_2m_min: tMin,
                precipitation_sum: rain, precipitation_probability_max: rainProb } = data.daily;

        const today   = todayStr();
        const histIdx = dates.reduce((acc, d, i) => { if (d < today)  acc.push(i); return acc; }, []);
        const fcIdx   = dates.reduce((acc, d, i) => { if (d >= today) acc.push(i); return acc; }, []);

        const total14 = histIdx.reduce((s, i) => s + (rain[i] || 0), 0);
        const maxR    = Math.max(...histIdx.map(i => rain[i] || 0), 1);

        // History bars
        const histBars = histIdx.map(i => {
            const h       = Math.max(3, Math.round((rain[i] || 0) / maxR * 52));
            const label   = dates[i].slice(5).replace('-', '/');
            const showLbl = histIdx.indexOf(i) % 3 === 0;
            return `<div class="rain-bar-wrap" title="${dates[i]}: ${(rain[i] || 0).toFixed(1)} mm">
                <div class="rain-bar" style="height:${h}px"></div>
                <div class="rain-lbl">${showLbl ? label : ''}</div>
            </div>`;
        }).join('');

        // Forecast cards
        const fcCards = fcIdx.map(i => {
            const w       = wmoInfo(codes[i] || 0);
            const isToday = dates[i] === today;
            const rAmt    = (rain[i] || 0).toFixed(1);
            const prob    = rainProb[i] != null ? rainProb[i] + '%' : '—';
            const maxT    = tMax[i] != null ? Math.round(tMax[i]) + '°' : '—';
            const minT    = tMin[i] != null ? Math.round(tMin[i]) + '°' : '—';
            return `<div class="fc-card${isToday ? ' fc-today' : ''}">
                <div class="fc-day">${isToday ? 'Today' : dayAbbr(dates[i])}</div>
                <div class="fc-icon" title="${w.desc}">${w.icon}</div>
                <div class="fc-temp">${maxT}<span class="fc-tmin"> / ${minT}</span></div>
                <div class="fc-rain">${rAmt}<span class="fc-unit">mm</span></div>
                <div class="fc-prob" title="Rain probability">${prob} 💧</div>
            </div>`;
        }).join('');

        el.innerHTML = `
            <div class="card-title">🌧 Rainfall &amp; 7-Day Forecast</div>
            <div class="rain-section-lbl">Past 14 days</div>
            <div class="rain-bars">${histBars}</div>
            <div class="rain-total">14-day total: <strong>${total14.toFixed(1)} mm</strong></div>
            <div class="rain-section-lbl" style="margin-top:14px">Forecast</div>
            <div class="fc-row">${fcCards}</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:8px">
                Weather: <a href="https://open-meteo.com" target="_blank" style="color:#9ca3af">Open-Meteo.com</a> (free &amp; open source)
            </div>`;
    } catch (err) {
        el.innerHTML = '<div class="card-title">🌧 Rainfall &amp; Forecast</div><p style="color:#9ca3af;font-size:12px">Could not load — check internet connection.</p>';
    }
}

// ── Rotation recommendations ──────────────────────────────────
function renderRotation() {
    const fields = loadFields();
    const hero   = document.getElementById('rotationHero');
    const list   = document.getElementById('rotationList');

    if (!fields.length) {
        hero.innerHTML = '<div class="rh-label">No fields yet</div><div class="rh-sub">Add fields to see rotation recommendations.</div>';
        list.innerHTML = '';
        return;
    }

    const scored = fields.map(f => {
        const pct    = getReadinessPct(f);
        const status = getStatus(f);
        const evs    = loadEvents().filter(e => e.fieldId === f.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
        const last   = evs[0];
        const restDays    = last ? Math.max(0, daysSince(last.endDate)) : null;
        const daysToReady = last && restDays < f.restTarget ? f.restTarget - restDays : 0;
        return { field: f, pct, status, restDays, daysToReady };
    }).sort((a, b) => b.pct - a.pct);

    const best = scored.find(s => s.status.cls === 'ready' || s.status.cls === 'none');
    if (best) {
        hero.innerHTML = `
            <div class="rh-label">Recommended next field</div>
            <div class="rh-name">${best.field.name}</div>
            <div class="rh-sub">${best.field.areaHa.toFixed(1)} ha · ${best.pct}% rest complete · ${cap(best.field.type)}</div>`;
    } else {
        const soonest = scored.filter(s => s.daysToReady > 0).sort((a, b) => a.daysToReady - b.daysToReady)[0];
        hero.innerHTML = `
            <div class="rh-label" style="color:#854d0e">No fields ready yet</div>
            <div class="rh-name" style="color:#92400e;font-size:18px">
                ${soonest ? soonest.field.name + ' ready in ' + soonest.daysToReady + ' days' : 'All fields need more rest'}
            </div>
            <div class="rh-sub">Allow fields to complete their rest period.</div>`;
    }

    list.innerHTML = scored.map(({ field, pct, status, restDays, daysToReady }) => {
        const bc = pct >= 100 ? '#22c55e' : pct >= 60 ? '#facc15' : '#f87171';
        return `<div class="rot-item" onclick="switchTab('map');setTimeout(()=>selectField('${field.id}'),100)">
            <div class="rot-top">
                <div>
                    <div class="rot-name">${field.name}</div>
                    <div class="rot-meta">${field.areaHa.toFixed(1)} ha · ${restDays !== null ? restDays + 'd resting' : 'never grazed'} · target ${field.restTarget}d</div>
                </div>
                <span class="pill pill-${status.cls}">${status.label}</span>
            </div>
            <div class="prog-wrap"><div class="prog-fill" style="width:${pct}%;background:${bc}"></div></div>
            <div class="prog-labels">
                <span>Rest: ${pct}%</span>
                <span>${daysToReady > 0 ? 'Ready in ' + daysToReady + 'd' : pct >= 100 ? '✓ Ready now' : 'Grazing'}</span>
            </div>
        </div>`;
    }).join('');
}

// ── Reports page ──────────────────────────────────────────────
function renderReports() {
    document.getElementById('reportsPage').innerHTML = `
        <div class="rep-section">
            <div class="rep-title">PDF Farm Report</div>
            <p style="font-size:12px;color:#6b7280;margin-bottom:10px;line-height:1.6">
                Generates a landscape PDF with three sections:<br>
                <strong>1. Farm summary</strong> — all fields with area, status and total days grazed<br>
                <strong>2. Monthly grazing days per field</strong> — each month as a row, with a <span style="color:#166534">▲ green arrow</span> when days increased and a <span style="color:#b91c1c">▼ red arrow</span> when they decreased compared to the previous month<br>
                <strong>3. Full event log</strong> — every grazing event sorted by date
            </p>
            <div class="rep-actions"><button class="rep-btn" onclick="generatePDF()">⬇ Download PDF report</button></div>
        </div>
        <div class="rep-section">
            <div class="rep-title">Data Export</div>
            <p style="font-size:12px;color:#6b7280;margin-bottom:10px;line-height:1.6">All your data stays on your device. Export at any time to back up or use with other tools.</p>
            <div class="rep-actions">
                <button class="rep-btn" onclick="exportJSON()">⬇ JSON backup</button>
                <button class="rep-btn" onclick="exportGeoJSON()">⬇ GeoJSON fields</button>
                <button class="rep-btn" onclick="exportCSV()">⬇ Events CSV</button>
                <button class="rep-btn" onclick="exportSensorCSV()">⬇ Soil moisture CSV</button>
            </div>
        </div>
        <div class="rep-section">
            <div class="rep-title">Interoperability</div>
            <p style="font-size:12px;color:#6b7280;line-height:1.7">
                GrazingTrack uses open standards — your data is never locked in.<br>
                • <strong>GeoJSON</strong> — field boundaries open in QGIS, ArcGIS, Google Earth<br>
                • <strong>Events CSV</strong> — grazing history opens in Excel, LibreOffice, Google Sheets<br>
                • <strong>Soil moisture CSV</strong> — moisture readings in a spreadsheet-ready format<br>
                • <strong>JSON backup</strong> — full restore to any GrazingTrack instance
            </p>
        </div>`;
}

// ── PDF generation ────────────────────────────────────────────
// Builds a three-section report:
//   1. Farm summary (fields table)
//   2. Monthly grazing days per field — with ↑/↓ trend arrows
//      comparing each month to the previous month
//   3. Full grazing events log
function generatePDF() {
    if (typeof window.jspdf === 'undefined') { alert('PDF library loading, try again in a moment.'); return; }
    const { jsPDF } = window.jspdf;
    const doc    = new jsPDF({ orientation: 'landscape' });
    const fields = loadFields();
    const events = loadEvents();

    const PAGE_W = 297, PAGE_H = 210;
    const MARGIN = 12;
    const COL_W  = PAGE_W - MARGIN * 2;

    // ── Helper: page-break guard ───────────────────────────────
    function checkPage(needed) {
        if (y + needed > PAGE_H - 14) { doc.addPage(); y = 18; }
    }

    // ── Header ─────────────────────────────────────────────────
    doc.setFillColor(45, 106, 79);
    doc.rect(0, 0, PAGE_W, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text('GrazingTrack — Farm Report', MARGIN, 13);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, PAGE_W - MARGIN, 13, { align: 'right' });

    let y = 26;

    // ── Section title helper ───────────────────────────────────
    function sectionTitle(txt) {
        checkPage(14);
        doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.setTextColor(45, 106, 79);
        doc.text(txt, MARGIN, y);
        doc.setDrawColor(45, 106, 79); doc.setLineWidth(0.3);
        doc.line(MARGIN, y + 1.5, PAGE_W - MARGIN, y + 1.5);
        doc.setTextColor(0, 0, 0); doc.setLineWidth(0.1);
        y += 7;
    }

    // ── Table header helper ────────────────────────────────────
    function tableHeader(cols) {
        // cols: [{label, x, w, align?}]
        doc.setFillColor(240, 253, 244);
        doc.rect(MARGIN, y, COL_W, 6.5, 'F');
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
        doc.setTextColor(22, 101, 52);
        cols.forEach(c => {
            const align = c.align || 'left';
            const tx = align === 'center' ? c.x + c.w / 2 : align === 'right' ? c.x + c.w : c.x + 1;
            doc.text(c.label, tx, y + 4.5, { align });
        });
        y += 6.5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
    }

    // ── Row background alternator ──────────────────────────────
    function rowBg(i) {
        if (i % 2 === 0) { doc.setFillColor(250, 250, 248); doc.rect(MARGIN, y, COL_W, 6, 'F'); }
    }

    // ══════════════════════════════════════════════════════════
    //  SECTION 1 — Farm summary
    // ══════════════════════════════════════════════════════════
    sectionTitle('1. Farm Summary');
    const totalHa = fields.reduce((s, f) => s + f.areaHa, 0);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text(`${fields.length} fields · ${totalHa.toFixed(1)} ha total · ${events.length} grazing events recorded`, MARGIN, y);
    y += 6;

    const sumCols = [
        { label: 'Field name',    x: MARGIN,      w: 55 },
        { label: 'Area (ha)',     x: MARGIN + 55,  w: 22, align: 'center' },
        { label: 'Type',          x: MARGIN + 77,  w: 28 },
        { label: 'Status',        x: MARGIN + 105, w: 36 },
        { label: 'Rest target',   x: MARGIN + 141, w: 26, align: 'center' },
        { label: 'Total events',  x: MARGIN + 167, w: 26, align: 'center' },
        { label: 'Total days',    x: MARGIN + 193, w: 22, align: 'center' },
    ];
    tableHeader(sumCols);

    fields.forEach((f, i) => {
        checkPage(7);
        rowBg(i);
        const s = getStatus(f);
        const fEvents = events.filter(e => e.fieldId === f.id);
        const totalDays = fEvents.reduce((s, e) => s + daysBetween(e.startDate, e.endDate), 0);
        doc.setFontSize(7.5);
        let nm = f.name; if (nm.length > 28) nm = nm.slice(0, 25) + '…';
        doc.text(nm, MARGIN + 1, y + 4);
        doc.text(f.areaHa.toFixed(1), MARGIN + 55 + 11, y + 4, { align: 'center' });
        doc.text(cap(f.type), MARGIN + 78, y + 4);
        doc.text(s.label, MARGIN + 106, y + 4);
        doc.text(f.restTarget + ' days', MARGIN + 141 + 13, y + 4, { align: 'center' });
        doc.text(String(fEvents.length), MARGIN + 167 + 13, y + 4, { align: 'center' });
        doc.text(String(totalDays), MARGIN + 193 + 11, y + 4, { align: 'center' });
        y += 6;
    });

    // ══════════════════════════════════════════════════════════
    //  SECTION 2 — Monthly grazing days per field
    //  Each field gets its own table.
    //  Columns: Month | Days grazed | vs prev month (arrow + diff)
    // ══════════════════════════════════════════════════════════
    y += 6;
    checkPage(20);
    sectionTitle('2. Monthly Grazing Days per Field');

    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('Each field shows how many days it was grazed per month, and whether that increased (↑) or decreased (↓) compared to the previous month.', MARGIN, y);
    y += 6;

    // Build a map: fieldId → { 'YYYY-MM' → days }
    function buildMonthlyMap(fieldId) {
        const fEvents = events.filter(e => e.fieldId === fieldId);
        const map = {};
        fEvents.forEach(e => {
            // An event may span multiple months — attribute days to each month
            const start = new Date(e.startDate);
            const end   = new Date(e.endDate);
            let cur = new Date(start);
            while (cur <= end) {
                const key = cur.toISOString().slice(0, 7); // YYYY-MM
                if (!map[key]) map[key] = 0;
                // Count days in this month that fall within the event
                const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
                const segEnd   = end < monthEnd ? end : monthEnd;
                const segStart = cur;
                const days = Math.max(0, Math.round((segEnd - segStart) / 86400000));
                map[key] += days;
                cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
            }
        });
        return map;
    }

    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    fields.forEach((field) => {
        const fEvents = events.filter(e => e.fieldId === field.id);
        if (fEvents.length === 0) return; // skip fields with no events

        const monthly = buildMonthlyMap(field.id);
        const sortedKeys = Object.keys(monthly).sort();
        if (sortedKeys.length === 0) return;

        checkPage(10 + sortedKeys.length * 6 + 14);

        // Field sub-header
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(45, 106, 79);
        let fn = field.name; if (fn.length > 40) fn = fn.slice(0, 37) + '…';
        doc.text(`${fn}  (${field.areaHa.toFixed(1)} ha)`, MARGIN, y);
        y += 5;

        // Table header for this field
        const mCols = [
            { label: 'Month',          x: MARGIN,      w: 40 },
            { label: 'Year',           x: MARGIN + 40, w: 20, align: 'center' },
            { label: 'Days grazed',    x: MARGIN + 60, w: 28, align: 'center' },
            { label: 'vs prev month',  x: MARGIN + 88, w: 40, align: 'center' },
            { label: 'Events',         x: MARGIN + 128, w: 22, align: 'center' },
            { label: 'Animals',        x: MARGIN + 150, w: 30, align: 'center' },
            { label: 'Notes',          x: MARGIN + 180, w: 80 },
        ];

        // Draw a narrow header
        doc.setFillColor(240, 253, 244);
        doc.rect(MARGIN, y, COL_W, 6, 'F');
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 101, 52);
        mCols.forEach(c => {
            const align = c.align || 'left';
            const tx = align === 'center' ? c.x + c.w / 2 : c.x + 1;
            doc.text(c.label, tx, y + 4, { align });
        });
        y += 6;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);

        sortedKeys.forEach((key, i) => {
            checkPage(7);
            rowBg(i);

            const [yr, mo] = key.split('-');
            const days     = monthly[key];
            const prevKey  = sortedKeys[i - 1];
            const prevDays = prevKey ? monthly[prevKey] : null;

            // Trend indicator
            let trendTxt = '—';
            let trendColor = [100, 100, 100];
            if (prevDays !== null) {
                const diff = days - prevDays;
                if (diff > 0) {
                    trendTxt  = `▲ +${diff} day${diff !== 1 ? 's' : ''}`;
                    trendColor = [22, 101, 52];   // green
                } else if (diff < 0) {
                    trendTxt  = `▼ ${diff} day${Math.abs(diff) !== 1 ? 's' : ''}`;
                    trendColor = [185, 28, 28];   // red
                } else {
                    trendTxt  = '= same';
                    trendColor = [100, 100, 100];
                }
            }

            // Events in this month for this field
            const monthEvents = fEvents.filter(e => {
                return e.startDate.slice(0, 7) === key || e.endDate.slice(0, 7) === key;
            });
            const eventCount = monthEvents.length;
            const animalStr  = monthEvents.length
                ? [...new Set(monthEvents.map(e => `${e.animalCount} ${e.animalType}`))].join(', ')
                : '—';
            const notesStr   = monthEvents
                .map(e => e.notes).filter(Boolean).join('; ')
                .slice(0, 45) + (monthEvents.map(e=>e.notes).filter(Boolean).join('; ').length > 45 ? '…' : '');

            doc.setFontSize(7.5);
            doc.text(MONTH_NAMES[parseInt(mo, 10) - 1], MARGIN + 1, y + 4);
            doc.text(yr, MARGIN + 40 + 10, y + 4, { align: 'center' });
            doc.text(String(days), MARGIN + 60 + 14, y + 4, { align: 'center' });

            // Coloured trend text
            doc.setTextColor(...trendColor);
            doc.text(trendTxt, MARGIN + 88 + 20, y + 4, { align: 'center' });
            doc.setTextColor(0, 0, 0);

            doc.text(String(eventCount), MARGIN + 128 + 11, y + 4, { align: 'center' });
            doc.text(animalStr.slice(0, 22), MARGIN + 151, y + 4);
            if (notesStr) doc.text(notesStr, MARGIN + 181, y + 4);

            y += 6;
        });

        // Field total row
        doc.setFillColor(230, 245, 235);
        doc.rect(MARGIN, y, COL_W, 6, 'F');
        const fieldTotalDays = Object.values(monthly).reduce((s, d) => s + d, 0);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 101, 52);
        doc.text('Total', MARGIN + 1, y + 4);
        doc.text(String(fieldTotalDays) + ' days', MARGIN + 60 + 14, y + 4, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
        y += 8;
    });

    // ══════════════════════════════════════════════════════════
    //  SECTION 3 — Full event log
    // ══════════════════════════════════════════════════════════
    y += 4;
    checkPage(20);
    sectionTitle('3. Full Grazing Event Log');

    const evCols = [
        { label: 'Field',    x: MARGIN,       w: 50 },
        { label: 'Start',    x: MARGIN + 50,  w: 24, align: 'center' },
        { label: 'End',      x: MARGIN + 74,  w: 24, align: 'center' },
        { label: 'Days',     x: MARGIN + 98,  w: 14, align: 'center' },
        { label: 'Animals',  x: MARGIN + 112, w: 38 },
        { label: 'AU/ha',    x: MARGIN + 150, w: 18, align: 'center' },
        { label: 'Notes',    x: MARGIN + 168, w: 97 },
    ];
    tableHeader(evCols);

    [...events].sort((a, b) => a.startDate.localeCompare(b.startDate)).forEach((e, i) => {
        checkPage(7);
        rowBg(i);
        const field = fields.find(f => f.id === e.fieldId);
        const auHa  = field && field.areaHa > 0 ? (e.animalCount / field.areaHa).toFixed(1) : '—';
        doc.setFontSize(7.5);
        let fn = field ? field.name : 'Unknown'; if (fn.length > 26) fn = fn.slice(0, 23) + '…';
        doc.text(fn, MARGIN + 1, y + 4);
        doc.text(fmtDate(e.startDate), MARGIN + 50 + 12, y + 4, { align: 'center' });
        doc.text(fmtDate(e.endDate),   MARGIN + 74 + 12, y + 4, { align: 'center' });
        doc.text(String(daysBetween(e.startDate, e.endDate)), MARGIN + 98 + 7, y + 4, { align: 'center' });
        doc.text(`${e.animalCount} ${cap(e.animalType)}`, MARGIN + 113, y + 4);
        doc.text(String(auHa), MARGIN + 150 + 9, y + 4, { align: 'center' });
        const note = (e.notes || '').slice(0, 55);
        if (note) doc.text(note, MARGIN + 169, y + 4);
        y += 6;
    });

    // ── Footer ──────────────────────────────────────────────
    doc.setFontSize(6.5); doc.setTextColor(160, 160, 160);
    doc.text('GrazingTrack — Free & Open Source — MIT License', MARGIN, PAGE_H - 5);

    doc.save(`grazingtrack-report-${todayStr()}.pdf`);
}


// ── Export / Import ───────────────────────────────────────────
function exportJSON() {
    download('grazingtrack-backup.json', JSON.stringify({
        version:    DB_VERSION,
        exportedAt: new Date().toISOString(),
        fields:     loadFields(),
        events:     loadEvents(),
        groups:     loadGroups()
    }, null, 2), 'application/json');
}

function exportGeoJSON() {
    const fc = {
        type: 'FeatureCollection',
        features: loadFields().map(f => ({
            type: 'Feature',
            properties: { id: f.id, name: f.name, type: f.type, area_ha: f.areaHa, rest_target_days: f.restTarget, max_au_per_ha: f.maxAUperHa || null, color: f.color },
            geometry: f.geometry
        }))
    };
    download('grazingtrack-fields.geojson', JSON.stringify(fc, null, 2), 'application/geo+json');
}

function exportCSV() {
    const fields = loadFields();
    const events = loadEvents();
    const rows   = [['Field', 'Start date', 'End date', 'Days', 'Animal type', 'Count', 'AU/ha', 'Notes']];
    events.sort((a, b) => a.startDate.localeCompare(b.startDate)).forEach(e => {
        const f    = fields.find(x => x.id === e.fieldId);
        const auHa = f ? (e.animalCount / f.areaHa).toFixed(2) : '';
        rows.push([f ? f.name : 'Unknown', e.startDate, e.endDate, daysBetween(e.startDate, e.endDate), e.animalType, e.animalCount, auHa, `"${(e.notes || '').replace(/"/g, '""')}"`]);
    });
    download('grazingtrack-events.csv', rows.map(r => r.join(',')).join('\n'), 'text/csv');
}

function exportSensorCSV() {
    const fields   = loadFields();
    const readings = loadMoisture();
    const rows     = [['Field', 'Date', 'Time', 'Moisture %', 'Depth cm', 'Sensor ID', 'Notes']];
    readings.sort((a, b) => a.date.localeCompare(b.date)).forEach(r => {
        const f = fields.find(x => x.id === r.fieldId);
        rows.push([f ? f.name : 'Unknown', r.date, r.time || '', r.moisture_pct, r.depth_cm || '', r.sensor_id || '', `"${(r.notes || '').replace(/"/g, '""')}"`]);
    });
    download('grazingtrack-moisture.csv', rows.map(r => r.join(',')).join('\n'), 'text/csv');
}

function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data.fields) || !Array.isArray(data.events)) throw new Error();
            if (!confirm(`Import ${data.fields.length} fields and ${data.events.length} events?\nThis replaces all current data.`)) return;
            saveFields(data.fields);
            saveEvents(data.events);
            colorIdx = data.fields.length % COLORS.length;
            drawnItems.clearLayers();
            restoreFieldsOnMap();
            renderFieldList();
            updateStats();
            updateStorageBar();
            deselectField();
            closeModal('modalExport');
            setStatus(`Imported ${data.fields.length} fields.`);
        } catch (err) {
            alert('Invalid backup file.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function clearAllData() {
    if (!confirm('Delete ALL data? Export a backup first!\nThis cannot be undone.')) return;
    ['gt_fields', 'gt_events', 'gt_groups'].forEach(k => localStorage.removeItem(k));
    drawnItems.clearLayers();
    colorIdx = 0;
    renderFieldList();
    updateStats();
    updateStorageBar();
    deselectField();
    closeModal('modalExport');
    setStatus('All data cleared.');
}