// js/params.js - Version IndexedDB complète
// ✅ PLUS aucune donnée critique en localStorage

// ========================================
// INITIALISATION
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    await Storage.init(); // ✅ Attend que IndexedDB soit prêt
    await loadSettings();
    
    // ✅ Expose les fonctions globalement pour les boutons HTML
    window.exportData = exportData;
    window.importData = importData;
    window.handleFileImport = handleFileImport;
    window.clearAllData = clearAllData;
    window.toggleDarkMode = toggleDarkMode;
    window.toggleHighVis = toggleHighVis;
    window.setAccent = setAccent;
    window.cycleTheme = cycleTheme;
    window.updateThemeIcon = updateThemeIcon;
});

// ========================================
// PARAMÈTRES UI (Dark Mode, Accent, etc.)
// ✅ Maintenant dans IndexedDB via Storage
// ========================================
async function loadSettings() {
    const settings = await Storage.getSettings();
    
    if (settings.darkMode) {
        document.documentElement.classList.add('dark-mode');
        const toggle = document.getElementById('toggle-dark-mode');
        if (toggle) toggle.checked = true;
    }
    if (settings.highVis) {
        document.documentElement.classList.add('high-vis');
        const toggle = document.getElementById('toggle-high-vis');
        if (toggle) toggle.checked = true;
    }
    if (settings.accentColor && settings.accentColor !== '#f39c12') {
        document.documentElement.style.setProperty('--accent', settings.accentColor);
        updateColorDots(settings.accentColor);
    }
}

async function toggleDarkMode(enabled) {
    const root = document.documentElement;
    const highVisToggle = document.getElementById('toggle-high-vis');
    if (enabled) {
        root.classList.add('dark-mode');
        root.classList.remove('high-vis');
        if (highVisToggle) highVisToggle.checked = false;
    } else {
        root.classList.remove('dark-mode');
    }
    await saveSettings();
}

async function toggleHighVis(enabled) {
    const root = document.documentElement;
    const darkToggle = document.getElementById('toggle-dark-mode');
    if (enabled) {
        root.classList.add('high-vis');
        root.classList.remove('dark-mode');
        if (darkToggle) darkToggle.checked = false;
    } else {
        root.classList.remove('high-vis');
    }
    await saveSettings();
}

async function setAccent(color, dotEl) {
    document.documentElement.style.setProperty('--accent', color);
    updateColorDots(color);
    await saveSettings();
}

function updateColorDots(activeColor) {
    document.querySelectorAll('.color-dot').forEach(dot => {
        const dotColor = dot.style.background;
        dot.classList.toggle('active', dotColor === activeColor || rgbToHex(dotColor) === activeColor);
    });
}

async function saveSettings() {
    const settings = {
        darkMode: document.documentElement.classList.contains('dark-mode'),
        highVis: document.documentElement.classList.contains('high-vis'),
        accentColor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    };
    await Storage.saveSettings(settings);
}

// ========================================
// EXPORT DONNÉES — TOUT depuis IndexedDB
// ========================================
async function exportData() {
    console.log('🚀 Export démarré');
    try {
        await Storage.exportAllData();
        console.log('✅ Export terminé');
        if (typeof showToast === 'function') {
            showToast('Export réussi !');
        }
    } catch (err) {
        console.error('❌ Erreur export:', err);
        if (typeof showToast === 'function') {
            showToast('Erreur export');
        }
    }
}

// ========================================
// IMPORT DONNÉES
// ========================================
function importData() {
    const input = document.getElementById('import-file');
    if (!input) return;
    input.click();
}

async function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Modale personnalisée
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
            modal.innerHTML = `
                <div style="background:var(--bg);padding:30px;border-radius:16px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.3);text-align:center;">
                    <div style="font-size:3rem;margin-bottom:15px;">📥</div>
                    <h3 style="color:var(--text-primary);margin-bottom:12px;font-size:1.3rem;">Importer les données</h3>
                    <p style="color:var(--text-muted);margin-bottom:20px;line-height:1.5;">
                        Données du <strong>${data.exportDate?.split('T')[0] || data.date?.split('T')[0] || 'date inconnue'}</strong><br><br>
                        Cela ajoutera les données importées à vos données actuelles.
                    </p>
                    <div style="display:flex;gap:12px;justify-content:center;">
                        <button id="import-cancel-btn" style="flex:1;padding:12px 20px;background:var(--bg);color:var(--text-primary);border:none;border-radius:10px;font-weight:600;cursor:pointer;box-shadow:var(--neu-out-sm);">Annuler</button>
                        <button id="import-confirm-btn" style="flex:1;padding:12px 20px;background:var(--accent);color:white;border:none;border-radius:10px;font-weight:600;cursor:pointer;box-shadow:var(--neu-out-sm);">Importer</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            
            document.getElementById('import-cancel-btn').onclick = () => modal.remove();
            document.getElementById('import-confirm-btn').onclick = async () => {
                modal.remove();
                await processImport(data);
            };
            
        } catch (err) {
            console.error('❌ Erreur import:', err);
            if (typeof showToast === 'function') showToast('Fichier invalide');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function processImport(data) {
    try {
        console.log('🔄 Début de l\'import...');
        
        await Storage.importAllData(new Blob([JSON.stringify(data)], { type: 'application/json' }));
        
        // Alternative : import direct via les APIs Storage
        let importedSeries = 0, importedFusils = 0, importedStands = 0;
        
        // Séries
        if (Array.isArray(data.series) && data.series.length > 0) {
            for (const serie of data.series) {
                try { await Storage.addSerie(serie); importedSeries++; } catch (e) { console.warn('Serie skip:', e); }
            }
        }
        // Fusils
        const fusilsData = data.fusils || data.armurerie || [];
        if (fusilsData.length) {
            for (const f of fusilsData) {
                try { await Storage.saveFusil(f); importedFusils++; } catch (e) { console.warn('Fusil skip:', e); }
            }
        }
        // Stands
        if (data.stands?.length) {
            for (const st of data.stands) {
                try { await Storage.saveStand(st); importedStands++; } catch (e) { console.warn('Stand skip:', e); }
            }
        }
        // Compétitions
        if (data.competitions?.length) {
            for (const c of data.competitions) {
                try { await Storage.saveCompetition(c); } catch (e) { console.warn('Comp skip:', e); }
            }
        }
        // Cartouches (strings)
        if (data.cartouches?.length) {
            for (const name of data.cartouches) {
                if (typeof name === 'string') await Storage.addCartouche(name);
            }
        }
        // Chokes
        if (data.chokes?.length) {
            for (const combo of data.chokes) {
                if (typeof combo === 'string') await Storage.addChokeCombo(combo);
            }
        }
        // Tenues
        if (data.tenues) await Storage.saveTenues(data.tenues);
        // Settings
        if (data.settings?.key) await Storage.saveSettings(data.settings);
        
        // Compatibilité ancien format : compétitions dans l'ancien format localStorage
        if (data.competitions_archive && !data.competitions) {
            for (const c of data.competitions_archive) {
                c.status = 'archived';
                try { await Storage.saveCompetition(c); } catch (e) {}
            }
        }
        
        console.log(`✅ Import terminé: ${importedSeries} séries, ${importedFusils} fusils, ${importedStands} stands`);
        
        if (typeof showToast === 'function') {
            showToast(`Import réussi (${importedSeries} séries)`);
        }
        
        setTimeout(() => location.reload(), 1000);
        
    } catch (err) {
        console.error('❌ Erreur processImport:', err);
        if (typeof showToast === 'function') showToast('Erreur import');
    }
}

// ========================================
// SUPPRESSION TOTALE
// ========================================
async function clearAllData() {
    if (typeof showConfirmModal === 'function') {
        showConfirmModal('⚠️ ATTENTION !\n\nTu vas supprimer :\n- Toutes tes séries\n- Ton ratelier\n- Tes stands\n- Tes compétitions\n- Tes cartouches & chokes\n- Tes tenues\n- Tes paramètres\n\nCette action est IRRÉVERSIBLE. Continuer ?', async () => {
            await executeClearAll();
        });
    } else {
        if (confirm('⚠️ Supprimer toutes les données ?')) {
            await executeClearAll();
        }
    }
}

async function executeClearAll() {
    try {
        console.log('🗑️ Suppression de toutes les données...');
        await Storage.clearAll();
        console.log('✅ Tout supprimé');
        if (typeof showToast === 'function') {
            showToast('Données effacées');
        }
        setTimeout(() => location.reload(), 1500);
    } catch (err) {
        console.error('❌ Erreur clearAll:', err);
        if (typeof showToast === 'function') showToast('Erreur suppression');
    }
}

// ========================================
// UTILITAIRES
// ========================================
function rgbToHex(rgb) {
    if (!rgb || rgb.startsWith('#')) return rgb;
    const values = rgb.match(/\d+/g);
    if (!values) return rgb;
    return '#' + values.map(x => {
        const hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:12px 24px;border-radius:10px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:toastFade 0.3s ease;';
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ========================================
// CYCLE THÈME RAPIDE (Clair → Sombre → Plein Soleil)
// ========================================
async function cycleTheme() {
    var isDark = document.documentElement.classList.contains('dark-mode');
    var isHighVis = document.documentElement.classList.contains('high-vis');

    if (!isDark && !isHighVis) {
        // Clair → Sombre
        await toggleDarkMode(true);
    } else if (isDark && !isHighVis) {
        // Sombre → Plein Soleil
        await toggleDarkMode(false);
        await toggleHighVis(true);
    } else {
        // Plein Soleil → Clair
        await toggleHighVis(false);
    }
    updateThemeIcon();
    updateThemeColorMeta();
}

function updateThemeIcon() {
    var isDark = document.documentElement.classList.contains('dark-mode');
    var isHighVis = document.documentElement.classList.contains('high-vis');
    var iconSun = document.getElementById('icon-theme-sun');
    var iconMoon = document.getElementById('icon-theme-moon');
    var iconSunBold = document.getElementById('icon-theme-sun-bold');
    if (!iconSun) return;
    iconSun.style.display = (!isDark && !isHighVis) ? 'block' : 'none';
    iconMoon.style.display = (isDark && !isHighVis) ? 'block' : 'none';
    iconSunBold.style.display = isHighVis ? 'block' : 'none';
}

function updateThemeColorMeta() {
    var isDark = document.documentElement.classList.contains('dark-mode');
    var isHighVis = document.documentElement.classList.contains('high-vis');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    if (isHighVis) meta.setAttribute('content', '#1a1a2e');
    else if (isDark) meta.setAttribute('content', '#1a1a2e');
    else meta.setAttribute('content', '#3a7bd5');
}
