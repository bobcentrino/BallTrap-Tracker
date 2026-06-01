/**
 * Ball-Trap Tracker — Module Statistiques V2
 * Jauge circulaire + Demi-tuiles colorées + Compétitions IndexedDB + Analyse équipement
 */

// ========================================
// VARIABLES GLOBALES
// ========================================
let currentStatsFilter = 'FU';

// Noms complets des disciplines pour l'affichage
const DISC_NAMES = {
    'FU': 'FU',
    'DTL': 'DTL',
    'TRAP1': 'TRAP1',
    'PCH': 'PCH',
    'CS': 'CS',
    'Fosse Olympique': 'Fosse Olympique',
    'Skeet Olympique': 'Skeet Olympique'
};

// ========================================
// HELPER — PARSING DATE ROBUSTE
// ========================================
// Gère les formats YYYY-MM-DD (ISO) et DD/MM/YYYY (français)
// TOUJOURS en heure locale (pas UTC) pour les comparaisons
function parseSerieDate(dateStr) {
    if (!dateStr) return null;
    // Format ISO : YYYY-MM-DD
    const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const [, y, m, d] = isoMatch.map(Number);
        return new Date(y, m - 1, d); // Heure locale !
    }
    // Format français : DD/MM/YYYY
    const frMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (frMatch) {
        const [, d, m, y] = frMatch.map(Number);
        return new Date(y, m - 1, d); // Heure locale !
    }
    // Fallback : laisser JS tenter
    const fallback = new Date(dateStr);
    return isNaN(fallback.getTime()) ? null : fallback;
}

// ========================================
// HELPERS CALENDRIER — Semaine Lun→Dim, Mois 1er→dernier, Trimestre calendaire
// ========================================
function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getSunday(date) {
    const d = getMonday(date);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
}

function getFirstOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function getLastOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getQuarter(date) {
    return Math.floor(date.getMonth() / 3) + 1;
}

function getFirstOfQuarter(date) {
    const q = getQuarter(date);
    return new Date(date.getFullYear(), (q - 1) * 3, 1, 0, 0, 0, 0);
}

function getLastOfQuarter(date) {
    const q = getQuarter(date);
    return new Date(date.getFullYear(), q * 3, 0, 23, 59, 59, 999);
}

// Formater JJ/MM pour l'affichage
function fmtDDMM(date) {
    if (!date) return '--';
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}`;
}

// Noms des mois en français
const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                   'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// Labels des trimestres
function quarterLabel(q, year) {
    const startMonth = MONTHS_FR[(q - 1) * 3];
    const endMonth = MONTHS_FR[(q - 1) * 3 + 2];
    return `Trimestre ${q} (${startMonth} → ${endMonth})`;
}


// ========================================
// FILTRE DISCIPLINE
// ========================================
window.filterStats = function(discipline) {
    currentStatsFilter = discipline;

    document.querySelectorAll('#stats-disc-group .btn-choice').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === discipline);
    });

    updateStatsPage();
};

// ========================================
// MODALES (existantes — conservées)
// ========================================
window.openStatsModal = function(type) {
    openStatsModalInternal(type);
};

window.closeStatsModal = function(type) {
    const modal = document.getElementById(`modal-stats-${type}`);
    if (modal) modal.style.display = 'none';
};

// ========================================
// INITIALISATION
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await Storage.init();
        console.log('📊 Stats V2 : Stockage initialisé');
    } catch (err) {
        console.error("Erreur initialisation stats:", err);
    }
});

// Appelé par le router quand on navigue vers la page Stats
window.initStats = async function() {
    await updateStatsPage();
};

// ========================================
// FONCTION PRINCIPALE — MISE À JOUR COMPLÈTE
// ========================================
async function updateStatsPage() {
    try {
        // 1. Récupérer les séries filtrées
        const allSeries = await Storage.getAllSeries();
        const filteredSeries = currentStatsFilter === 'all'
            ? allSeries
            : allSeries.filter(s => s.discipline === currentStatsFilter);

        if (filteredSeries.length === 0) {
            resetAllTiles();
            return;
        }

        // 2. Calculer les KPIs de base
        const kpis = calculateKPIs(filteredSeries);

        // 3. Mettre à jour la jauge circulaire
        updateGauge(kpis.avg, kpis.totalSeries);

        // 4. Mettre à jour les tuiles Performance
        updatePerfTiles(kpis);

        // 5. Mettre à jour la tuile Compétition (depuis IndexedDB)
        await updateCompTile();

        // 6. Mettre à jour les tuiles Équipement
        await updateEquipTiles(filteredSeries);

        // 7. Mettre à jour la tuile Badges (async)
        await updateBadgesTile();

    } catch (err) {
        console.error('Erreur updateStatsPage:', err);
    }
}

// ========================================
// CALCUL DES KPIs
// ========================================
function calculateKPIs(series) {
    const totalScore = series.reduce((sum, s) => sum + s.score, 0);
    const totalMax = series.reduce((sum, s) => sum + s.max, 0);
    const avg = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    const bestScore = Math.max(...series.map(s => s.score));
    const bestSerie = series.find(s => s.score === bestScore);
    const worstScore = Math.min(...series.map(s => s.score));
    const worstSerie = series.find(s => s.score === worstScore);

    // Dernière série (la plus récente par ID)
    const sorted = [...series].sort((a, b) => b.id - a.id);
    const lastSerie = sorted[0];

    // Séries ce mois
    const now = new Date();
    const thisYear = now.getFullYear();
    const thisMonthIdx = now.getMonth();
    const seriesThisMonth = series.filter(s => {
        const d = parseSerieDate(s.date);
        return d && d.getFullYear() === thisYear && d.getMonth() === thisMonthIdx;
    }).length;

    // Tendance (comparer 2 dernières semaines)
    const thisWeek = getWeekSeries(series, 0);
    const lastWeek = getWeekSeries(series, -7);
    const thisWeekAvg = thisWeek.length > 0 ? Math.round((thisWeek.reduce((s, x) => s + x.score, 0) / thisWeek.reduce((s, x) => s + x.max, 0)) * 100) : null;
    const lastWeekAvg = lastWeek.length > 0 ? Math.round((lastWeek.reduce((s, x) => s + x.score, 0) / lastWeek.reduce((s, x) => s + x.max, 0)) * 100) : null;
    let trendText = '';
    let trendDiff = 0;
    if (thisWeekAvg !== null && lastWeekAvg !== null) {
        trendDiff = thisWeekAvg - lastWeekAvg;
        if (trendDiff > 0) trendText = `+${trendDiff}% cette semaine`;
        else if (trendDiff < 0) trendText = `${trendDiff}% cette semaine`;
        else trendText = 'Stable cette semaine';
    } else if (thisWeekAvg !== null) {
        trendText = `${thisWeek.length} série(s) cette semaine`;
    } else {
        trendText = `${series.length} série(s) au total`;
    }

    return {
        avg,
        bestScore,
        bestMax: bestSerie ? bestSerie.max : 0,
        bestPct: bestSerie ? Math.round((bestSerie.score / bestSerie.max) * 100) : 0,
        worstScore,
        worstMax: worstSerie ? worstSerie.max : 0,
        worstPct: worstSerie ? Math.round((worstSerie.score / worstSerie.max) * 100) : 0,
        lastScore: lastSerie ? lastSerie.score : 0,
        lastMax: lastSerie ? lastSerie.max : 0,
        lastPct: lastSerie ? Math.round((lastSerie.score / lastSerie.max) * 100) : 0,
        totalSeries: series.length,
        seriesThisMonth,
        trendText,
        trendDiff
    };
}

function getWeekSeries(series, dayOffset) {
    const ref = new Date();
    ref.setDate(ref.getDate() + dayOffset);
    const weekStart = new Date(ref);
    weekStart.setDate(ref.getDate() - ref.getDay() + 1); // Lundi
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Dimanche

    return series.filter(s => {
        if (!s.date) return false;
        const d = parseSerieDate(s.date);
        return d && d >= weekStart && d <= weekEnd;
    });
}

// ========================================
// MISE À JOUR JAUGE CIRCULAIRE
// ========================================
function updateGauge(avg, totalSeries) {
    const pctEl = document.getElementById('gauge-pct');
    const discEl = document.getElementById('gauge-disc-name');
    const trendEl = document.getElementById('gauge-trend');
    const bgEl = document.getElementById('gauge-bg-circle');

    if (pctEl) pctEl.textContent = `${avg}%`;
    if (discEl) discEl.textContent = DISC_NAMES[currentStatsFilter] || currentStatsFilter;

    // Jauge neumorphic — texte couleur thème
    if (pctEl) pctEl.style.color = '';
    if (trendEl) trendEl.style.color = '';

    // conic-gradient — vert sur fond thème (neumorphic)
    const rawColor = '#2ecc71';
    const style = getComputedStyle(document.documentElement);
    const bgTrack = style.getPropertyValue('--bg').trim();
    if (bgEl) {
        bgEl.style.background = `conic-gradient(${rawColor} 0% ${avg}%, ${bgTrack} ${avg}% 100%)`;
    }
}

// ========================================
// MISE À JOUR TUILES PERFORMANCE
// ========================================
function updatePerfTiles(kpis) {
    // Jauge tendance — couleur thème
    const trendEl = document.getElementById('gauge-trend');
    if (trendEl) {
        trendEl.textContent = kpis.trendText;
        trendEl.style.color = '';
    }

    // Meilleure série
    setPerfTile('tile-best', kpis.bestPct,
        'tile-best-val', `${kpis.bestScore}/${kpis.bestMax}`,
        'tile-best-pct', `${kpis.bestPct}%`);

    // Dernière série
    setPerfTile('tile-last', kpis.lastPct,
        'tile-last-val', `${kpis.lastScore}/${kpis.lastMax}`,
        'tile-last-pct', `${kpis.lastPct}%`);

    // Pire série
    setPerfTile('tile-worst', kpis.worstPct,
        'tile-worst-val', `${kpis.worstScore}/${kpis.worstMax}`,
        'tile-worst-pct', `${kpis.worstPct}%`);

    // Séries ce mois
    const monthEl = document.getElementById('tile-month-val');
    const monthSubEl = document.getElementById('tile-month-sub');
    if (monthEl) monthEl.textContent = kpis.seriesThisMonth;
    if (monthSubEl) monthSubEl.textContent = `en ${currentStatsFilter}`;
}

function setPerfTile(tileId, pct, valId, valText, subId, subText) {
    const tile = document.getElementById(tileId);
    if (!tile) return;

    // Retirer les anciennes classes de couleur
    tile.classList.remove('green', 'orange', 'red');

    // Appliquer la couleur selon le pourcentage
    const colorClass = pct >= 80 ? 'green' : pct >= 60 ? 'orange' : 'red';
    tile.classList.add(colorClass);

    // Mettre à jour les valeurs
    const valEl = document.getElementById(valId);
    const subEl = document.getElementById(subId);
    if (valEl) valEl.textContent = valText;
    if (subEl) subEl.textContent = subText;
}

// ========================================
// TUILE COMPÉTITION (depuis IndexedDB)
// ========================================
async function updateCompTile() {
    try {
        const allComps = await Storage.getAllCompetitions();
        // Filtrer par discipline, status archived ET année en cours
        const thisYear = new Date().getFullYear();
        const compFiltered = allComps.filter(c => {
            if (c.status !== 'archived' || c.disc !== currentStatsFilter) return false;
            const d = parseSerieDate(c.startDate || c.dateFin);
            return d && d.getFullYear() === thisYear;
        });

        const countEl = document.getElementById('tile-comp-count');
        const countSubEl = document.getElementById('tile-comp-count-sub');
        const bestEl = document.getElementById('tile-comp-best');
        const avgEl = document.getElementById('tile-comp-avg');
        const globalEl = document.getElementById('tile-comp-global');

        if (compFiltered.length === 0) {
            if (countEl) countEl.textContent = '0';
            if (countSubEl) countSubEl.textContent = 'terminée(s)';
            if (bestEl) bestEl.textContent = '--/--';
            if (avgEl) avgEl.textContent = '--%';
            if (globalEl) globalEl.textContent = '--/--';
            return;
        }

        // Calculer les stats compétitions
        let bestCompScore = 0;
        let bestCompMax = 0;
        let totalPct = 0;
        let globalScore = 0;
        let globalMax = 0;

        compFiltered.forEach(comp => {
            const cumul = comp.scoreCumul || 0;
            const maxCumul = comp.scoreMaxCumul || 1;
            const pct = Math.round((cumul / maxCumul) * 100);
            totalPct += pct;
            globalScore += cumul;
            globalMax += maxCumul;
            if (cumul > bestCompScore) {
                bestCompScore = cumul;
                bestCompMax = maxCumul;
            }
        });

        const avgComp = Math.round(totalPct / compFiltered.length);

        if (countEl) countEl.textContent = compFiltered.length;
        if (countSubEl) countSubEl.textContent = compFiltered.length > 1 ? 'terminées' : 'terminée';
        if (bestEl) bestEl.textContent = `${bestCompScore}/${bestCompMax}`;
        if (avgEl) avgEl.textContent = `${avgComp}%`;
        if (globalEl) {
            globalEl.textContent = `${globalScore}/${globalMax}`;
            const globalPct = globalMax > 0 ? Math.round((globalScore / globalMax) * 100) : 0;
            globalEl.style.color = globalPct >= 80 ? 'var(--score-excellent)' : globalPct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';
        }

    } catch (err) {
        console.error('Erreur updateCompTile:', err);
    }
}

// ========================================
// TUILES ÉQUIPEMENT
// ========================================
async function updateEquipTiles(series) {
    // 1. Par fusil + chokes (groupé sur la même tuile bleue)
    updateFusilChokesTile(series);

    // 2. Par cartouche
    updateEquipTileByField(series, 'cartouche', 'tile-cartouche', 'tile-cart-val', 'tile-cart-sub');

    // 3. Par météo
    updateEquipTileByField(series, 'meteo', 'tile-meteo', 'tile-meteo-val', 'tile-meteo-sub');

    // 4. Par tenue
    updateEquipTileByField(series, 'tenue', 'tile-tenue', 'tile-tenue-val', 'tile-tenue-sub');
}

function updateEquipTileByField(series, field, tileId, valId, subId) {
    const tile = document.getElementById(tileId);
    const valEl = document.getElementById(valId);
    const subEl = document.getElementById(subId);
    if (!tile || !valEl || !subEl) return;

    // Grouper les séries par la valeur du champ
    const groups = {};
    series.forEach(s => {
        const key = s[field] || '';
        if (!key) return;
        if (!groups[key]) groups[key] = { total: 0, max: 0, count: 0 };
        groups[key].total += s.score;
        groups[key].max += s.max;
        groups[key].count++;
    });

    const entries = Object.entries(groups);
    if (entries.length === 0) {
        tile.classList.remove('green', 'orange', 'red');
        tile.classList.add('orange');
        valEl.textContent = '--%';
        subEl.textContent = 'Aucune donnée';
        return;
    }

    // Trouver le meilleur groupe (meilleur % moyen)
    let bestEntry = entries[0];
    let bestPct = 0;
    entries.forEach(([name, data]) => {
        const pct = data.max > 0 ? Math.round((data.total / data.max) * 100) : 0;
        if (pct > bestPct) {
            bestPct = pct;
            bestEntry = [name, data];
        }
    });

    // Appliquer la couleur (vert/orange/rouge selon score)
    tile.classList.remove('green', 'orange', 'red', 'blue');
    const colorClass = bestPct >= 80 ? 'green' : bestPct >= 60 ? 'orange' : 'red';
    tile.classList.add('perf', colorClass);

    valEl.textContent = `${bestPct}%`;
    const name = bestEntry[0];
    subEl.textContent = name.length > 18 ? name.substring(0, 16) + '…' : name;
}

// ========================================
// TUILE FUSIL + CHOKES (groupée, toujours bleue)
// ========================================
function updateFusilChokesTile(series) {
    const tile = document.getElementById('tile-fusil');
    const valEl = document.getElementById('tile-fusil-val');
    const subEl = document.getElementById('tile-fusil-sub');
    const chokesEl = document.getElementById('tile-chokes-info');
    if (!tile || !valEl || !subEl) return;

    // La tuile fusil+chokes reste toujours bleue
    tile.classList.remove('green', 'orange', 'red');
    if (!tile.classList.contains('blue')) tile.classList.add('blue');

    // Grouper par fusil
    const groups = {};
    const chokesMap = {};
    series.forEach(s => {
        const key = s.fusil || '';
        if (!key) return;
        if (!groups[key]) { groups[key] = { total: 0, max: 0, count: 0 }; chokesMap[key] = new Set(); }
        groups[key].total += s.score;
        groups[key].max += s.max;
        groups[key].count++;
        // Utiliser s.chokes (champ complet) pour les infos chokes
        if (s.chokes) {
            const abbr = abbreviateChokesCombo(s.chokes);
            if (abbr && abbr !== '—') chokesMap[key].add(abbr);
        }
    });

    const entries = Object.entries(groups);
    if (entries.length === 0) {
        valEl.textContent = '--';
        subEl.textContent = 'Aucun fusil';
        if (chokesEl) chokesEl.textContent = '';
        return;
    }

    // Trouver le meilleur fusil
    let bestEntry = entries[0];
    let bestPct = 0;
    entries.forEach(([name, data]) => {
        const pct = data.max > 0 ? Math.round((data.total / data.max) * 100) : 0;
        if (pct > bestPct) {
            bestPct = pct;
            bestEntry = [name, data];
        }
    });

    const bestName = bestEntry[0];
    valEl.textContent = `${bestPct}%`;
    subEl.textContent = bestName.length > 18 ? bestName.substring(0, 16) + '…' : bestName;

    // Afficher les chokes associés au meilleur fusil
    if (chokesEl) {
        const chokes = chokesMap[bestName];
        if (chokes && chokes.size > 0) {
            const chokeStr = Array.from(chokes).join(' / ');
            chokesEl.textContent = chokeStr.length > 30 ? chokeStr.substring(0, 28) + '…' : chokeStr;
        } else {
            chokesEl.textContent = '';
        }
    }
}

// Mini SVGs pour la tuile (disque médaille only, pas de ruban)
const TILE_BADGE_SVGS = {
    bronze: `<svg viewBox="0 0 40 40"><defs><linearGradient id="tbr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#e8a85c"/><stop offset="100%" stop-color="#a0601a"/></linearGradient></defs><circle cx="20" cy="20" r="19" fill="url(#tbr)" stroke="#8b4513" stroke-width="1.2"/><circle cx="20" cy="20" r="14" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/><polygon points="20,8 22,14 28,14 23,18 25,24 20,20 15,24 17,18 12,14 18,14" fill="rgba(255,255,255,0.5)"/></svg>`,
    silver: `<svg viewBox="0 0 40 40"><defs><linearGradient id="tag" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#d4d4d8"/><stop offset="100%" stop-color="#7a7a80"/></linearGradient></defs><circle cx="20" cy="20" r="19" fill="url(#tag)" stroke="#6b6b72" stroke-width="1.2"/><circle cx="20" cy="20" r="14" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.8"/><polygon points="20,8 22,14 28,14 23,18 25,24 20,20 15,24 17,18 12,14 18,14" fill="rgba(255,255,255,0.55)"/></svg>`,
    gold: `<svg viewBox="0 0 40 40"><defs><linearGradient id="tor" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffe066"/><stop offset="100%" stop-color="#c49a00"/></linearGradient></defs><circle cx="20" cy="20" r="19" fill="url(#tor)" stroke="#9a7800" stroke-width="1.2"/><circle cx="20" cy="20" r="14" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/><polygon points="20,8 22,14 28,14 23,18 25,24 20,20 15,24 17,18 12,14 18,14" fill="rgba(255,255,255,0.6)"/></svg>`,
    diamond: `<svg viewBox="0 0 40 40"><defs><linearGradient id="tdi" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4dd9e8"/><stop offset="100%" stop-color="#008c9e"/></linearGradient></defs><circle cx="20" cy="20" r="19" fill="url(#tdi)" stroke="#008c9e" stroke-width="1.2"/><circle cx="20" cy="20" r="14" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.8"/><polygon points="20,9 27,17 20,28 13,17" fill="rgba(255,255,255,0.45)" stroke="rgba(255,255,255,0.5)" stroke-width="0.5"/><line x1="20" y1="9" x2="20" y2="28" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"/><line x1="13" y1="17" x2="27" y2="17" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"/></svg>`,
    locked: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#b0b0b0" stroke="#888" stroke-width="1.2"/><circle cx="20" cy="20" r="14" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.8"/><polygon points="20,8 22,14 28,14 23,18 25,24 20,20 15,24 17,18 12,14 18,14" fill="rgba(255,255,255,0.15)"/></svg>`
};

// ========================================
// TUILE BADGES (aperçu rapide)
// ========================================
async function updateBadgesTile() {
    const rowEl = document.getElementById('badge-tile-row');
    const subEl = document.getElementById('tile-badges-sub');
    if (!rowEl || !subEl) return;

    try {
        const allSeries = await Storage.getAllSeries();
        const series = allSeries.filter(s => s.discipline === currentStatsFilter);

        let unlockedCount = 0;
        let html = '';

        BADGE_CONFIG.forEach(badge => {
            const unlocked = badge.check(series);
            if (unlocked) unlockedCount++;
            const svgKey = unlocked ? badge.svgKey : 'locked';
            html += `<div class="badge-tile-icon ${unlocked ? 'unlocked' : 'locked'}" title="${badge.title}${unlocked ? ' ✓' : ''}">${TILE_BADGE_SVGS[svgKey]}</div>`;
        });

        rowEl.innerHTML = html;
        subEl.textContent = `${unlockedCount}/4 débloqués`;
    } catch (err) {
        console.error('Erreur updateBadgesTile:', err);
        rowEl.innerHTML = '';
        subEl.textContent = '0/4 débloqués';
    }
}

// ========================================
// RESET (aucune donnée)
// ========================================
function resetAllTiles() {
    // Jauge
    const pctEl = document.getElementById('gauge-pct');
    const discEl = document.getElementById('gauge-disc-name');
    const trendEl = document.getElementById('gauge-trend');
    const bgEl = document.getElementById('gauge-bg-circle');
    if (pctEl) { pctEl.textContent = '--%'; pctEl.style.color = ''; }
    if (discEl) discEl.textContent = DISC_NAMES[currentStatsFilter] || currentStatsFilter;
    if (trendEl) { trendEl.textContent = 'Aucune série'; trendEl.style.color = ''; }
    const style = getComputedStyle(document.documentElement);
    const bgTrackReset = style.getPropertyValue('--bg').trim();
    if (bgEl) bgEl.style.background = `conic-gradient(#2ecc71 0% 0%, ${bgTrackReset} 0% 100%)`;

    // Tuiles Performance — par défaut orange
    ['tile-best', 'tile-last', 'tile-worst'].forEach(id => {
        const tile = document.getElementById(id);
        if (tile) { tile.classList.remove('green', 'orange', 'red'); tile.classList.add('orange'); }
    });
    // Tuile Badges — 4 mini-badges verrouillés
    const badgesRow = document.getElementById('badge-tile-row');
    if (badgesRow) {
        let resetHtml = '';
        BADGE_CONFIG.forEach(badge => {
            resetHtml += `<div class="badge-tile-icon locked" title="${badge.title}">${TILE_BADGE_SVGS.locked}</div>`;
        });
        badgesRow.innerHTML = resetHtml;
    }
    const valIds = ['tile-best-val', 'tile-best-pct', 'tile-last-val', 'tile-last-pct',
                    'tile-worst-val', 'tile-worst-pct', 'tile-month-val', 'tile-month-sub',
                    'tile-comp-count', 'tile-comp-best', 'tile-comp-avg', 'tile-comp-global',
                    'tile-fusil-val', 'tile-fusil-sub', 'tile-cart-val', 'tile-cart-sub',
                    'tile-meteo-val', 'tile-meteo-sub', 'tile-tenue-val', 'tile-tenue-sub',
                    'tile-badges-sub'];
    valIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '--';
    });
    const badgesSub = document.getElementById('tile-badges-sub');
    if (badgesSub) badgesSub.textContent = '0/4 débloqués';

    const monthSub = document.getElementById('tile-month-sub');
    if (monthSub) monthSub.textContent = `en ${currentStatsFilter}`;
    const compSub = document.getElementById('tile-comp-count-sub');
    if (compSub) compSub.textContent = 'terminée(s)';

    // Tuile fusil reste bleue, les autres en orange par défaut
    const fusilTile = document.getElementById('tile-fusil');
    if (fusilTile) { fusilTile.classList.remove('green', 'orange', 'red'); }
    ['tile-cartouche', 'tile-meteo', 'tile-tenue'].forEach(id => {
        const tile = document.getElementById(id);
        if (tile) { tile.classList.remove('green', 'orange', 'red'); tile.classList.add('orange'); }
    });
    // Info chokes vide
    const chokesInfo = document.getElementById('tile-chokes-info');
    if (chokesInfo) chokesInfo.textContent = '';
}

// ========================================
// MODALES GRAPHIQUES
// ========================================
let currentProgressionPeriod = 'week'; // Période par défaut

async function openStatsModalInternal(type) {
    const modal = document.getElementById(`modal-stats-${type}`);
    const container = document.getElementById(`chart-${type}`);
    if (!modal || !container) return;

    modal.style.display = 'flex';
    container.innerHTML = '<p class="loading-text">Chargement...</p>';

    try {
        const allSeries = await Storage.getAllSeries();
        const filteredSeries = currentStatsFilter === 'all'
            ? allSeries
            : allSeries.filter(s => s.discipline === currentStatsFilter);

        if (type === 'progression') {
            // Modale Progression V2 — toujours ouvrir, même sans données
            currentProgressionPeriod = 'week';
            updateProgressionPeriodButtons();
            await updateProgressionModal(filteredSeries);
        }
    } catch (err) {
        console.error(`Erreur graphique ${type}:`, err);
        container.innerHTML = '<p style="color:var(--score-faible);text-align:center;">Erreur de chargement.</p>';
    }
}

// ========================================
// MODALE PROGRESSION V2
// ========================================

// Configuration des périodes
const PERIOD_CONFIG = {
    week:       { label: 'Semaine',    chartTitle: 'ÉVOLUTION CETTE SEMAINE' },
    month:      { label: 'Mois',       chartTitle: 'ÉVOLUTION CE MOIS' },
    trimester:  { label: 'Trimestre',  chartTitle: 'ÉVOLUTION CE TRIMESTRE' },
    '3months':  { label: '-3 mois',    chartTitle: 'ÉVOLUTION SUR 3 MOIS' },
    '6months':  { label: '-6 mois',    chartTitle: 'ÉVOLUTION SUR 6 MOIS' }
};

// Mise à jour des boutons de période
function updateProgressionPeriodButtons() {
    document.querySelectorAll('#prog-period-group .btn-choice').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === currentProgressionPeriod);
    });
}

// Filtrer les séries par période (CALENDAIRES pour semaine/mois/trimestre)
function filterSeriesByPeriod(series, period) {
    const now = new Date();
    let start, end;

    switch (period) {
        case 'week':
            start = getMonday(now);
            end = getSunday(now);
            break;
        case 'month':
            start = getFirstOfMonth(now);
            end = getLastOfMonth(now);
            break;
        case 'trimester':
            start = getFirstOfQuarter(now);
            end = getLastOfQuarter(now);
            break;
        case '3months': {
            // Glissant : 3 derniers mois
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate() + 1, 0, 0, 0, 0);
            break;
        }
        case '6months': {
            // Glissant : 6 derniers mois
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate() + 1, 0, 0, 0, 0);
            break;
        }
        default:
            return series;
    }

    return series.filter(s => {
        if (!s.date) return false;
        const d = parseSerieDate(s.date);
        return d && d >= start && d <= end;
    });
}

// Obtenir les séries de la période précédente (CALENDAIRES pour semaine/mois/trimestre)
function getPreviousPeriodSeries(series, period) {
    const now = new Date();
    let start, end;

    switch (period) {
        case 'week': {
            // Semaine précédente (Lundi→Dimanche)
            const prevWeekRef = new Date(now);
            prevWeekRef.setDate(prevWeekRef.getDate() - 7);
            start = getMonday(prevWeekRef);
            end = getSunday(prevWeekRef);
            break;
        }
        case 'month': {
            // Mois précédent
            const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            start = getFirstOfMonth(prevMonth);
            end = getLastOfMonth(prevMonth);
            break;
        }
        case 'trimester': {
            // Trimestre précédent
            const prevQRef = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            start = getFirstOfQuarter(prevQRef);
            end = getLastOfQuarter(prevQRef);
            break;
        }
        case '3months': {
            end = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate(), 23, 59, 59, 999);
            start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate() + 1, 0, 0, 0, 0);
            break;
        }
        case '6months': {
            end = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate(), 23, 59, 59, 999);
            start = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate() + 1, 0, 0, 0, 0);
            break;
        }
        default:
            return [];
    }

    return series.filter(s => {
        if (!s.date) return false;
        const d = parseSerieDate(s.date);
        return d && d >= start && d <= end;
    });
}

// Agréger les séries par jour pour le graphique
function aggregateForChart(series, period) {
    if (!series.length) return [];

    const sorted = [...series].sort((a, b) => {
        const da = parseSerieDate(a.date);
        const db = parseSerieDate(b.date);
        return (da || 0) - (db || 0);
    });

    // Pour semaine : points quotidiens
    if (period === 'week') {
        const byDay = {};
        sorted.forEach(s => {
            if (!byDay[s.date]) byDay[s.date] = { total: 0, max: 0, count: 0 };
            byDay[s.date].total += s.score;
            byDay[s.date].max += s.max;
            byDay[s.date].count++;
        });
        return Object.entries(byDay).map(([date, d]) => ({
            date,
            pct: d.max > 0 ? Math.round((d.total / d.max) * 100) : 0,
            score: d.total,
            max: d.max,
            count: d.count
        }));
    }

    // Pour mois : points quotidiens aussi (plus lisible)
    if (period === 'month') {
        const byDay = {};
        sorted.forEach(s => {
            if (!byDay[s.date]) byDay[s.date] = { total: 0, max: 0, count: 0 };
            byDay[s.date].total += s.score;
            byDay[s.date].max += s.max;
            byDay[s.date].count++;
        });
        return Object.entries(byDay).map(([date, d]) => ({
            date,
            pct: d.max > 0 ? Math.round((d.total / d.max) * 100) : 0,
            score: d.total,
            max: d.max,
            count: d.count
        }));
    }

    // Pour trimestre / -3 mois / -6 mois : agrégation par semaine
    const byWeek = {};
    sorted.forEach(s => {
        if (!s.date) return;
        const d = parseSerieDate(s.date);
        if (!d) return;
        // Trouver le lundi de la semaine
        const day = d.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const monday = new Date(d);
        monday.setDate(d.getDate() + mondayOffset);
        const key = monday.toISOString().slice(0, 10);
        if (!byWeek[key]) byWeek[key] = { total: 0, max: 0, count: 0 };
        byWeek[key].total += s.score;
        byWeek[key].max += s.max;
        byWeek[key].count++;
    });
    return Object.entries(byWeek).map(([date, d]) => ({
        date,
        pct: d.max > 0 ? Math.round((d.total / d.max) * 100) : 0,
        score: d.total,
        max: d.max,
        count: d.count
    }));
}

// Formater une date pour l'axe X du graphique
function formatChartDate(dateStr, period) {
    try {
        const d = parseSerieDate(dateStr);
        if (!d || isNaN(d.getTime())) return dateStr;
        if (period === 'week') {
            const jours = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
            return `${jours[d.getDay()]} ${d.getDate()}`;
        }
        if (period === 'month') {
            return `${d.getDate()}/${d.getMonth() + 1}`;
        }
        // Trimestre / 3mois / 6mois : afficher semaine du X
        return `${d.getDate()}/${d.getMonth() + 1}`;
    } catch { return dateStr; }
}

// Mise à jour complète de la modale progression
async function updateProgressionModal(filteredSeries) {
    const period = currentProgressionPeriod;
    const config = PERIOD_CONFIG[period];
    const discName = DISC_NAMES[currentStatsFilter] || currentStatsFilter;

    // Titre de la modale
    const titleEl = document.getElementById('prog-title');
    if (titleEl) titleEl.textContent = `Moyenne ${discName}`;

    // Titre du graphique
    const chartTitleEl = document.getElementById('prog-chart-title');
    if (chartTitleEl) chartTitleEl.textContent = config.chartTitle;

    // Filtrer par période
    const periodSeries = filterSeriesByPeriod(filteredSeries, period);
    const prevSeries = getPreviousPeriodSeries(filteredSeries, period);

    // === JAUGE ===
    let avg = 0;
    if (periodSeries.length > 0) {
        const totalScore = periodSeries.reduce((s, x) => s + x.score, 0);
        const totalMax = periodSeries.reduce((s, x) => s + x.max, 0);
        avg = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    }

    const gaugePctEl = document.getElementById('prog-gauge-pct');
    const gaugeBgEl = document.getElementById('prog-gauge-bg');
    if (gaugePctEl) gaugePctEl.textContent = periodSeries.length > 0 ? `${avg}%` : '--%';

    const style = getComputedStyle(document.documentElement);
    const bgTrack = style.getPropertyValue('--bg').trim();
    if (gaugeBgEl) {
        gaugeBgEl.style.background = periodSeries.length > 0
            ? `conic-gradient(#2ecc71 0% ${avg}%, ${bgTrack} ${avg}% 100%)`
            : `conic-gradient(#2ecc71 0% 0%, ${bgTrack} 0% 100%)`;
    }

    // === KPIs ===
    // Variation
    const varEl = document.getElementById('prog-variation');
    if (varEl) {
        if (periodSeries.length === 0) {
            varEl.textContent = '--';
            varEl.className = 'prog-kpi-value neutral';
        } else if (prevSeries.length === 0) {
            varEl.textContent = 'N/A';
            varEl.className = 'prog-kpi-value neutral';
        } else {
            const prevTotal = prevSeries.reduce((s, x) => s + x.score, 0);
            const prevMax = prevSeries.reduce((s, x) => s + x.max, 0);
            const prevAvg = prevMax > 0 ? Math.round((prevTotal / prevMax) * 100) : 0;
            const diff = avg - prevAvg;
            if (diff > 0) {
                varEl.textContent = `+${diff}%`;
                varEl.className = 'prog-kpi-value positive';
            } else if (diff < 0) {
                varEl.textContent = `${diff}%`;
                varEl.className = 'prog-kpi-value negative';
            } else {
                varEl.textContent = '0%';
                varEl.className = 'prog-kpi-value neutral';
            }
        }
    }

    // Meilleure série
    const bestEl = document.getElementById('prog-best');
    if (bestEl) {
        if (periodSeries.length === 0) {
            bestEl.textContent = '--/--';
        } else {
            const best = periodSeries.reduce((b, s) => s.score > b.score ? s : b, periodSeries[0]);
            bestEl.textContent = `${best.score}/${best.max}`;
        }
    }

    // Nombre de séries
    const countEl = document.getElementById('prog-count');
    if (countEl) {
        countEl.textContent = periodSeries.length === 0 ? '0' : periodSeries.length;
    }

    // === GRAPHIQUE ===
    const container = document.getElementById('chart-progression');
    if (!container) return;

    if (periodSeries.length < 2) {
        container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:30px 0;">${periodSeries.length === 0 ? 'Aucune série sur cette période.' : '1 seule série — min. 2 pour le graphique.'}</p>`;
        return;
    }

    const chartData = aggregateForChart(periodSeries, period);
    renderSmoothProgressionChart(container, chartData, period);
}

// ========================================
// GRAPHIQUE PROGRESSION V2 — Courbe lisse + dégradé
// ========================================
function renderSmoothProgressionChart(container, data, period) {
    if (!data || data.length < 2) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Pas assez de données.</p>';
        return;
    }

    const width = container.clientWidth - 20;
    const height = 240;
    const pad = { t: 20, r: 16, b: 36, l: 40 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;

    // Calculer les points
    const pts = data.map((d, i) => ({
        x: pad.l + (w / (data.length - 1)) * i,
        y: pad.t + h - (d.pct / 100) * h,
        pct: d.pct,
        score: d.score,
        max: d.max,
        date: d.date,
        count: d.count || 1
    }));

    // Générer le chemin lisse (Cardinal Spline → Cubic Bezier)
    function smoothPath(points, tension = 0.3) {
        if (points.length < 2) return '';
        let path = `M ${points[0].x} ${points[0].y}`;

        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];

            const cp1x = p1.x + (p2.x - p0.x) * tension;
            const cp1y = p1.y + (p2.y - p0.y) * tension;
            const cp2x = p2.x - (p3.x - p1.x) * tension;
            const cp2y = p2.y - (p3.y - p1.y) * tension;

            path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
        }
        return path;
    }

    const linePath = smoothPath(pts);

    // Zone remplie sous la courbe (area chart)
    const areaPath = linePath +
        ` L ${pts[pts.length - 1].x} ${pad.t + h}` +
        ` L ${pts[0].x} ${pad.t + h} Z`;

    // Construire le SVG
    const svgId = 'prog-chart-svg-' + Date.now();
    let svg = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" style="overflow:visible;">`;

    // Définitions (gradient)
    svg += `<defs>
        <linearGradient id="progGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.6"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.03"/>
        </linearGradient>
    </defs>`;

    // Lignes de grille horizontales
    for (let i = 0; i <= 4; i++) {
        const y = pad.t + (h / 4) * i;
        const val = 100 - (25 * i);
        svg += `<line x1="${pad.l}" y1="${y}" x2="${width - pad.r}" y2="${y}" class="chart-grid-line"/>`;
        svg += `<text x="${pad.l - 8}" y="${y + 4}" class="chart-axis-label" text-anchor="end">${val}%</text>`;
    }

    // Zone remplie (dégradé)
    svg += `<path d="${areaPath}" class="chart-area-fill"/>`;

    // Courbe lisse
    svg += `<path d="${linePath}" class="chart-smooth-line"/>`;

    // Points de données
    pts.forEach(p => {
        const dateFormatted = formatChartDate(p.date, period);
        svg += `<circle cx="${p.x}" cy="${p.y}" r="5" class="chart-smooth-point">
            <title>${dateFormatted} : ${p.score}/${p.max} (${p.pct}%)</title>
        </circle>`;
    });

    // Labels axe X
    pts.forEach((p, i) => {
        // Afficher 1 label sur 2 max si trop de points
        const showLabel = pts.length <= 8 || i % 2 === 0;
        if (showLabel) {
            const dateFormatted = formatChartDate(p.date, period);
            svg += `<text x="${p.x}" y="${pad.t + h + 20}" class="chart-axis-label" text-anchor="middle">${dateFormatted}</text>`;
        }
    });

    svg += `</svg>`;
    container.innerHTML = svg;
}

// ========================================
// ÉVÉNEMENTS BOUTONS PÉRIODE
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const periodGroup = document.getElementById('prog-period-group');
    if (periodGroup) {
        periodGroup.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-choice');
            if (!btn || !btn.dataset.period) return;

            currentProgressionPeriod = btn.dataset.period;
            updateProgressionPeriodButtons();

            try {
                const allSeries = await Storage.getAllSeries();
                const filteredSeries = currentStatsFilter === 'all'
                    ? allSeries
                    : allSeries.filter(s => s.discipline === currentStatsFilter);
                await updateProgressionModal(filteredSeries);
            } catch (err) {
                console.error('Erreur changement période:', err);
            }
        });
    }
});

// Fermeture au clic sur l'overlay
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && e.target.style.display === 'flex') {
        e.target.style.display = 'none';
    }
});

// ========================================
// MODALE FUSIL & CHOKES
// ========================================
let fusilModalFilter = 'FU'; // Filtre discipline propre à la modale

// Abréviation d'un choke individuel pour l'affichage compact
// Liste officielle : Cyl, 1/4, 1/2, 3/4, Full, SK, xFull
// Jamais de termes anglais (IM, MOD, IC, Improved Modified, etc.)
// Supporte les 2 formats : amovibles ("3/4 - IM ●●●○") et fixes ("3/4 - Improved Modified (IM ●●●○)")
function abbreviateChoke(chokeStr) {
    if (!chokeStr) return '';
    const map = {
        // Format amovibles
        'Cylindrique - CYL ○': 'Cyl',
        '1/4 - IC ●○': '1/4',
        '1/2 - MOD ●●○': '1/2',
        '3/4 - IM ●●●○': '3/4',
        'Full - F ●●●': 'Full',
        'Skeet - SK ◎': 'SK',
        'Extra Full - EF ●●●●': 'xFull',
        // Format fixes (parenthèses + noms anglais)
        'Cylindrique (CYL ○)': 'Cyl',
        '1/4 - Improved Cylinder (IC ●○)': '1/4',
        '1/2 - Modified (MOD ●●○)': '1/2',
        '3/4 - Improved Modified (IM ●●●○)': '3/4',
        'Full (F ●●●)': 'Full',
        'Skeet (SK ◎)': 'SK',
        'Extra Full (EF ●●●●)': 'xFull'
    };
    return map[chokeStr] || chokeStr.replace(/\s*[-–(].*$/, '').trim();
}

// Abréviation du champ chokes complet
// Le champ chokes est construit comme : CHOKE1 - CHOKE2
// avec CHOKE1 = 1er canon, CHOKE2 = 2ème canon
// On respecte l'ordre : abbr1 & abbr2 (1er & 2ème canon)
// Ex amovibles: "3/4 - IM ●●●○ - Full - F ●●●" → "3/4 & Full"
// Ex fixes: "3/4 - Improved Modified (IM ●●●○) - Full (F ●●●)" → "3/4 & Full"
function abbreviateChokesCombo(chokesStr) {
    if (!chokesStr) return '';

    // Patterns de chokes connus (du plus long au plus court pour matcher en priorité)
    // Les 2 formats : amovibles ET fixes
    const chokePatterns = [
        // Format fixes (plus longs, à matcher en premier)
        'Extra Full (EF ●●●●)',
        'Cylindrique (CYL ○)',
        '3/4 - Improved Modified (IM ●●●○)',
        '1/2 - Modified (MOD ●●○)',
        '1/4 - Improved Cylinder (IC ●○)',
        'Full (F ●●●)',
        'Skeet (SK ◎)',
        // Format amovibles
        'Extra Full - EF ●●●●',
        'Cylindrique - CYL ○',
        '3/4 - IM ●●●○',
        '1/2 - MOD ●●○',
        '1/4 - IC ●○',
        'Full - F ●●●',
        'Skeet - SK ◎'
    ];

    // Trouver les chokes DANS L'ORDRE d'apparition dans la chaîne
    // (1er trouvé = 1er canon, 2ème trouvé = 2ème canon)
    const found = [];
    let remaining = chokesStr;
    while (remaining.length > 0) {
        let matched = false;
        for (const pattern of chokePatterns) {
            const idx = remaining.indexOf(pattern);
            if (idx !== -1) {
                found.push({ idx, abbr: abbreviateChoke(pattern) });
                remaining = remaining.replace(pattern, '');
                matched = true;
                break;
            }
        }
        if (!matched) break;
    }

    // Trier par position d'apparition pour respecter l'ordre 1er/2ème canon
    found.sort((a, b) => a.idx - b.idx);
    const abbreviations = found.map(f => f.abbr);

    if (abbreviations.length >= 2) {
        return abbreviations[0] + ' & ' + abbreviations[1];
    } else if (abbreviations.length === 1) {
        return abbreviations[0];
    }

    // Dernier fallback : afficher tel quel, tronqué
    return chokesStr.length > 20 ? chokesStr.substring(0, 18) + '…' : chokesStr;
}

// Ouvrir la modale
window.openFusilModal = async function() {
    const modal = document.getElementById('modal-stats-fusil');
    if (!modal) return;

    // Initialiser le filtre avec la discipline en cours sur la page STATS
    fusilModalFilter = currentStatsFilter;
    updateFusilFilterButtons();

    modal.style.display = 'flex';
    await updateFusilModal();
};

// Fermer la modale
window.closeFusilModal = function() {
    const modal = document.getElementById('modal-stats-fusil');
    if (modal) modal.style.display = 'none';
};

// Changer le filtre discipline dans la modale
window.filterFusilModal = function(discipline) {
    fusilModalFilter = discipline;
    updateFusilFilterButtons();
    updateFusilModal();
};

// Mettre à jour les boutons de filtre actifs
function updateFusilFilterButtons() {
    document.querySelectorAll('#fusil-disc-group .btn-choice').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === fusilModalFilter);
    });
}

// Mise à jour complète de la modale
async function updateFusilModal() {
    try {
        const allSeries = await Storage.getAllSeries();
        const filtered = fusilModalFilter === 'all'
            ? allSeries
            : allSeries.filter(s => s.discipline === fusilModalFilter);

        renderFusilRanking(filtered);
        renderChokeChart(filtered);
    } catch (err) {
        console.error('Erreur updateFusilModal:', err);
    }
}

// ========================================
// CLASSEMENT PAR PERFORMANCE (cartes fusils)
// ========================================
function renderFusilRanking(series) {
    const container = document.getElementById('fusil-ranking-list');
    if (!container) return;

    // Grouper par fusil
    const groups = {};
    series.forEach(s => {
        const key = s.fusil || '';
        if (!key) return;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
    });

    const entries = Object.entries(groups);
    if (entries.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;">Aucun fusil enregistré pour cette discipline</p>';
        return;
    }

    // Calculer le % moyen et la combo de chokes la plus utilisée
    const ranked = entries.map(([name, seriesList]) => {
        const total = seriesList.reduce((s, x) => s + x.score, 0);
        const max = seriesList.reduce((s, x) => s + x.max, 0);
        const pct = max > 0 ? Math.round((total / max) * 100) : 0;

        // Trouver la combo de chokes la plus utilisée (via le champ s.chokes)
        const chokeCombos = {};
        seriesList.forEach(s => {
            const combo = abbreviateChokesCombo(s.chokes) || '—';
            chokeCombos[combo] = (chokeCombos[combo] || 0) + 1;
        });
        const bestCombo = Object.entries(chokeCombos).sort((a, b) => b[1] - a[1])[0][0];

        return { name, pct, count: seriesList.length, bestCombo };
    }).sort((a, b) => b.pct - a.pct);

    // Rendu HTML
    container.innerHTML = ranked.map((item, i) => {
        const rank = i + 1;
        const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'neutral';
        const scoreColor = item.pct >= 80 ? 'var(--score-excellent)' : item.pct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';

        return `
        <div class="fusil-rank-card">
            <div class="fusil-rank-circle ${rankClass}">${rank}</div>
            <div class="fusil-rank-info">
                <div class="fusil-rank-name">${item.name}</div>
                <div class="fusil-rank-detail">${item.bestCombo} — ${item.count} série${item.count > 1 ? 's' : ''}</div>
            </div>
            <div class="fusil-rank-score" style="color:${scoreColor}">${item.pct}%</div>
        </div>`;
    }).join('');
}

// ========================================
// PERFORMANCE PAR CHOKES (graphique barres)
// ========================================
function renderChokeChart(series) {
    const container = document.getElementById('choke-chart');
    if (!container) return;

    // Grouper par combinaison de chokes (via le champ s.chokes)
    const groups = {};
    series.forEach(s => {
        const chokesStr = s.chokes || '';
        if (!chokesStr) return;

        const combo = abbreviateChokesCombo(chokesStr);
        if (!combo || combo === '—') return;

        if (!groups[combo]) groups[combo] = { total: 0, max: 0, count: 0 };
        groups[combo].total += s.score;
        groups[combo].max += s.max;
        groups[combo].count++;
    });

    const entries = Object.entries(groups);
    if (entries.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;">Aucune donnée chokes pour cette discipline</p>';
        return;
    }

    // Trier par % décroissant
    const sorted = entries.map(([name, data]) => ({
        name,
        pct: data.max > 0 ? Math.round((data.total / data.max) * 100) : 0,
        count: data.count
    })).sort((a, b) => b.pct - a.pct);

    const barMaxH = 130;

    // Limiter l'affichage à 8 combos max pour la lisibilité
    const display = sorted.slice(0, 8);

    let html = '<div class="choke-bar-chart">';
    display.forEach(d => {
        const h = Math.max((d.pct / 100) * barMaxH, 6);
        const color = d.pct >= 80 ? 'var(--score-excellent)' : d.pct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';

        html += `
        <div class="choke-bar-wrapper">
            <div class="choke-bar-pct">${d.pct}%</div>
            <div class="choke-bar" style="height:${h}px;background:${color};"></div>
            <div class="choke-bar-label">${d.name}</div>
        </div>`;
    });
    html += '</div>';

    container.innerHTML = html;
}

// ========================================
// MODALE MÉTÉO & VENT
// ========================================
let meteoModalFilter = 'FU';

// Mapping météo : descriptions API → catégories normalisées avec icônes
// Les données stockées dans les séries sont les descriptions texte de l'API Open-Meteo
const METEO_CATEGORIES = {
    'Ciel clair':         { icon: '☀️', label: 'Soleil' },
    'Principalement clair': { icon: '🌤️', label: 'Soleil' },
    'Partiellement nuageux': { icon: '⛅', label: 'Nuageux' },
    'Couvert':            { icon: '☁️', label: 'Couvert' },
    'Brouillard':         { icon: '🌫️', label: 'Brouillard' },
    'Pluie':              { icon: '🌧️', label: 'Pluie' },
    'Averses':            { icon: '🌧️', label: 'Pluie' },
    'Neige':              { icon: '❄️', label: 'Neige' },
    'Orage':              { icon: '⛈️', label: 'Orage' },
    'Variable':           { icon: '🌥️', label: 'Variable' }
};

// Regrouper les descriptions en catégories d'affichage
function normalizeMeteo(meteoStr) {
    if (!meteoStr) return null;
    const s = meteoStr.trim();

    // Match direct dans la map
    if (METEO_CATEGORIES[s]) return METEO_CATEGORIES[s].label;

    // Match partiel (certaines entrées peuvent varier)
    const lower = s.toLowerCase();
    if (lower.includes('soleil') || lower.includes('clair') || lower.includes('ensoleill')) return 'Soleil';
    if (lower.includes('orage') || lower.includes('tempête') || lower.includes('orageux')) return 'Orage';
    if (lower.includes('neige') || lower.includes('neigeux')) return 'Neige';
    if (lower.includes('pluie') || lower.includes('pluvieux') || lower.includes('averse')) return 'Pluie';
    if (lower.includes('brouillard') || lower.includes('brume')) return 'Brouillard';
    if (lower.includes('couvert')) return 'Couvert';
    if (lower.includes('nuageux') || lower.includes('nuage')) return 'Nuageux';
    if (lower.includes('variable')) return 'Variable';

    return null; // Non reconnu → ignoré
}

function getMeteoIcon(label) {
    for (const [, cat] of Object.entries(METEO_CATEGORIES)) {
        if (cat.label === label) return cat.icon;
    }
    return '🌡️';
}

// Ouvrir la modale
window.openMeteoModal = async function() {
    const modal = document.getElementById('modal-stats-meteo');
    if (!modal) return;

    meteoModalFilter = currentStatsFilter;
    updateMeteoFilterButtons();

    modal.style.display = 'flex';
    await updateMeteoModal();
};

// Fermer la modale
window.closeMeteoModal = function() {
    const modal = document.getElementById('modal-stats-meteo');
    if (modal) modal.style.display = 'none';
};

// Changer le filtre discipline
window.filterMeteoModal = function(discipline) {
    meteoModalFilter = discipline;
    updateMeteoFilterButtons();
    updateMeteoModal();
};

function updateMeteoFilterButtons() {
    document.querySelectorAll('#meteo-disc-group .btn-choice').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === meteoModalFilter);
    });
}

// Mise à jour complète
async function updateMeteoModal() {
    try {
        const allSeries = await Storage.getAllSeries();
        const filtered = meteoModalFilter === 'all'
            ? allSeries
            : allSeries.filter(s => s.discipline === meteoModalFilter);

        renderMeteoCards(filtered);
        renderVentChart(filtered);
    } catch (err) {
        console.error('Erreur updateMeteoModal:', err);
    }
}

// ========================================
// CARTES MÉTÉO (grille neumorphique)
// ========================================
function renderMeteoCards(series) {
    const container = document.getElementById('meteo-cards-grid');
    if (!container) return;

    // Grouper par catégorie météo normalisée
    const groups = {};
    series.forEach(s => {
        const cat = normalizeMeteo(s.meteo);
        if (!cat) return;
        if (!groups[cat]) groups[cat] = { total: 0, max: 0, count: 0 };
        groups[cat].total += s.score;
        groups[cat].max += s.max;
        groups[cat].count++;
    });

    const entries = Object.entries(groups);
    if (entries.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;grid-column:1/-1;">Aucune donnée météo pour cette discipline</p>';
        return;
    }

    // Trier par % décroissant
    const sorted = entries.map(([name, data]) => ({
        name,
        pct: data.max > 0 ? Math.round((data.total / data.max) * 100) : 0,
        count: data.count
    })).sort((a, b) => b.pct - a.pct);

    container.innerHTML = sorted.map(d => {
        const icon = getMeteoIcon(d.name);
        const colorClass = d.pct >= 80 ? 'score-excellent' : d.pct >= 60 ? 'score-moyen' : 'score-faible';

        return `
        <div class="meteo-card">
            <div class="meteo-card-icon">${icon}</div>
            <div class="meteo-card-name">${d.name}</div>
            <div class="meteo-card-pct ${colorClass}">${d.pct}%</div>
        </div>`;
    }).join('');
}

// ========================================
// GRAPHIQUE VENT (barres dans champ creux)
// ========================================
function renderVentChart(series) {
    const container = document.getElementById('vent-chart');
    if (!container) return;

    // Grouper par vent
    const groups = {};
    const ventOrder = ['Faible', 'Modéré', 'Fort'];
    ventOrder.forEach(v => { groups[v] = { total: 0, max: 0, count: 0 }; });

    series.forEach(s => {
        const vent = s.vent || '';
        if (!vent || !groups[vent]) return;
        groups[vent].total += s.score;
        groups[vent].max += s.max;
        groups[vent].count++;
    });

    // Vérifier s'il y a des données
    const hasData = ventOrder.some(v => groups[v].count > 0);
    if (!hasData) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;">Aucune donnée vent pour cette discipline</p>';
        return;
    }

    // Construire les barres
    const barMaxH = 110;
    let html = '<div class="vent-bar-chart">';

    ventOrder.forEach(vent => {
        const data = groups[vent];
        if (data.count === 0) {
            html += `
            <div class="vent-bar-wrapper">
                <div class="vent-bar-pct" style="color:var(--text-muted);">—</div>
                <div class="vent-bar" style="height:6px;background:var(--text-muted);opacity:0.3;"></div>
                <div class="vent-bar-label">${vent}</div>
            </div>`;
            return;
        }
        const pct = data.max > 0 ? Math.round((data.total / data.max) * 100) : 0;
        const h = Math.max((pct / 100) * barMaxH, 6);
        const color = pct >= 80 ? 'var(--score-excellent)' : pct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';

        html += `
        <div class="vent-bar-wrapper">
            <div class="vent-bar-pct">${pct}%</div>
            <div class="vent-bar" style="height:${h}px;background:${color};"></div>
            <div class="vent-bar-label">${vent}</div>
        </div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

// ========================================
// MODALE PAR CARTOUCHE
// ========================================
let cartoucheModalFilter = 'FU';

window.openCartoucheModal = async function() {
    const modal = document.getElementById('modal-stats-cartouche');
    if (!modal) return;

    cartoucheModalFilter = currentStatsFilter;
    updateCartoucheFilterButtons();

    modal.style.display = 'flex';
    await updateCartoucheModal();
};

window.closeCartoucheModal = function() {
    const modal = document.getElementById('modal-stats-cartouche');
    if (modal) modal.style.display = 'none';
};

window.filterCartoucheModal = function(discipline) {
    cartoucheModalFilter = discipline;
    updateCartoucheFilterButtons();
    updateCartoucheModal();
};

function updateCartoucheFilterButtons() {
    document.querySelectorAll('#cartouche-disc-group .btn-choice').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === cartoucheModalFilter);
    });
}

async function updateCartoucheModal() {
    try {
        const allSeries = await Storage.getAllSeries();
        const filtered = cartoucheModalFilter === 'all'
            ? allSeries
            : allSeries.filter(s => s.discipline === cartoucheModalFilter);

        renderCartoucheRanking(filtered);
    } catch (err) {
        console.error('Erreur updateCartoucheModal:', err);
    }
}

// ========================================
// CLASSEMENT PAR CARTOUCHE (cartes tuiles)
// ========================================
function renderCartoucheRanking(series) {
    const container = document.getElementById('cartouche-ranking-list');
    if (!container) return;

    // Grouper par cartouche
    const groups = {};
    series.forEach(s => {
        const key = s.cartouche || '';
        if (!key) return;
        if (!groups[key]) groups[key] = { total: 0, max: 0, count: 0 };
        groups[key].total += s.score;
        groups[key].max += s.max;
        groups[key].count++;
    });

    const entries = Object.entries(groups);
    if (entries.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;">Aucune cartouche enregistrée pour cette discipline</p>';
        return;
    }

    // Trier par % décroissant
    const ranked = entries.map(([name, data]) => ({
        name,
        pct: data.max > 0 ? Math.round((data.total / data.max) * 100) : 0,
        count: data.count
    })).sort((a, b) => b.pct - a.pct);

    // Rendu HTML — cartes tuiles style fusil ranking
    container.innerHTML = ranked.map((item, i) => {
        const rank = i + 1;
        const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'neutral';
        const scoreColor = item.pct >= 80 ? 'var(--score-excellent)' : item.pct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';

        return `
        <div class="fusil-rank-card">
            <div class="fusil-rank-circle ${rankClass}">${rank}</div>
            <div class="fusil-rank-info">
                <div class="fusil-rank-name">${item.name}</div>
                <div class="fusil-rank-detail">${item.count} série${item.count > 1 ? 's' : ''}</div>
            </div>
            <div class="fusil-rank-score" style="color:${scoreColor}">${item.pct}%</div>
        </div>`;
    }).join('');
}

// ========================================
// MODALE PAR TENUE
// ========================================
let tenueModalFilter = 'FU';

window.openTenueModal = async function() {
    const modal = document.getElementById('modal-stats-tenue');
    if (!modal) return;

    tenueModalFilter = currentStatsFilter;
    updateTenueFilterButtons();

    modal.style.display = 'flex';
    await updateTenueModal();
};

window.closeTenueModal = function() {
    const modal = document.getElementById('modal-stats-tenue');
    if (modal) modal.style.display = 'none';
};

window.filterTenueModal = function(discipline) {
    tenueModalFilter = discipline;
    updateTenueFilterButtons();
    updateTenueModal();
};

function updateTenueFilterButtons() {
    document.querySelectorAll('#tenue-disc-group .btn-choice').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === tenueModalFilter);
    });
}

async function updateTenueModal() {
    try {
        const allSeries = await Storage.getAllSeries();
        const filtered = tenueModalFilter === 'all'
            ? allSeries
            : allSeries.filter(s => s.discipline === tenueModalFilter);

        renderTenueRanking(filtered);
    } catch (err) {
        console.error('Erreur updateTenueModal:', err);
    }
}

function renderTenueRanking(series) {
    const container = document.getElementById('tenue-ranking-list');
    if (!container) return;

    // Grouper par tenue
    const groups = {};
    series.forEach(s => {
        const key = s.tenue || '';
        if (!key) return;
        if (!groups[key]) groups[key] = { total: 0, max: 0, count: 0 };
        groups[key].total += s.score;
        groups[key].max += s.max;
        groups[key].count++;
    });

    const entries = Object.entries(groups);
    if (entries.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;">Aucune tenue enregistrée pour cette discipline</p>';
        return;
    }

    const ranked = entries.map(([name, data]) => ({
        name,
        pct: data.max > 0 ? Math.round((data.total / data.max) * 100) : 0,
        count: data.count
    })).sort((a, b) => b.pct - a.pct);

    container.innerHTML = ranked.map((item, i) => {
        const rank = i + 1;
        const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'neutral';
        const scoreColor = item.pct >= 80 ? 'var(--score-excellent)' : item.pct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';

        return `
        <div class="fusil-rank-card">
            <div class="fusil-rank-circle ${rankClass}">${rank}</div>
            <div class="fusil-rank-info">
                <div class="fusil-rank-name">${item.name}</div>
                <div class="fusil-rank-detail">${item.count} série${item.count > 1 ? 's' : ''}</div>
            </div>
            <div class="fusil-rank-score" style="color:${scoreColor}">${item.pct}%</div>
        </div>`;
    }).join('');
}

// ========================================
// MODALE COMPÉTITIONS — Année en cours uniquement
// ========================================
let compModalFilter = 'FU';

// Scores max par discipline et par série
const SCORES_MAX_COMP = {
    'FU': 25, 'DTL': 75, 'TRAP1': 75, 'PCH': 25, 'CS': 25,
    'Fosse Olympique': 25, 'Skeet Olympique': 25
};
const SERIES_PAR_COMP = { '100': 4, '200': 8 };

// Calculer le total d'une compétition selon discipline et mode
function getCompTotal(disc, mode) {
    const scorePerSerie = SCORES_MAX_COMP[disc] || 25;
    const nbSeries = SERIES_PAR_COMP[mode] || 4;
    return scorePerSerie * nbSeries;
}

window.openCompModal = async function() {
    const modal = document.getElementById('modal-stats-comp');
    if (!modal) return;

    compModalFilter = currentStatsFilter;
    updateCompFilterButtons();

    // Mettre à jour le label année
    const yearLabel = document.getElementById('comp-year-label');
    if (yearLabel) yearLabel.textContent = 'Année ' + new Date().getFullYear();

    modal.style.display = 'flex';
    await updateCompModal();
};

window.closeCompModal = function() {
    const modal = document.getElementById('modal-stats-comp');
    if (modal) modal.style.display = 'none';
};

window.filterCompModal = function(discipline) {
    compModalFilter = discipline;
    updateCompFilterButtons();
    updateCompModal();
};

function updateCompFilterButtons() {
    document.querySelectorAll('#comp-modal-disc-group .btn-choice').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === compModalFilter);
    });
}

async function updateCompModal() {
    try {
        const allComps = await Storage.getAllCompetitions();
        // Filtrer par discipline et status archivé
        let comps = allComps.filter(c => c.status === 'archived' && c.disc === compModalFilter);

        // Filtrer par année en cours uniquement
        const thisYear = new Date().getFullYear();
        comps = comps.filter(c => {
            const d = parseSerieDate(c.startDate || c.dateFin);
            return d && d.getFullYear() === thisYear;
        });

        // Trier par date décroissante
        comps.sort((a, b) => {
            const da = parseSerieDate(a.startDate || a.dateFin);
            const db = parseSerieDate(b.startDate || b.dateFin);
            return (db || 0) - (da || 0);
        });

        renderCompKPIs(comps);
        renderCompList(comps);
    } catch (err) {
        console.error('Erreur updateCompModal:', err);
    }
}

// ========================================
// KPI COMPÉTITIONS
// ========================================
function renderCompKPIs(comps) {
    const countEl = document.getElementById('comp-kpi-count');
    const avgEl = document.getElementById('comp-kpi-avg');
    const bestEl = document.getElementById('comp-kpi-best');
    const globalEl = document.getElementById('comp-kpi-global');

    if (!countEl) return;

    countEl.textContent = comps.length;

    if (comps.length === 0) {
        avgEl.textContent = '—';
        bestEl.textContent = '—';
        if (globalEl) globalEl.textContent = '—';
        return;
    }

    // Calculer les % de chaque compétition + score global
    let totalPct = 0;
    let bestPct = 0;
    let globalScore = 0;
    let globalMax = 0;
    comps.forEach(c => {
        const cumul = c.scoreCumul || 0;
        const max = c.scoreMaxCumul || 1;
        const pct = max > 0 ? Math.round((cumul / max) * 100) : 0;
        totalPct += pct;
        globalScore += cumul;
        globalMax += max;
        if (pct > bestPct) bestPct = pct;
    });

    const avgPct = Math.round(totalPct / comps.length);
    avgEl.textContent = avgPct + '%';
    bestEl.textContent = bestPct + '%';

    // Score global (cumul de toutes les compétitions)
    if (globalEl) {
        globalEl.textContent = `${globalScore}/${globalMax}`;
        const globalPct = globalMax > 0 ? Math.round((globalScore / globalMax) * 100) : 0;
        globalEl.style.color = globalPct >= 80 ? 'var(--score-excellent)' : globalPct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';
    }

    // Couleurs
    avgEl.style.color = avgPct >= 80 ? 'var(--score-excellent)' : avgPct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';
    bestEl.style.color = bestPct >= 80 ? 'var(--score-excellent)' : bestPct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';
}

// ========================================
// LISTE DES COMPÉTITIONS — avec score/total à droite
// ========================================
async function renderCompList(comps) {
    const container = document.getElementById('comp-list');
    if (!container) return;

    if (comps.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;">Aucune compétition cette année pour cette discipline</p>';
        return;
    }

    // Récupérer toutes les séries pour les scores par manche
    const allSeries = await Storage.getAllSeries();

    let html = '';
    comps.forEach(comp => {
        const compPct = comp.scoreMaxCumul ? Math.round((comp.scoreCumul / comp.scoreMaxCumul) * 100) : 0;
        const compName = comp.name || (comp.disc + ' - ' + comp.mode + ' plx');
        const compDate = comp.startDate ? formatDateFR(comp.startDate) : (comp.dateFin ? formatDateFR(comp.dateFin) : '—');

        // Total de la compétition (100/200 pour standards, 300/600 pour DTL/TRAP1)
        const totalComp = getCompTotal(comp.disc, comp.mode);
        const scoreComp = comp.scoreCumul || 0;

        // Récupérer les séries de cette compétition
        const compSeries = (comp.series || []).map(id => allSeries.find(s => s.id === id)).filter(Boolean);

        // Badges des scores par manche
        let seriesBadges = '';
        compSeries.forEach(serie => {
            const pct = serie.max > 0 ? Math.round((serie.score / serie.max) * 100) : 0;
            const badgeColor = pct >= 80 ? 'var(--score-excellent)' : pct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';
            seriesBadges += `<span class="comp-serie-badge" style="background:${badgeColor};">${serie.score}/${serie.max}</span>`;
        });

        const scoreColor = compPct >= 80 ? 'var(--score-excellent)' : compPct >= 60 ? 'var(--score-moyen)' : 'var(--score-faible)';

        html += `
        <div class="comp-card">
            <div class="comp-card-header">
                <div class="comp-card-name">${compName}</div>
                <div class="comp-card-date">${compDate}</div>
            </div>
            <div class="comp-card-badges">${seriesBadges}</div>
            <div class="comp-card-score-total">
                <span class="comp-card-pct" style="color:${scoreColor}">${compPct}%</span>
                <span class="comp-card-total" style="color:${scoreColor}">${scoreComp}/${totalComp}</span>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

// ========================================
// MODALE BADGES
// ========================================
let badgesModalFilter = 'FU'; // Filtre discipline propre à la modale

// Définition des badges (médailles SVG sans ruban)
const BADGE_SVGS = {
    bronze: `<svg viewBox="0 0 120 120"><defs><linearGradient id="br1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#e8a85c"/><stop offset="50%" stop-color="#cd7f32"/><stop offset="100%" stop-color="#a0601a"/></linearGradient></defs><circle cx="60" cy="60" r="52" fill="url(#br1)" stroke="#8b4513" stroke-width="3"/><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/><ellipse cx="45" cy="45" rx="16" ry="9" fill="rgba(255,255,255,0.18)" transform="rotate(-20 45 45)"/><polygon points="60,30 65,45 80,45 68,54 72,69 60,60 48,69 52,54 40,45 55,45" fill="rgba(255,255,255,0.5)"/></svg>`,
    silver: `<svg viewBox="0 0 120 120"><defs><linearGradient id="ag1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#d4d4d8"/><stop offset="50%" stop-color="#a8a9ad"/><stop offset="100%" stop-color="#7a7a80"/></linearGradient></defs><circle cx="60" cy="60" r="52" fill="url(#ag1)" stroke="#6b6b72" stroke-width="3"/><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/><ellipse cx="45" cy="45" rx="16" ry="9" fill="rgba(255,255,255,0.22)" transform="rotate(-20 45 45)"/><polygon points="60,30 65,45 80,45 68,54 72,69 60,60 48,69 52,54 40,45 55,45" fill="rgba(255,255,255,0.55)"/></svg>`,
    gold: `<svg viewBox="0 0 120 120"><defs><linearGradient id="or1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ffe066"/><stop offset="50%" stop-color="#f1c40f"/><stop offset="100%" stop-color="#c49a00"/></linearGradient></defs><circle cx="60" cy="60" r="52" fill="url(#or1)" stroke="#9a7800" stroke-width="3"/><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/><ellipse cx="45" cy="45" rx="16" ry="9" fill="rgba(255,255,255,0.28)" transform="rotate(-20 45 45)"/><polygon points="60,30 65,45 80,45 68,54 72,69 60,60 48,69 52,54 40,45 55,45" fill="rgba(255,255,255,0.6)"/></svg>`,
    diamond: `<svg viewBox="0 0 120 120"><defs><linearGradient id="di1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4dd9e8"/><stop offset="50%" stop-color="#00bcd4"/><stop offset="100%" stop-color="#008c9e"/></linearGradient><linearGradient id="di2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#80deea"/><stop offset="100%" stop-color="#006064"/></linearGradient></defs><circle cx="60" cy="60" r="52" fill="url(#di1)" stroke="#008c9e" stroke-width="3"/><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/><polygon points="60,22 88,52 60,92 32,52" fill="url(#di2)" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linejoin="round"/><line x1="60" y1="22" x2="60" y2="92" stroke="rgba(255,255,255,0.2)" stroke-width="1"/><line x1="32" y1="52" x2="88" y2="52" stroke="rgba(255,255,255,0.2)" stroke-width="1"/><line x1="60" y1="22" x2="32" y2="52" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/><line x1="60" y1="22" x2="88" y2="52" stroke="rgba(255,255,255,0.12)" stroke-width="0.8"/><polygon points="60,26 46,46 60,44" fill="rgba(255,255,255,0.35)"/><circle cx="50" cy="42" r="3" fill="rgba(255,255,255,0.6)"/></svg>`,
    locked: `<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="#b0b0b0" stroke="#888" stroke-width="3"/><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/><polygon points="60,30 65,45 80,45 68,54 72,69 60,60 48,69 52,54 40,45 55,45" fill="rgba(255,255,255,0.15)"/></svg>`
};

const LOCK_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text-muted)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

const BADGE_CONFIG = [
    {
        id: 'debutant',
        title: 'Débutant',
        color: '#cd7f32',
        colorLight: 'rgba(205,127,50,0.12)',
        svgKey: 'bronze',
        check: (series) => series.length >= 5,
        progress: (series) => Math.min(series.length / 5, 1),
        legend: () => '≥ 5 séries'
    },
    {
        id: 'confirme',
        title: 'Confirmé',
        color: '#a8a9ad',
        colorLight: 'rgba(168,169,173,0.12)',
        svgKey: 'silver',
        check: (series) => {
            if (series.length < 20) return false;
            const total = series.reduce((s, x) => s + x.score, 0);
            const max = series.reduce((s, x) => s + x.max, 0);
            return max > 0 ? (total / max) * 100 >= 80 : false;
        },
        progress: (series) => {
            const seriesPct = Math.min(series.length / 20, 1);
            const total = series.reduce((s, x) => s + x.score, 0);
            const max = series.reduce((s, x) => s + x.max, 0);
            const avg = max > 0 ? (total / max) * 100 : 0;
            const scorePct = Math.min(avg / 80, 1);
            return Math.min(seriesPct, scorePct);
        },
        legend: () => 'Moyenne ≥ 80% sur 20 séries'
    },
    {
        id: 'expert',
        title: 'Expert',
        color: '#f1c40f',
        colorLight: 'rgba(241,196,15,0.12)',
        svgKey: 'gold',
        check: (series) => {
            if (series.length < 50) return false;
            const total = series.reduce((s, x) => s + x.score, 0);
            const max = series.reduce((s, x) => s + x.max, 0);
            return max > 0 ? (total / max) * 100 > 85 : false;
        },
        progress: (series) => {
            const seriesPct = Math.min(series.length / 50, 1);
            const total = series.reduce((s, x) => s + x.score, 0);
            const max = series.reduce((s, x) => s + x.max, 0);
            const avg = max > 0 ? (total / max) * 100 : 0;
            const scorePct = Math.min(avg / 85, 1);
            return Math.min(seriesPct, scorePct);
        },
        legend: () => 'Moyenne > 85% sur 50 séries'
    },
    {
        id: 'maitre',
        title: 'Maître',
        color: '#00bcd4',
        colorLight: 'rgba(0,188,212,0.12)',
        svgKey: 'diamond',
        check: (series) => {
            if (series.length < 100) return false;
            const total = series.reduce((s, x) => s + x.score, 0);
            const max = series.reduce((s, x) => s + x.max, 0);
            return max > 0 ? (total / max) * 100 > 95 : false;
        },
        progress: (series) => {
            const seriesPct = Math.min(series.length / 100, 1);
            const total = series.reduce((s, x) => s + x.score, 0);
            const max = series.reduce((s, x) => s + x.max, 0);
            const avg = max > 0 ? (total / max) * 100 : 0;
            const scorePct = Math.min(avg / 95, 1);
            return Math.min(seriesPct, scorePct);
        },
        legend: () => 'Moyenne > 95% sur 100 séries'
    }
];

window.openBadgesModal = async function() {
    const modal = document.getElementById('modal-stats-badges');
    if (!modal) return;
    modal.style.display = 'flex';
    badgesModalFilter = currentStatsFilter;

    // Mettre à jour le sélecteur avec la discipline courante
    document.querySelectorAll('#badges-disc-group .btn-choice').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === badgesModalFilter);
    });

    await renderBadgesModal();
};

window.closeBadgesModal = function() {
    const modal = document.getElementById('modal-stats-badges');
    if (modal) modal.style.display = 'none';
};

window.filterBadgesModal = function(discipline) {
    badgesModalFilter = discipline;
    document.querySelectorAll('#badges-disc-group .btn-choice').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === discipline);
    });
    renderBadgesModal();
};

async function renderBadgesModal() {
    const container = document.getElementById('badges-cards-list');
    if (!container) return;

    try {
        // TOUT-TEMPS : on prend TOUTES les séries de la discipline, sans filtre d'année
        const allSeries = await Storage.getAllSeries();
        const series = allSeries.filter(s => s.discipline === badgesModalFilter);

        const discName = DISC_NAMES[badgesModalFilter] || badgesModalFilter;

        if (series.length === 0) {
            container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:30px 0;">Aucune série enregistrée en ${discName}.</p>`;
            return;
        }

        let html = '';

        BADGE_CONFIG.forEach((badge, index) => {
            const unlocked = badge.check(series);
            const legend = badge.legend(series);
            const progress = badge.progress(series);
            const progressPct = Math.round(progress * 100);

            html += `
            <div class="badge-card ${unlocked ? 'badge-unlocked' : 'badge-locked'}">
                <!-- Icône badge -->
                <div class="badge-icon-wrap ${unlocked ? '' : 'badge-icon-locked'}">
                    <div class="badge-icon-svg">${unlocked ? BADGE_SVGS[badge.svgKey] : BADGE_SVGS.locked}</div>
                    ${unlocked ? '' : `<span class="badge-lock">${LOCK_SVG}</span>`}
                </div>

                <!-- Contenu -->
                <div class="badge-content">
                    <div class="badge-title" style="color:${unlocked ? badge.color : 'var(--text-muted)'};">${badge.title} ${discName}</div>
                    <div class="badge-legend">${legend}</div>
                    <div class="badge-bar-track">
                        <div class="badge-bar-fill" style="width:${progressPct}%; background:${badge.color};opacity:${unlocked ? 1 : 0.4};"></div>
                    </div>
                </div>
            </div>`;
        });

        container.innerHTML = html;

    } catch (err) {
        console.error('Erreur renderBadgesModal:', err);
        container.innerHTML = '<p style="color:var(--score-faible);text-align:center;">Erreur de chargement.</p>';
    }
}
