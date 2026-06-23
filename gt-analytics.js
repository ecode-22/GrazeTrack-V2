// ============================================================
//  gt-analytics.js  —  Analytics Overview Page
//  Comprehensive farm data visualisation and insights
// ============================================================
'use strict';

// ── Main render function ─────────────────────────────────────
function renderAnalytics() {
    const panel = document.getElementById('panel-analytics');
    if (!panel) return;

    // Make sure global functions are available
    if (typeof loadFields === 'undefined') {
        panel.innerHTML = '<div class="sv"><div class="empty-state"><div class="empty-icon">⚠️</div><p class="empty-msg">Loading...</p></div></div>';
        return;
    }

    const fields = loadFields();
    const events = loadEvents();
    const groups = loadGroups();
    const today = todayStr();

    if (!fields.length) {
        panel.innerHTML = `
            <div class="sv" style="display:flex;align-items:center;justify-content:center">
                <div class="empty-state">
                    <div class="empty-icon">📊</div>
                    <p class="empty-msg">No data to analyse yet</p>
                    <p class="empty-sub">Add fields and log grazing events to see insights here.</p>
                </div>
            </div>`;
        return;
    }

    const totalHa = fields.reduce((s, f) => s + f.areaHa, 0);
    const statuses = fields.map(f => getStatus(f));
    const nGrazing = statuses.filter(s => s.cls === 'grazing').length;
    const nReady = statuses.filter(s => s.cls === 'ready').length;
    const nResting = statuses.filter(s => s.cls === 'resting').length;
    const nDanger = statuses.filter(s => s.cls === 'danger').length;
    const nNever = statuses.filter(s => s.cls === 'none').length;

    // Rest compliance
    const restCompliance = fields.map(f => ({
        name: f.name,
        pct: getReadinessPct(f),
        target: f.restTarget,
        status: getStatus(f),
        area: f.areaHa,
        color: f.color
    })).sort((a, b) => a.pct - b.pct);

    const compliantCount = restCompliance.filter(f => f.pct >= 100).length;
    const complianceRate = fields.length ? Math.round(compliantCount / fields.length * 100) : 0;

    // Active animals
    const activeEvents = events.filter(e => e.startDate <= today && e.endDate >= today);
    const totalAnimalsGrazing = activeEvents.reduce((s, e) => s + (e.animalCount || 0), 0);

    // Monthly event counts for timeline
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toISOString().slice(0, 7);
        const count = events.filter(e => e.startDate.startsWith(key)).length;
        last6Months.push({ month: key, count, label: monthLabel(key) });
    }

    // Field performance data
    const fieldPerformance = fields.map(f => {
        const fEvents = events.filter(e => e.fieldId === f.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
        const totalGrazingDays = fEvents.reduce((s, e) => s + daysBetween(e.startDate, e.endDate), 0);
        const lastEvent = fEvents[0];
        const lastGrazed = lastEvent ? lastEvent.endDate : null;
        const daysSinceLast = lastGrazed ? daysSince(lastGrazed) : null;
        const avgAUperHa = fEvents.length ? (fEvents.reduce((s, e) => s + e.animalCount, 0) / fEvents.length / f.areaHa).toFixed(2) : '—';
        const utilization = f.restTarget > 0 ? Math.min(100, Math.round((totalGrazingDays / 365) * 100)) : 0;

        return {
            id: f.id,
            name: f.name,
            area: f.areaHa,
            type: f.type,
            status: getStatus(f),
            restPct: getReadinessPct(f),
            restTarget: f.restTarget,
            eventCount: fEvents.length,
            totalGrazingDays,
            lastGrazed,
            daysSinceLast,
            avgAUperHa,
            utilization,
            color: f.color,
            maxAUperHa: f.maxAUperHa
        };
    });

    // Build the analytics HTML
    const html = `
    <div class="sv">
        <div class="analytics-header">
            <h2>📊 Farm Analytics</h2>
            <p>Comprehensive overview of your grazing operation — ${today}</p>
        </div>

        <!-- KPI Row -->
        <div class="kpi-row" style="margin-top:20px">
            <div class="kpi">
                <div class="kpi-lbl">Total Fields</div>
                <div class="kpi-val">${fields.length}</div>
                <div class="kpi-sub">${totalHa.toFixed(1)} ha total</div>
            </div>
            <div class="kpi">
                <div class="kpi-lbl">Grazing Now</div>
                <div class="kpi-val">${nGrazing}</div>
                <div class="kpi-sub">${totalAnimalsGrazing} animals active</div>
            </div>
            <div class="kpi">
                <div class="kpi-lbl">Ready to Graze</div>
                <div class="kpi-val">${nReady}</div>
                <div class="kpi-sub">${nNever ? nNever + ' never grazed' : 'rest targets met'}</div>
            </div>
            <div class="kpi">
                <div class="kpi-lbl">Rest Compliance</div>
                <div class="kpi-val">${complianceRate}%</div>
                <div class="kpi-sub">${compliantCount}/${fields.length} fields ready</div>
            </div>
            <div class="kpi">
                <div class="kpi-lbl">Total Events</div>
                <div class="kpi-val">${events.length}</div>
                <div class="kpi-sub">all time</div>
            </div>
        </div>

        <div class="analytics-grid" style="margin-top:20px">
            <!-- Rest Compliance Bar Chart -->
            <div class="analytics-card">
                <div class="analytics-card-title">📈 Rest Compliance by Field</div>
                <div class="bar-chart">
                    ${restCompliance.map(f => {
                        const cls = f.pct >= 100 ? 'good' : f.pct >= 50 ? 'warn' : 'bad';
                        return `
                        <div class="bar-col" title="${f.name}: ${f.pct}%">
                            <div class="bar-value">${f.pct}%</div>
                            <div class="bar-fill ${cls}" style="height:${Math.max(4, f.pct * 1.6)}px"></div>
                            <div class="bar-label">${f.name.length > 10 ? f.name.slice(0, 9) + '…' : f.name}</div>
                        </div>`;
                    }).join('')}
                </div>
                <div style="display:flex;gap:12px;margin-top:12px;font-size:10px;color:var(--text-muted);justify-content:center">
                    <span>🟢 Ready (≥100%)</span>
                    <span>🟡 In Progress (50-99%)</span>
                    <span>🔴 Needs Attention (&lt;50%)</span>
                </div>
            </div>

            <!-- Farm Area Breakdown (Donut) -->
            <div class="analytics-card">
                <div class="analytics-card-title">🌾 Farm Area Breakdown</div>
                <div class="chart-donut-wrap">
                    ${buildDonutChart(fields)}
                </div>
            </div>

            <!-- Grazing Activity Timeline -->
            <div class="analytics-card">
                <div class="analytics-card-title">📅 Monthly Grazing Activity</div>
                <div class="bar-chart" style="height:140px">
                    ${last6Months.map(m => {
                        const maxCount = Math.max(...last6Months.map(x => x.count), 1);
                        const h = Math.max(4, (m.count / maxCount) * 110);
                        return `
                        <div class="bar-col">
                            <div class="bar-value">${m.count}</div>
                            <div class="bar-fill good" style="height:${h}px;background:linear-gradient(180deg,#60a5fa,#3b82f6)"></div>
                            <div class="bar-label">${m.label}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            <!-- Field Performance Table -->
            <div class="analytics-card wide">
                <div class="analytics-card-title">📋 Field Performance Overview</div>
                <div style="overflow-x:auto">
                    <table class="htbl">
                        <thead>
                            <tr>
                                <th>Field</th>
                                <th>Area</th>
                                <th>Status</th>
                                <th>Rest %</th>
                                <th>Events</th>
                                <th>Grazing Days</th>
                                <th>Last Grazed</th>
                                <th>Avg AU/ha</th>
                                <th>Utilisation</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${fieldPerformance.map(f => `
                            <tr onclick="if(typeof switchTab === 'function'){switchTab('map');setTimeout(function(){if(typeof selectField === 'function') selectField('${f.id}');},100)}" style="cursor:pointer">
                                <td style="font-weight:700">
                                    <span class="field-dot" style="display:inline-block;width:8px;height:8px;background:${f.color};border-radius:50%;margin-right:6px"></span>
                                    ${escapeHtml(f.name)}
                                 </td>
                                 <td>${f.area.toFixed(1)} ha</td>
                                 <td><span class="pill pill-${f.status.cls}">${f.status.label}</span></td>
                                 <td><strong style="color:${f.restPct >= 100 ? '#16a34a' : f.restPct >= 50 ? '#d97706' : '#dc2626'}">${f.restPct}%</strong></td>
                                 <td>${f.eventCount}</td>
                                 <td>${f.totalGrazingDays}</td>
                                 <td>${f.lastGrazed ? fmtDate(f.lastGrazed) + (f.daysSinceLast !== null ? ' (' + f.daysSinceLast + 'd ago)' : '') : 'Never'}</td>
                                 <td>${f.avgAUperHa}</td>
                                 <td>
                                    <div style="display:flex;align-items:center;gap:4px">
                                        <div style="flex:1;height:5px;background:var(--border-light);border-radius:10px;overflow:hidden">
                                            <div style="height:100%;width:${f.utilization}%;background:${f.utilization > 80 ? '#f87171' : f.utilization > 40 ? '#fbbf24' : '#4ade80'};border-radius:10px"></div>
                                        </div>
                                        <span style="font-size:10px;font-weight:700">${f.utilization}%</span>
                                    </div>
                                 </td>
                             </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Stocking Rate Summary -->
            <div class="analytics-card">
                <div class="analytics-card-title">📊 Stocking Rate Summary</div>
                ${buildStockingSummary(fields, events)}
            </div>

            <!-- Animal Groups Summary -->
            <div class="analytics-card">
                <div class="analytics-card-title">🐄 Animal Groups</div>
                ${groups.length ? groups.map(g => `
                    <div class="grp-row" style="margin-bottom:6px">
                        <div class="grp-row-icon">${getGroupEmoji(g.type)}</div>
                        <div class="grp-row-info">
                            <div class="grp-row-name">${escapeHtml(g.name)}</div>
                            <div class="grp-row-sub">${g.count} ${g.type}${g.herd ? ' · ' + escapeHtml(g.herd) : ''}</div>
                        </div>
                    </div>`).join('') : '<p style="color:var(--text-muted);font-size:12px">No animal groups defined yet.</p>'}
            </div>
        </div>
    </div>`;

    panel.innerHTML = html;
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

// ── Donut Chart Builder ──────────────────────────────────────
function buildDonutChart(fields) {
    const totalHa = fields.reduce((s, f) => s + f.areaHa, 0);
    if (!totalHa) return '<p style="color:var(--text-muted);font-size:12px">No area data.</p>';

    const R = 70, cx = 90, cy = 90, stroke = 22;
    const circ = 2 * Math.PI * R;
    const sorted = [...fields].sort((a, b) => b.areaHa - a.areaHa);

    let offset = 0;
    const arcs = sorted.map(f => {
        const pct = f.areaHa / totalHa;
        const dash = circ * pct;
        const gap = circ - dash;
        const arc = `<circle cx="${cx}" cy="${cy}" r="${R}"
            fill="none" stroke="${f.color}" stroke-width="${stroke}"
            stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
            stroke-dashoffset="${(-offset * circ).toFixed(2)}"
            transform="rotate(-90 ${cx} ${cy})"
            style="transition:stroke-dasharray .5s ease">
            <title>${escapeHtml(f.name)}: ${f.areaHa.toFixed(1)} ha (${(pct*100).toFixed(1)}%)</title>
        </circle>`;
        offset += pct;
        return arc;
    }).join('');

    const legend = sorted.slice(0, 8).map(f => {
        const pct = (f.areaHa / totalHa * 100).toFixed(1);
        return `<div class="chart-legend-item">
            <span class="chart-legend-dot" style="background:${f.color}"></span>
            <span style="flex:1">${escapeHtml(f.name)}</span>
            <span style="font-weight:700;font-size:11px">${f.areaHa.toFixed(1)} ha</span>
            <span style="color:var(--text-muted);font-size:10px">${pct}%</span>
        </div>`;
    }).join('');

    return `
        <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--border-light)" stroke-width="${stroke}"/>
            ${arcs}
            <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="20" font-weight="900" fill="var(--text)">${totalHa.toFixed(1)}</text>
            <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10" fill="var(--text-muted)">total ha</text>
        </svg>
        <div class="chart-legend">${legend}</div>`;
}

// ── Stocking Summary ─────────────────────────────────────────
function buildStockingSummary(fields, events) {
    const rows = fields.map(f => {
        const fEvents = events.filter(e => e.fieldId === f.id);
        if (!fEvents.length) return null;
        const last = fEvents.sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
        const auHa = (last.animalCount / f.areaHa).toFixed(2);
        const over = f.maxAUperHa && parseFloat(auHa) > f.maxAUperHa;
        return { name: f.name, auHa: parseFloat(auHa), max: f.maxAUperHa, over, color: f.color };
    }).filter(Boolean).sort((a, b) => b.auHa - a.auHa);

    if (!rows.length) return '<p style="color:var(--text-muted);font-size:12px">No stocking data available.</p>';

    const maxAU = Math.max(...rows.map(r => r.auHa), 1);
    return rows.map(r => {
        const barW = Math.round((r.auHa / maxAU) * 100);
        return `
        <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
                <span style="font-weight:600">${escapeHtml(r.name)}</span>
                <span style="color:${r.over ? '#dc2626' : 'var(--text-secondary)'};font-weight:700">
                    ${r.auHa.toFixed(1)} AU/ha
                    ${r.max ? ' / max ' + r.max : ''}
                    ${r.over ? ' ⚠' : ''}
                </span>
            </div>
            <div style="height:7px;background:var(--border-light);border-radius:10px;overflow:hidden">
                <div style="height:100%;width:${barW}%;background:${r.over ? '#f87171' : '#4ade80'};border-radius:10px;transition:width .5s"></div>
            </div>
        </div>`;
    }).join('');
}

// ── Helpers ──────────────────────────────────────────────────
function monthLabel(key) {
    const [yr, mo] = key.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[parseInt(mo, 10) - 1] + ' ' + yr.slice(2);
}

function getGroupEmoji(type) {
    const map = { cattle: '🐄', sheep: '🐑', goats: '🐐', horses: '🐎', pigs: '🐷', mixed: '🐾' };
    return map[(type || '').toLowerCase()] || '🐾';
}