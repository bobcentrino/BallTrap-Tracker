/**
 * Ball-Trap Tracker — Storage Manager V2 (Vanilla JS / Global)
 * TOUT dans IndexedDB — plus aucune donnée critique en localStorage
 * 
 * ObjectStores :
 *   - series        → Séries de tir
 *   - stands        → Stands de tir
 *   - fusils        → Fusils (armurerie)
 *   - competitions  → Compétitions archivées
 *   - cartouches    → Historique des cartouches
 *   - chokes        → Historique des chokes
 *   - tenues        → Tenues (été, mi-saison, hiver)
 *   - settings      → Paramètres UI (thème, accent, etc.)
 */

(function() {
    'use strict';

    const DB_NAME = 'BallTrapTracker';
    const DB_VERSION = 2;  // ⬆️ Bump : nouveaux objectStores
    const MIGRATION_KEY = 'bt_migrated_v3';  // ⬆️ Nouvelle clé pour forcer la migration V2→V3

    let db = null;
    let isReady = false;

    // Helper date ISO (YYYY-MM-DD)
    function getISODate() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // ========================================
    // INITIALISATION & MIGRATION
    // ========================================
    async function init() {
        if (isReady) return Promise.resolve();

        try {
            db = await openDB();
            
            // Migration auto depuis localStorage (V1→V2 puis V2→V3)
            if (!localStorage.getItem(MIGRATION_KEY)) {
                await migrateFromLocalStorage();
                localStorage.setItem(MIGRATION_KEY, 'true');
                console.log('✅ Migration complète localStorage → IndexedDB V3');
            }
            
            isReady = true;
            return Promise.resolve();
        } catch (err) {
            console.error('❌ Erreur init storage:', err);
            isReady = false;
            return Promise.reject(err);
        }
    }

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            
            req.onupgradeneeded = (e) => {
                const d = e.target.result;
                
                // --- Stores existants ---
                if (!d.objectStoreNames.contains('series')) {
                    const store = d.createObjectStore('series', { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('discipline', 'discipline', { unique: false });
                    store.createIndex('standId', 'standId', { unique: false });
                    store.createIndex('competitionId', 'competitionId', { unique: false });
                }
                if (!d.objectStoreNames.contains('stands')) {
                    d.createObjectStore('stands', { keyPath: 'id' });
                }
                if (!d.objectStoreNames.contains('fusils')) {
                    d.createObjectStore('fusils', { keyPath: 'id' });
                }
                
                // --- Nouveaux stores V2 ---
                if (!d.objectStoreNames.contains('competitions')) {
                    const store = d.createObjectStore('competitions', { keyPath: 'id' });
                    store.createIndex('disc', 'disc', { unique: false });
                }
                if (!d.objectStoreNames.contains('cartouches')) {
                    d.createObjectStore('cartouches', { keyPath: 'id' });
                }
                if (!d.objectStoreNames.contains('chokes')) {
                    d.createObjectStore('chokes', { keyPath: 'id' });
                }
                if (!d.objectStoreNames.contains('tenues')) {
                    d.createObjectStore('tenues', { keyPath: 'key' });  // 1 seule ligne : key='main'
                }
                if (!d.objectStoreNames.contains('settings')) {
                    d.createObjectStore('settings', { keyPath: 'key' });  // 1 seule ligne : key='ui'
                }
            };
            
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function migrateFromLocalStorage() {
        if (!db) return;
        
        // Migration dans une transaction qui inclut TOUS les stores
        const storeNames = Array.from(db.objectStoreNames);
        const tx = db.transaction(storeNames, 'readwrite');

        // 1. Séries (ancienne clé: balltrap_tracker_v1)
        const oldSeries = JSON.parse(localStorage.getItem('balltrap_tracker_v1') || '[]');
        if (oldSeries.length) {
            const store = tx.objectStore('series');
            oldSeries.forEach(s => {
                store.put({
                    id: s.id || Date.now() + Math.random(),
                    date: s.date || getISODate(),
                    discipline: s.discipline || 'FU',
                    score: s.score || 0,
                    max: s.max || 25,
                    lieu: s.lieu || '',
                    standId: s.standId || null,
                    fusil: s.fusil || '',
                    cartouche: s.cartouche || '',
                    chokes: s.chokes || '',
                    vent: s.vent || 'Modéré',
                    meteo: s.meteo || '',
                    notes: s.notes || '',
                    competitionId: s.competitionId || null,
                    competitionName: s.competitionName || null,
                    tenue: s.tenue || '',
                    sessionName: s.sessionName || null,
                    grille: null,
                    directions: null
                });
            });
        }

        // 2. Stands (ancienne clé: bt_stands)
        const oldStands = JSON.parse(localStorage.getItem('bt_stands') || '[]');
        if (oldStands.length) {
            const store = tx.objectStore('stands');
            oldStands.forEach(s => {
                store.put({ ...s, id: s.id || Date.now() + Math.random() });
            });
        }

        // 3. Fusils (ancienne clé: bt_armurerie)
        const oldFusils = JSON.parse(localStorage.getItem('bt_armurerie') || '[]');
        if (oldFusils.length) {
            const store = tx.objectStore('fusils');
            oldFusils.forEach(f => {
                store.put({ ...f, id: f.id || Date.now() + Math.random() });
            });
        }

        // 4. Compétitions archivées (ancienne clé: bt_competitions_archive)
        const oldComps = JSON.parse(localStorage.getItem('bt_competitions_archive') || '[]');
        if (oldComps.length) {
            const store = tx.objectStore('competitions');
            oldComps.forEach(c => {
                store.put({ ...c, id: c.id || Date.now() + Math.random() });
            });
            console.log(`📦 Migration: ${oldComps.length} compétitions archivées`);
        }

        // 5. Cartouches (ancienne clé: bt_cartouches) — tableau de strings → tableau d'objets
        const oldCartouches = JSON.parse(localStorage.getItem('bt_cartouches') || '[]');
        if (oldCartouches.length) {
            const store = tx.objectStore('cartouches');
            oldCartouches.forEach((name, i) => {
                store.put({ id: 'cart_' + i, name: name });
            });
            console.log(`📦 Migration: ${oldCartouches.length} cartouches`);
        }

        // 6. Chokes historique (ancienne clé: bt_chokes_history)
        const oldChokes = JSON.parse(localStorage.getItem('bt_chokes_history') || '[]');
        if (oldChokes.length) {
            const store = tx.objectStore('chokes');
            oldChokes.forEach((combo, i) => {
                store.put({ id: 'choke_' + i, combo: combo });
            });
            console.log(`📦 Migration: ${oldChokes.length} chokes`);
        }

        // 7. Tenues (ancienne clé: bt_tenues) — objet {ete, mi-saison, hiver}
        const oldTenues = JSON.parse(localStorage.getItem('bt_tenues') || '{}');
        if (oldTenues.ete || oldTenues['mi-saison'] || oldTenues.hiver) {
            tx.objectStore('tenues').put({
                key: 'main',
                ete: oldTenues.ete || '',
                'mi-saison': oldTenues['mi-saison'] || '',
                hiver: oldTenues.hiver || ''
            });
            console.log('📦 Migration: tenues');
        }

        // 8. Settings UI (ancienne clé: bt_settings)
        const oldSettings = JSON.parse(localStorage.getItem('bt_settings') || '{}');
        if (oldSettings.darkMode || oldSettings.highVis || oldSettings.accentColor) {
            tx.objectStore('settings').put({
                key: 'ui',
                darkMode: oldSettings.darkMode || false,
                highVis: oldSettings.highVis || false,
                accentColor: oldSettings.accentColor || '#f39c12'
            });
            console.log('📦 Migration: settings UI');
        }

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ========================================
    // HELPERS
    // ========================================
    function getStore(name, mode = 'readonly') {
        if (!db) throw new Error('IndexedDB non initialisée. Appelle Storage.init() d\'abord.');
        return db.transaction(name, mode).objectStore(name);
    }

    function promisify(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ========================================
    // API PUBLIQUE — SÉRIES
    // ========================================
    async function getAllSeries() {
        const req = getStore('series').getAll();
        const result = await promisify(req);
        return result || [];
    }

    async function getSerie(id) {
        const req = getStore('series').get(id);
        return promisify(req);
    }

    async function getSeriesByDiscipline(disc) {
        const req = getStore('series').index('discipline').getAll(disc);
        const result = await promisify(req);
        return result || [];
    }

    async function getSeriesByCompetition(compId) {
        const req = getStore('series').index('competitionId').getAll(compId);
        const result = await promisify(req);
        return result || [];
    }

    async function addSerie(data) {
        const uniqueId = data.id || (Date.now() + Math.floor(Math.random() * 1000));
        
        const item = {
            id: uniqueId,
            date: data.date || getISODate(),
            discipline: data.discipline,
            score: data.score,
            max: data.max,
            lieu: data.lieu || '',
            standId: data.standId || null,
            fusil: data.fusil || '',
            cartouche: data.cartouche || '',
            chokes: data.chokes || '',
            chokeType: data.chokeType || '',
            vent: data.vent || 'Modéré',
            meteo: data.meteo || '',
            notes: data.notes || '',
            competitionId: data.competitionId || null,
            competitionName: data.competitionName || null,
            sessionName: data.sessionName || null,
            tenue: data.tenue || '',
            grille: null,
            directions: null
        };
        
        const req = getStore('series', 'readwrite').put(item);
        await promisify(req);
        return item.id;
    }

    async function deleteSerie(id) {
        const req = getStore('series', 'readwrite').delete(id);
        await promisify(req);
    }

    // ========================================
    // API PUBLIQUE — STANDS
    // ========================================
    async function getAllStands() {
        const req = getStore('stands').getAll();
        const result = await promisify(req);
        return result || [];
    }

    async function saveStand(data) {
        const item = { ...data, id: data.id || Date.now() };
        const req = getStore('stands', 'readwrite').put(item);
        await promisify(req);
        return item.id;
    }

    async function deleteStand(id) {
        const req = getStore('stands', 'readwrite').delete(id);
        await promisify(req);
    }

    // ========================================
    // API PUBLIQUE — FUSILS
    // ========================================
    async function getAllFusils() {
        const req = getStore('fusils').getAll();
        const result = await promisify(req);
        return result || [];
    }

    async function saveFusil(data) {
        const item = { ...data, id: data.id || Date.now() };
        const req = getStore('fusils', 'readwrite').put(item);
        await promisify(req);
        return item.id;
    }

    async function deleteFusil(id) {
        const req = getStore('fusils', 'readwrite').delete(id);
        await promisify(req);
    }

    // ========================================
    // API PUBLIQUE — COMPÉTITIONS
    // ========================================
    async function getAllCompetitions() {
        const req = getStore('competitions').getAll();
        const result = await promisify(req);
        return result || [];
    }

    async function getCompetitionsByDiscipline(disc) {
        const req = getStore('competitions').index('disc').getAll(disc);
        const result = await promisify(req);
        return result || [];
    }

    async function saveCompetition(data) {
        const item = { ...data, id: data.id || Date.now() };
        const req = getStore('competitions', 'readwrite').put(item);
        await promisify(req);
        return item.id;
    }

    async function deleteCompetition(id) {
        const req = getStore('competitions', 'readwrite').delete(id);
        await promisify(req);
    }

    // Compétition active : stockée comme une compétition avec status='active'
    async function getCompetitionActive() {
        const all = await getAllCompetitions();
        return all.find(c => c.status === 'active') || null;
    }

    async function saveCompetitionActive(comp) {
        if (comp) {
            comp.status = 'active';
            return saveCompetition(comp);
        } else {
            // Supprimer la compétition active
            const active = await getCompetitionActive();
            if (active) {
                await deleteCompetition(active.id);
            }
            return null;
        }
    }

    async function archiveCompetition(comp) {
        comp.status = 'archived';
        comp.dateFin = comp.dateFin || getISODate();
        return saveCompetition(comp);
    }

    // ========================================
    // API PUBLIQUE — CARTOUCHES
    // ========================================
    async function getAllCartouches() {
        const req = getStore('cartouches').getAll();
        const result = await promisify(req);
        return result || [];
    }

    async function getCartouchesNames() {
        const all = await getAllCartouches();
        return all.map(c => c.name);
    }

    async function addCartouche(name) {
        if (!name || !name.trim()) return;
        // Vérifier si elle existe déjà
        const existing = await getAllCartouches();
        if (existing.find(c => c.name === name.trim())) return;
        
        const item = { id: 'cart_' + Date.now(), name: name.trim() };
        const req = getStore('cartouches', 'readwrite').put(item);
        await promisify(req);
    }

    async function deleteCartouche(id) {
        const req = getStore('cartouches', 'readwrite').delete(id);
        await promisify(req);
    }

    // ========================================
    // API PUBLIQUE — CHOKES (historique)
    // ========================================
    async function getAllChokes() {
        const req = getStore('chokes').getAll();
        const result = await promisify(req);
        return result || [];
    }

    async function getChokesCombos() {
        const all = await getAllChokes();
        return all.map(c => c.combo);
    }

    async function addChokeCombo(combo) {
        if (!combo || !combo.trim()) return;
        const existing = await getAllChokes();
        if (existing.find(c => c.combo === combo.trim())) return;
        
        const item = { id: 'choke_' + Date.now(), combo: combo.trim() };
        const req = getStore('chokes', 'readwrite').put(item);
        await promisify(req);
    }

    async function deleteChoke(id) {
        const req = getStore('chokes', 'readwrite').delete(id);
        await promisify(req);
    }

    // ========================================
    // API PUBLIQUE — TENUES
    // ========================================
    async function getTenues() {
        const req = getStore('tenues').get('main');
        const result = await promisify(req);
        return result || { key: 'main', ete: '', 'mi-saison': '', hiver: '' };
    }

    async function saveTenues(tenues) {
        const item = {
            key: 'main',
            ete: tenues.ete || '',
            'mi-saison': tenues['mi-saison'] || '',
            hiver: tenues.hiver || ''
        };
        const req = getStore('tenues', 'readwrite').put(item);
        await promisify(req);
    }

    // ========================================
    // API PUBLIQUE — SETTINGS UI
    // ========================================
    async function getSettings() {
        const req = getStore('settings').get('ui');
        const result = await promisify(req);
        return result || { key: 'ui', darkMode: false, highVis: false, accentColor: '#f39c12' };
    }

    async function saveSettings(settings) {
        const item = {
            key: 'ui',
            darkMode: settings.darkMode || false,
            highVis: settings.highVis || false,
            accentColor: settings.accentColor || '#f39c12'
        };
        const req = getStore('settings', 'readwrite').put(item);
        await promisify(req);
    }

    // ========================================
    // API PUBLIQUE — PARAMS (localStorage simple, pour compatibilité)
    // ========================================
    function saveParam(key, val) {
        localStorage.setItem(key, JSON.stringify(val));
    }

    function getParam(key, def = null) {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : def;
        } catch {
            return def;
        }
    }

    // ========================================
    // API PUBLIQUE — EXPORT / IMPORT
    // ========================================
    async function exportAllData() {
        const [series, stands, fusils, competitions, cartouches, chokes, tenues, settings] = await Promise.all([
            getAllSeries(), getAllStands(), getAllFusils(),
            getAllCompetitions(), getAllCartouches(), getAllChokes(),
            getTenues(), getSettings()
        ]);
        
        const backup = {
            version: DB_VERSION,
            date: new Date().toISOString(),
            app: 'Ball-Trap Tracker',
            // Données principales
            series,
            stands,
            fusils,
            competitions,
            // Listes
            cartouches: cartouches.map(c => c.name),      // Export en strings pour compatibilité
            chokes: chokes.map(c => c.combo),
            // Tenues & Settings
            tenues,
            settings,
            // Stats rapides
            stats: {
                totalSeries: series.length,
                totalFusils: fusils.length,
                totalStands: stands.length,
                totalCompetitions: competitions.length,
                totalCartouches: cartouches.length
            }
        };
        
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `balltrap-backup-${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function importAllData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Séries
                    if (data.series) {
                        for (const s of data.series) await addSerie(s);
                    }
                    // Stands
                    if (data.stands) {
                        for (const st of data.stands) await saveStand(st);
                    }
                    // Fusils (compat: data.fusils OU data.armurerie)
                    const fusilsData = data.fusils || data.armurerie || [];
                    if (fusilsData.length) {
                        for (const f of fusilsData) await saveFusil(f);
                    }
                    // Compétitions
                    if (data.competitions) {
                        for (const c of data.competitions) await saveCompetition(c);
                    }
                    // Cartouches (strings → objets)
                    if (data.cartouches && Array.isArray(data.cartouches)) {
                        for (const name of data.cartouches) {
                            if (typeof name === 'string') await addCartouche(name);
                        }
                    }
                    // Chokes
                    if (data.chokes && Array.isArray(data.chokes)) {
                        for (const combo of data.chokes) {
                            if (typeof combo === 'string') await addChokeCombo(combo);
                        }
                    }
                    // Tenues
                    if (data.tenues) {
                        await saveTenues(data.tenues);
                    }
                    // Settings
                    if (data.settings && data.settings.key) {
                        await saveSettings(data.settings);
                    }
                    
                    resolve(true);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    // ========================================
    // API PUBLIQUE — STATS RAPIDES
    // ========================================
    async function getStatsSummary() {
        const series = await getAllSeries();
        if (!series.length) return null;
        
        let total = 0, max = 0, best = 0;
        const byDisc = {};
        
        series.forEach(s => {
            total += s.score; max += s.max; best = Math.max(best, s.score);
            if (!byDisc[s.discipline]) {
                byDisc[s.discipline] = { n: 0, t: 0, m: 0, b: 0 };
            }
            byDisc[s.discipline].n++;
            byDisc[s.discipline].t += s.score;
            byDisc[s.discipline].m += s.max;
            byDisc[s.discipline].b = Math.max(byDisc[s.discipline].b, s.score);
        });
        
        return {
            totalSeries: series.length,
            globalAvg: max ? Math.round((total/max)*100) : 0,
            bestScore: best,
            byDiscipline: Object.entries(byDisc).reduce((acc, [d, v]) => {
                acc[d] = {
                    count: v.n,
                    avg: Math.round((v.t/v.m)*100),
                    best: v.b
                };
                return acc;
            }, {})
        };
    }

    async function getProgressionData(limit = 20) {
        const series = await getAllSeries();
        return series
            .sort((a,b) => b.id - a.id)
            .slice(0, limit)
            .reverse()
            .map(s => ({
                date: s.date,
                score: s.score,
                max: s.max,
                pct: Math.round((s.score/s.max)*100),
                disc: s.discipline
            }));
    }

    async function getScoreDistribution() {
        const series = await getAllSeries();
        const dist = {};
        series.forEach(s => {
            const k = `${s.score}/${s.max}`;
            dist[k] = (dist[k]||0) + 1;
        });
        return dist;
    }

    // ========================================
    // CLEAR ALL
    // ========================================
    async function clearAll() {
        const storeNames = Array.from(db.objectStoreNames);
        const tx = db.transaction(storeNames, 'readwrite');
        storeNames.forEach(name => {
            tx.objectStore(name).clear();
        });
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ========================================
    // EXPOSITION GLOBALE (window.Storage)
    // ========================================
    window.Storage = {
        init,
        // Séries
        getAllSeries, getSerie, getSeriesByDiscipline, getSeriesByCompetition,
        addSerie, deleteSerie,
        // Stands
        getAllStands, saveStand, deleteStand,
        // Fusils
        getAllFusils, saveFusil, deleteFusil,
        // Compétitions
        getAllCompetitions, getCompetitionsByDiscipline,
        saveCompetition, deleteCompetition,
        getCompetitionActive, saveCompetitionActive, archiveCompetition,
        // Cartouches
        getAllCartouches, getCartouchesNames, addCartouche, deleteCartouche,
        // Chokes
        getAllChokes, getChokesCombos, addChokeCombo, deleteChoke,
        // Tenues
        getTenues, saveTenues,
        // Settings
        getSettings, saveSettings,
        // Params (localStorage simple)
        saveParam, getParam,
        // Backup complet
        exportAllData, importAllData,
        // Anciens noms pour compatibilité
        exportData: exportAllData,
        importData: importAllData,
        // Clear
        clearAll,
        // Stats
        getStatsSummary, getProgressionData, getScoreDistribution
    };

})();
