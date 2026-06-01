// js/meteo.js
const METEO_CACHE_KEY = 'bt_meteo_cache';
let currentMeteoAPI = null;

const MeteoManager = {
    async init() {
        console.log('🌤️ Initialisation météo...');
        await this.chargerMeteoDynamique();
    },

    async chargerMeteoDynamique() {
        const tempEl = document.getElementById('meteo-temp');
        const descEl = document.getElementById('meteo-desc');
        const windSpeedEl = document.getElementById('meteo-wind-speed');
        const windDirEl = document.getElementById('meteo-wind-dir');
        const manualGroup = document.getElementById('meteo-manual-group');
        
        console.log('🔍 Éléments DOM:', { tempEl, descEl, windSpeedEl });

        if (!tempEl || !descEl) {
            console.error('❌ Éléments météo introuvables dans le DOM');
            return;
        }

        // Cache 10 min
        const cached = this.getCachedMeteo();
        if (cached && (Date.now() - cached.timestamp) < 600000) {
            console.log('✅ Utilisation du cache météo');
            this.afficherMeteo(cached.data);
            return;
        }

        tempEl.textContent = '📍...';
        descEl.textContent = 'Localisation...';

        try {
            console.log('🌍 Demande de géolocalisation...');
            const position = await this.obtenirPosition();
            console.log('📍 Position:', position);
            
            console.log('🌐 Appel API Open-Météo...');
            const meteo = await this.appelerOpenMeteo(position.lat, position.lon);
            console.log('📊 Données reçues:', meteo);
            
            this.saveCache(meteo);
            this.afficherMeteo(meteo);
            this.autoSelectionnerVent(meteo);
            
            if (manualGroup) manualGroup.style.display = 'none';
            console.log('✅ Météo chargée avec succès');
            
        } catch (error) {
            console.error('❌ Erreur météo:', error);
            tempEl.textContent = '⚠️';
            descEl.textContent = 'Météo indisponible';
            if (windSpeedEl) windSpeedEl.textContent = '-- km/h';
            if (windDirEl) windDirEl.textContent = '💨 --';
            this.afficherModeManuel();
        }
    },

    obtenirPosition() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                console.warn('⚠️ Géolocalisation non supportée');
                resolve({ lat: 48.8566, lon: 2.3522 });
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    console.log('✅ Géoloc réussie');
                    resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                },
                (err) => {
                    console.warn('⚠️ Géoloc refusée ou erreur:', err.message);
                    resolve({ lat: 48.8566, lon: 2.3522 });
                },
                { timeout: 8000, enableHighAccuracy: false }
            );
        });
    },

    async appelerOpenMeteo(lat, lon) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day&timezone=auto`;
        console.log('🔗 URL API:', url);
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erreur API: ${response.status}`);
        
        const data = await response.json();
        console.log('📦 Données brutes:', data);
        
        return {
            temp: Math.round(data.current.temperature_2m),
            code: data.current.weather_code,
            windSpeed: Math.round(data.current.wind_speed_10m),
            windDir: data.current.wind_direction_10m,
            isDay: data.current.is_day === 1
        };
    },

    afficherMeteo(meteo) {
        const tempEl = document.getElementById('meteo-temp');
        const descEl = document.getElementById('meteo-desc');
        const iconEl = document.getElementById('meteo-icon');
        const windSpeedEl = document.getElementById('meteo-wind-speed');
        const windDirEl = document.getElementById('meteo-wind-dir');
        
        if (!tempEl || !descEl) return;

        const icon = this.obtenirIconeMeteo(meteo.code, meteo.isDay);
        const desc = this.obtenirDescriptionMeteo(meteo.code);
        const ventDir = this.obtenirDirectionVent(meteo.windDir);

        tempEl.textContent = `${meteo.temp}°C`;
        descEl.textContent = desc;
        if (iconEl) iconEl.textContent = icon;
        if (windSpeedEl) windSpeedEl.textContent = `${meteo.windSpeed} km/h`;
        if (windDirEl) windDirEl.textContent = ventDir;

        currentMeteoAPI = { 
            code: meteo.code, 
            temp: meteo.temp, 
            windSpeed: meteo.windSpeed, 
            windDir: meteo.windDir, 
            isDay: meteo.isDay, 
            desc: desc, 
            ventDir: ventDir 
        };
        
        this.autoSelectionnerVent(meteo);
    },

    afficherModeManuel() {
        const manualGroup = document.getElementById('meteo-manual-group');
        if (manualGroup) {
            manualGroup.style.display = 'block';
            console.log(' Mode manuel activé');
        }
    },

    autoSelectionnerVent(meteo) {
        const wind = meteo.windSpeed;
        let ventValue = wind >= 30 ? 'Fort' : wind >= 15 ? 'Modéré' : 'Faible';
        console.log('💨 Vent auto:', wind, 'km/h →', ventValue);
        
        document.querySelectorAll('.btn-vent').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.val === ventValue) {
                btn.classList.add('active');
                console.log('✅ Bouton', ventValue, 'activé');
            }
        });
    },

    getCachedMeteo() { 
        try { 
            const c = localStorage.getItem(METEO_CACHE_KEY); 
            return c ? JSON.parse(c) : null; 
        } catch { 
            return null; 
        } 
    },
    
    saveCache(meteo) { 
        try { 
            localStorage.setItem(METEO_CACHE_KEY, JSON.stringify({ 
                timestamp: Date.now(), 
                data: meteo 
            })); 
            console.log('💾 Météo sauvegardée en cache');
        } catch (e) {
            console.warn('⚠️ Impossible de cacher la météo:', e);
        } 
    },

    obtenirIconeMeteo(code, isDay) {
        if (code === 0) return isDay ? '☀️' : '🌙';
        if (code <= 2) return isDay ? '⛅' : '☁️';
        if (code === 3) return '☁️';
        if (code <= 48) return '🌫️';
        if (code <= 67) return '🌧️';
        if (code <= 77) return '🌨️';
        if (code <= 82) return '🌧️';
        if (code <= 86) return '🌨️';
        if (code <= 99) return '⛈️';
        return isDay ? '🌤️' : '🌙';
    },

    obtenirDescriptionMeteo(code) {
        if (code === 0) return 'Ciel clair';
        if (code === 1) return 'Principalement clair';
        if (code === 2) return 'Partiellement nuageux';
        if (code === 3) return 'Couvert';
        if (code <= 48) return 'Brouillard';
        if (code <= 67) return 'Pluie';
        if (code <= 77) return 'Neige';
        if (code <= 82) return 'Averses';
        if (code <= 86) return 'Neige';
        if (code <= 99) return 'Orage';
        return 'Variable';
    },

    obtenirDirectionVent(deg) {
        const dirs = ['N','NE','E','SE','S','SO','O','NO'];
        return dirs[Math.round(deg/45)%8];
    },

    rafraichir() { 
        console.log('🔄 Rafraîchissement manuel');
        localStorage.removeItem(METEO_CACHE_KEY); 
        this.chargerMeteoDynamique(); 
    },

    getMeteoData() {
        const manualInput = document.getElementById('input-meteo-manual');
        if (manualInput?.value.trim()) {
            return { 
                meteo: manualInput.value.trim(), 
                vent: document.querySelector('.btn-vent.active')?.dataset.val || 'Faible' 
            };
        }
        if (currentMeteoAPI) {
            return { 
                meteo: currentMeteoAPI.desc, 
                vent: document.querySelector('.btn-vent.active')?.dataset.val || 'Faible' 
            };
        }
        return { 
            meteo: 'Soleil', 
            vent: document.querySelector('.btn-vent.active')?.dataset.val || 'Faible' 
        };
    }
};

// Fonction globale
window.refreshMeteo = () => {
    if (typeof MeteoManager !== 'undefined') {
        MeteoManager.rafraichir();
    }
};

// Fonction globale pour les boutons vent
window.selectVent = function(btn) {
    document.querySelectorAll('.btn-vent').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    console.log('🎯 Vent sélectionné:', btn.dataset.val);
};