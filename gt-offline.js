// ============================================================
//  gt-offline.js  —  Offline map tile pre-download
//  Downloads OpenStreetMap tiles for your farm's bounding box
// ============================================================
'use strict';

const TILE_CACHE = 'gt-tiles-v1';
const OSM_BASE = 'https://tile.openstreetmap.org';

function lon2x(lon, z) {
    return Math.floor((lon + 180) / 360 * (1 << z));
}

function lat2y(lat, z) {
    const r = lat * Math.PI / 180;
    return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z));
}

function buildTileUrls(bbox, zMin, zMax) {
    const urls = [];
    for (let z = zMin; z <= zMax; z++) {
        const x0 = lon2x(bbox.minLng, z);
        const x1 = lon2x(bbox.maxLng, z);
        const y0 = lat2y(bbox.maxLat, z);
        const y1 = lat2y(bbox.minLat, z);
        for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
                urls.push(`${OSM_BASE}/${z}/${x}/${y}.png`);
            }
        }
    }
    return urls;
}

function getFarmBbox() {
    const fields = loadFields();
    if (!fields.length) return null;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    fields.forEach(f => {
        if (f.geometry && f.geometry.coordinates) {
            f.geometry.coordinates[0].forEach(([lng, lat]) => {
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
            });
        }
    });
    const pad = 0.009;
    return {
        minLat: minLat - pad, maxLat: maxLat + pad,
        minLng: minLng - pad, maxLng: maxLng + pad
    };
}

async function getCacheStats() {
    if (!('caches' in window)) return { count: 0, mb: '0.0' };
    try {
        const cache = await caches.open(TILE_CACHE);
        const keys = (await cache.keys()).filter(r => r.url.includes('openstreetmap.org'));
        const kb = keys.length * 12;
        return { count: keys.length, mb: (kb / 1024).toFixed(1) };
    } catch { return { count: 0, mb: '0.0' }; }
}

async function openOfflineModal() {
    openModal('modalOffline');
    const body = document.getElementById('offlineBody');
    const bbox = getFarmBbox();
    const stats = await getCacheStats();

    if (!bbox) {
        body.innerHTML = `
            <div style="text-align:center;padding:30px 10px">
                <div style="font-size:36px;margin-bottom:12px">🗺</div>
                <p style="color:var(--muted);font-size:13px;line-height:1.7">
                    Add at least one field before downloading offline tiles.<br>
                    GrazingTrack uses your farm's boundary to work out which tiles to cache.
                </p>
            </div>`;
        return;
    }

    const countAt = z => buildTileUrls(bbox, 13, z).length;
    const mbAt = z => (countAt(z) * 12 / 1024).toFixed(0);

    body.innerHTML = `
        <p class="ol-desc">
            Downloads map tiles so your farm stays visible without internet.
            <strong>Uses OpenStreetMap</strong> (street map layer) — switch to
            "Street map" in the map layer control when offline.
        </p>
        <div class="ol-stat-row">
            <div class="ol-stat-card">
                <div class="ol-stat-n">${stats.count}</div>
                <div class="ol-stat-l">Tiles cached</div>
            </div>
            <div class="ol-stat-card">
                <div class="ol-stat-n">~${stats.mb} MB</div>
                <div class="ol-stat-l">Est. storage used</div>
            </div>
        </div>
        <div class="ol-zoom-block">
            <div class="ol-zoom-hdr">
                Max zoom: <strong id="olZVal">16</strong>
                <span class="ol-zoom-note">~${countAt(16)} tiles · ~${mbAt(16)} MB</span>
            </div>
            <input type="range" class="ol-slider" id="olZSlider" min="14" max="17" value="16" oninput="updateZoomDisplay(this.value)">
            <div class="ol-zoom-labels"><span>14</span><span>15</span><span>16</span><span>17</span></div>
        </div>
        <div class="ol-prog-wrap" id="olProgWrap" style="display:none">
            <div class="ol-prog-track"><div class="ol-prog-bar" id="olProgBar" style="width:0%"></div></div>
            <div class="ol-prog-txt" id="olProgTxt"></div>
        </div>
        <div class="ol-tip">
            💡 Zoom 14–16 covers your farm well. Level 17 shows more detail but roughly doubles the download size.
        </div>
        <div class="ol-actions">
            <button class="btn-primary ol-dl-btn" id="olDlBtn" onclick="startOfflineDownload()">📥 Download offline tiles</button>
            ${stats.count > 0 ? `<button class="btn-ghost ol-clear-btn" onclick="clearOfflineTiles()">🗑 Clear cached tiles</button>` : ''}
        </div>`;
}

function closeOfflineModal() {
    closeModal('modalOffline');
}

function updateZoomDisplay(z) {
    const bbox = getFarmBbox();
    if (!bbox) return;
    const count = buildTileUrls(bbox, 13, parseInt(z)).length;
    document.getElementById('olZVal').textContent = z;
    document.getElementById('olZVal').nextElementSibling.textContent = `~${count} tiles · ~${(count * 12 / 1024).toFixed(0)} MB`;
}

async function startOfflineDownload() {
    const bbox = getFarmBbox();
    if (!bbox) return;
    const maxZ = parseInt(document.getElementById('olZSlider').value);
    const urls = buildTileUrls(bbox, 13, maxZ);

    if (urls.length > 2500 && !confirm(`Download ${urls.length} tiles (~${(urls.length * 12 / 1024).toFixed(0)} MB)?\nThis may take a minute.`)) return;

    const dlBtn = document.getElementById('olDlBtn');
    dlBtn.disabled = true;
    dlBtn.textContent = '⏳ Downloading…';
    document.getElementById('olProgWrap').style.display = 'block';

    const cache = await caches.open(TILE_CACHE);
    let done = 0, skipped = 0, failed = 0;

    const updateProgress = () => {
        const pct = Math.round(done / urls.length * 100);
        document.getElementById('olProgBar').style.width = pct + '%';
        document.getElementById('olProgTxt').textContent = `${done} / ${urls.length} (${skipped} cached, ${failed} failed)`;
    };

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
            if (await cache.match(url)) {
                skipped++;
            } else {
                const resp = await fetch(url);
                if (resp.ok) await cache.put(url, resp);
                else failed++;
            }
        } catch { failed++; }
        done++;
        updateProgress();
        if (done % 50 === 0) await new Promise(r => setTimeout(r, 10));
    }

    const stats = await getCacheStats();
    document.getElementById('olCount').textContent = stats.count;
    document.getElementById('olSize').textContent = `~${stats.mb} MB`;
    dlBtn.disabled = false;
    dlBtn.textContent = '✓ Re-download tiles';
    document.getElementById('olProgTxt').textContent = `✅ ${done - skipped - failed} new tiles saved`;
    setStatus(`Offline map ready — ${stats.count} tiles cached.`);
}

async function clearOfflineTiles() {
    if (!confirm('Clear all cached OSM map tiles?\nYou can re-download or re-browse to rebuild the cache.')) return;
    const cache = await caches.open(TILE_CACHE);
    const keys = (await cache.keys()).filter(r => r.url.includes('openstreetmap.org'));
    await Promise.all(keys.map(k => cache.delete(k)));
    await openOfflineModal();
    setStatus('Offline tiles cleared.');
}