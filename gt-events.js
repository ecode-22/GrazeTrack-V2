// ============================================================
//  gt-events.js  —  Grazing events & history
// ============================================================
'use strict';

function _groupEmoji(type) {
    const map = { cattle: '🐄', sheep: '🐑', goats: '🐐', horses: '🐎', pigs: '🐷', mixed: '🐾' };
    return map[(type || '').toLowerCase()] || '🐾';
}

function openGrazingModal(preFieldId) {
    const fields = loadFields();
    if (!fields.length) { alert('Add a field first.'); return; }

    document.getElementById('gField').innerHTML = fields.map(f =>
        `<option value="${f.id}"${f.id === preFieldId ? ' selected' : ''}>${f.name}</option>`
    ).join('');

    const today = todayStr();
    document.getElementById('gStart').value = today;
    document.getElementById('gEnd').value = addDays(today, 7);
    document.getElementById('gAnimalType').value = 'cattle';
    document.getElementById('gCount').value = '';
    document.getElementById('gHerd').value = '';
    document.getElementById('gNotes').value = '';
    document.getElementById('stockingWarning').style.display = 'none';

    _renderGroupPicker();
    openModal('modalGrazing');

    setTimeout(() => {
        const manualInputs = document.getElementById('gManualInputs');
        if (manualInputs && manualInputs.style.display !== 'none') {
            document.getElementById('gCount').focus();
        }
    }, 100);

    const gCount = document.getElementById('gCount');
    const gField = document.getElementById('gField');
    gCount.removeEventListener('input', checkStockingLive);
    gField.removeEventListener('change', checkStockingLive);
    gCount.addEventListener('input', checkStockingLive);
    gField.addEventListener('change', checkStockingLive);
}

function _renderGroupPicker() {
    const groups = loadGroups();
    const wrap = document.getElementById('gGroupPicker');
    const manualInputs = document.getElementById('gManualInputs');
    if (!wrap) return;

    if (!groups.length) {
        wrap.innerHTML = `
            <div class="grp-none">
                <p class="grp-none-msg">No saved animal groups yet</p>
                <button class="grp-none-add" onclick="openGroupModalFromGrazing()">+ Create an animal group</button>
                <p class="grp-none-or">Fill in manually below</p>
            </div>`;
        if (manualInputs) manualInputs.style.display = 'block';
        return;
    }

    wrap.innerHTML = `
        <div class="grp-header">Select a group or enter manually:</div>
        <div class="grp-cards" id="gGroupCards">
            ${groups.map(g => `
            <button class="grp-card" data-id="${g.id}" onclick="_selectGroup('${g.id}')">
                <div class="grp-card-icon">${_groupEmoji(g.type)}</div>
                <div class="grp-card-name">${g.name}</div>
                <div class="grp-card-sub">${g.count} ${g.type}${g.herd ? ' · ' + g.herd : ''}</div>
            </button>`).join('')}
            <button class="grp-card grp-card-manual" onclick="_selectManual()">
                <div class="grp-card-icon">✎</div>
                <div class="grp-card-name">Manual</div>
                <div class="grp-card-sub">Enter details</div>
            </button>
        </div>`;

    if (manualInputs) manualInputs.style.display = 'block';
}

function openGroupModalFromGrazing() {
    window._addingGroupFromGrazing = true;
    openGroupModal(null);
}

function _groupSavedFromGrazing(newGroupId) {
    window._addingGroupFromGrazing = false;
    _renderGroupPicker();                    
    if (newGroupId) _selectGroup(newGroupId); 
}

function _selectGroup(groupId) {
    const g = loadGroups().find(g => g.id === groupId);
    if (!g) return;

    document.querySelectorAll('#gGroupCards .grp-card').forEach(c =>
        c.classList.toggle('selected', c.dataset.id === groupId)
    );

    document.getElementById('gAnimalType').value = g.type  || '';
    document.getElementById('gCount').value      = g.count || '';
    document.getElementById('gHerd').value       = g.herd  || '';

    document.getElementById('gManualInputs').style.display = 'block';
    checkStockingLive();
}

function _selectManual() {
    document.querySelectorAll('#gGroupCards .grp-card').forEach(c => c.classList.remove('selected'));
    const manualCard = document.querySelector('#gGroupCards .grp-card-manual');
    if (manualCard) manualCard.classList.add('selected');

    document.getElementById('gAnimalType').value = '';
    document.getElementById('gCount').value      = '';
    document.getElementById('gHerd').value       = '';
    document.getElementById('gManualInputs').style.display = 'block';
    document.getElementById('gAnimalType').focus();
}

function checkStockingLive() {
    const fieldId = document.getElementById('gField').value;
    const count   = parseInt(document.getElementById('gCount').value);
    const field   = loadFields().find(f => f.id === fieldId);
    const warn    = document.getElementById('stockingWarning');
    
    if (!field || !count || !field.maxAUperHa) { warn.style.display = 'none'; return; }
    
    const auHa = count / field.areaHa;
    if (auHa > field.maxAUperHa) {
        warn.className   = 'warn-box alert';
        warn.textContent = `⚠ ${auHa.toFixed(1)} AU/ha exceeds limit of ${field.maxAUperHa} AU/ha.`;
        warn.style.display = 'block';
    } else if (auHa > field.maxAUperHa * 0.85) {
        warn.className        = 'warn-box';
        warn.style.background = '#fef9c3';
        warn.style.border     = '1.5px solid #fde68a';
        warn.style.color      = '#854d0e';
        warn.textContent      = `Note: ${auHa.toFixed(1)} AU/ha — approaching limit of ${field.maxAUperHa} AU/ha.`;
        warn.style.display    = 'block';
    } else {
        warn.style.display = 'none';
    }
}

function saveGrazingEvent() {
    const fieldId = document.getElementById('gField').value;
    const start   = document.getElementById('gStart').value;
    const end     = document.getElementById('gEnd').value;
    const type    = document.getElementById('gAnimalType').value.trim();
    const count   = parseInt(document.getElementById('gCount').value);
    const herd    = document.getElementById('gHerd').value.trim();
    const notes   = document.getElementById('gNotes').value.trim();

    if (!start || !end)      { alert('Enter start and end dates.'); return; }
    if (end < start)         { alert('End date must be on or after start date.'); return; }
    if (!type)               { alert('Select a group or enter an animal type.'); return; }
    if (!count || count < 1) { alert('Enter the number of animals.'); return; }

    const events = loadEvents();
    events.push({ id:uid(), fieldId, startDate:start, endDate:end, animalType:type, animalCount:count, herd, notes, loggedAt:new Date().toISOString() });
    
    saveEvents(events);
    closeModal('modalGrazing');
    refreshMapColors();
    renderFieldList();
    updateStats();
    if (selectedFieldId === fieldId) selectField(fieldId);
    
    const field = loadFields().find(f => f.id === fieldId);
    setStatus(`Logged: ${count} ${type}${herd?' ('+herd+')':''} on "${field?field.name:'?'}" — ${daysBetween(start,end)} days`);
}

let historyFieldId = null;

function openHistoryModal(fieldId) {
    historyFieldId = fieldId;
    const field  = loadFields().find(f => f.id === fieldId);
    const events = loadEvents().filter(e => e.fieldId === fieldId).sort((a, b) => b.startDate.localeCompare(a.startDate));

    document.getElementById('historyTitle').textContent = `${field.name} — Grazing History`;
    document.getElementById('historyBody').innerHTML = !events.length
        ? `<p class="no-history">No events yet.</p>`
        : `<table class="htbl">
               <thead><tr><th>Start</th><th>End</th><th>Days</th><th>Animals</th><th>AU/ha</th><th>Notes</th><th></th></tr></thead>
               <tbody>${events.map(e => {
                   const auHa = field.areaHa > 0 ? (e.animalCount / field.areaHa).toFixed(1) : '—';
                   const warn = field.maxAUperHa && (e.animalCount / field.areaHa) > field.maxAUperHa ? '⚠' : '';
                   const herdTag = e.herd ? ` <span class="ev-herd">${e.herd}</span>` : '';
                   return `<tr>
                       <td>${fmtDate(e.startDate)}</td>
                       <td>${fmtDate(e.endDate)}</td>
                       <td>${daysBetween(e.startDate,e.endDate)}</td>
                       <td>${e.animalCount} ${cap(e.animalType)}${herdTag}</td>
                       <td>${warn}${auHa}</td>
                       <td style="color:#6b7280;font-size:11px">${e.notes||'—'}</td>
                       <td><button class="del-ev-btn" onclick="deleteEvent('${e.id}','${fieldId}')">✕</button></td>
                   </tr>`;
               }).join('')}</tbody>
           </table>`;
    openModal('modalHistory');
}

function deleteEvent(eventId, fieldId) {
    if (!confirm('Delete this grazing event?')) return;
    saveEvents(loadEvents().filter(e => e.id !== eventId));
    refreshMapColors(); renderFieldList(); updateStats();
    openHistoryModal(fieldId);
    if (selectedFieldId === fieldId) selectField(fieldId);
}

function historyAddEvent() {
    closeModal('modalHistory');
    openGrazingModal(historyFieldId);
}

function openGrazingModalForGroup(groupId) {
    switchTab('map');
    setTimeout(() => {
        openGrazingModal(null);
        setTimeout(() => _selectGroup(groupId), 120);
    }, 60);
}