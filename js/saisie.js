// js/saisie.js - Version complète avec modale équipement + compétition

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. INITIALISATION BASE DE DONNÉES
    if (typeof Storage !== 'undefined') {
        await Storage.init();
    }
    
    const SCORES_MAX = {
        'FU': 25,
        'DTL': 75,
        'TRAP1': 75,
        'PCH': 25,
        'CS': 25,
        'Fosse Olympique': 25,
        'Skeet Olympique': 25
    };

    let currentDisc = 'FU';
    let currentFormat = 'entrainement'; // 'entrainement', '100', '200'

    // ========================================
    // HELPER DATE ISO (YYYY-MM-DD)
    // ========================================
    function getISODate() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // ========================================
    // GESTION COMPÉTITION
    // ========================================
    const OLYMPIC_DISCIPLINES = ['Fosse Olympique', 'Skeet Olympique'];
    const SERIES_PAR_COMP = { '100': 4, '200': 8 };

    // ✅ TOUT via IndexedDB maintenant
    // Cache local pour la compétition active (évite les appels async partout)
    let _activeCompCache = null;

    async function getCompetitionActive() {
        try {
            _activeCompCache = await Storage.getCompetitionActive();
            return _activeCompCache;
        } catch { return _activeCompCache; }
    }

    async function saveCompetitionActive(comp) {
        if (comp) {
            comp.status = 'active';
            await Storage.saveCompetitionActive(comp);
            _activeCompCache = comp;
        } else {
            await Storage.saveCompetitionActive(null);
            _activeCompCache = null;
        }
    }

    async function getCompetitionsArchive() {
        try {
            const all = await Storage.getAllCompetitions();
            return all.filter(c => c.status === 'archived');
        } catch { return []; }
    }

    async function archiveCompetition(comp) {
        await Storage.archiveCompetition(comp);
    }

    async function updateCompetitionTile() {
        const tile = document.getElementById('competition-tile');
        const discMode = document.getElementById('comp-disc-mode');
        const compNameEl = document.getElementById('comp-name');
        const progression = document.getElementById('comp-progression');
        const scoreCumul = document.getElementById('comp-score-cumul');
        if (!tile) return;

        const comp = await getCompetitionActive();
        if (!comp) {
            tile.style.display = 'none';
            return;
        }

        tile.style.display = 'block';
        const totalRequis = SERIES_PAR_COMP[comp.mode] || 4;
        const nbSeries = comp.series ? comp.series.length : 0;
        const scoreTotal = comp.scoreCumul || 0;

        if (compNameEl) compNameEl.textContent = comp.name || '';
        if (discMode) discMode.textContent = `${comp.disc} - ${comp.mode} plateaux`;
        if (progression) progression.textContent = `Série ${nbSeries} / ${totalRequis} terminée${nbSeries > 1 ? 's' : ''}`;
        if (scoreCumul) scoreCumul.textContent = `Score cumulé : ${scoreTotal}`;
    }

    async function demarrerCompetition(mode) {
        // Créer la compétition avec nom temporaire — le nom sera saisi dans la modale équipement
        const comp = {
            id: Date.now(),
            mode: mode,
            disc: currentDisc,
            name: 'Compétition — ' + currentDisc,
            series: [],
            scoreCumul: 0,
            startDate: getISODate(),
            status: 'active'
        };
        await saveCompetitionActive(comp);
        await updateCompetitionTile();
        // Ouvrir la modale équipement au démarrage de la compétition
        openEquipModal();
        // Le nom sera validé à la fermeture de la modale
    }

    function annulerCompetition() {
        if (typeof showConfirmModal === 'function') {
            showConfirmModal('Annuler la compétition en cours ? Les séries déjà enregistrées resteront dans l\'historique.', async () => {
                await saveCompetitionActive(null);
                currentFormat = 'entrainement';
                updateFormatButtons();
                await updateCompetitionTile();
                updateCompNameFieldState();
                showToast('Compétition annulée.');
            });
        } else {
            // Fallback si showConfirmModal pas encore dispo
            (async () => {
                await saveCompetitionActive(null);
                currentFormat = 'entrainement';
                updateFormatButtons();
                await updateCompetitionTile();
                updateCompNameFieldState();
                showToast('Compétition annulée.');
            })();
        }
    }

    function updateFormatButtons() {
        document.querySelectorAll('#format-group .btn-format').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.format === currentFormat);
        });
    }

    // ========================================
    // ÉLÉMENTS DOM
    // ========================================
    const inputScore = document.getElementById('input-score');
    const scoreError = document.getElementById('score-error');
    const selectFusil = document.getElementById('select-fusil');
    const inputCartouche = document.getElementById('input-cartouche');
    const chokeContainer = document.getElementById('choke-saisie-container');
    const chokeFixesDisplay = document.getElementById('choke-fixes-display');
    const chokeAmoviblesSelects = document.getElementById('choke-amovibles-selects');
    const fixedChokeText = document.getElementById('fixed-choke-text');
    const selectChoke1 = document.getElementById('select-choke1');
    const selectChoke2 = document.getElementById('select-choke2');
    const chokeStatus = document.getElementById('choke-status');
    const inputLieu = document.getElementById('input-lieu');
    const selectTenue = document.getElementById('select-tenue');
    const inputNotes = document.getElementById('input-notes');
    const form = document.getElementById('form-saisie');
    const modalEquip = document.getElementById('modal-equip');

    // ========================================
    // BLOQUER "ENTRÉE" SUR LE CHAMP SCORE
    // ========================================
    if (inputScore) {
        inputScore.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();
            }
        });
    }

    // ========================================
    // GESTION DU BOUTON ENREGISTRER
    // ========================================
    const btnEnregistrer = document.getElementById('btn-enregistrer');
    if (btnEnregistrer && form) {
        btnEnregistrer.addEventListener('click', () => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
    }

    // ========================================
    // REMPLIR LE SELECT FUSILS
    // ========================================
    async function updateFusilSelect() {
        const select = document.getElementById('select-fusil');
        const customOptions = document.getElementById('custom-fusil-options');
        const customText = document.getElementById('custom-fusil-text');
        if (!select || !customOptions || !customText) return;

        try {
            const fusils = await Storage.getAllFusils();
            select.innerHTML = '<option value="">-- Aucun / Pas noté --</option>';
            customOptions.innerHTML = '';
            customText.textContent = '-- Aucun / Pas noté --';

            const defaultOpt = document.createElement('div');
            defaultOpt.className = 'custom-neu-option selected';
            defaultOpt.textContent = '-- Aucun / Pas noté --';
            defaultOpt.dataset.value = '';
            customOptions.appendChild(defaultOpt);

            if (fusils && fusils.length > 0) {
                fusils.forEach(fusil => {
                    const name = fusil.nom || fusil.modele || 'Fusil inconnu';
                    const option = document.createElement('option');
                    option.value = name;
                    option.dataset.chokeType = fusil.chokeType || 'fixes';
                    option.dataset.chokeCanon1 = fusil.chokeCanon1 || fusil.canon1 || '';
                    option.dataset.chokeCanon2 = fusil.chokeCanon2 || fusil.canon2 || '';
                    select.appendChild(option);

                    const customOpt = document.createElement('div');
                    customOpt.className = 'custom-neu-option';
                    customOpt.textContent = name;
                    customOpt.dataset.value = name;
                    customOpt.dataset.chokeType = option.dataset.chokeType;
                    customOpt.dataset.chokeCanon1 = option.dataset.chokeCanon1;
                    customOpt.dataset.chokeCanon2 = option.dataset.chokeCanon2;
                    customOptions.appendChild(customOpt);
                });
            }
        } catch (e) {
            console.error('Erreur updateFusilSelect:', e);
        }
    }

    // ========================================
    // REMPLIR LE SELECT CARTOUCHES
    // ========================================
    async function updateCartoucheSelect() {
        const select = document.getElementById('input-cartouche');
        const customOptions = document.getElementById('custom-cartouche-options');
        const customText = document.getElementById('custom-cartouche-text');
        if (!select || !customOptions || !customText) return;
        
        try {
            const history = await Storage.getCartouchesNames();
            const currentVal = select.value;
            select.innerHTML = '<option value="">-- Aucune / Pas noté --</option>';
            customOptions.innerHTML = '';
            customText.textContent = currentVal || '-- Aucune / Pas noté --';

            const defaultOpt = document.createElement('div');
            defaultOpt.className = 'custom-neu-option' + (!currentVal ? ' selected' : '');
            defaultOpt.textContent = '-- Aucune / Pas noté --';
            defaultOpt.dataset.value = '';
            customOptions.appendChild(defaultOpt);
            
            [...new Set(history)].reverse().forEach(cartouche => {
                const option = document.createElement('option');
                option.value = cartouche;
                option.textContent = cartouche;
                if (cartouche === currentVal) option.selected = true;
                select.appendChild(option);

                const customOpt = document.createElement('div');
                customOpt.className = 'custom-neu-option' + (cartouche === currentVal ? ' selected' : '');
                customOpt.textContent = cartouche;
                customOpt.dataset.value = cartouche;
                customOptions.appendChild(customOpt);
            });
        } catch (e) {
            console.error('Erreur updateCartoucheSelect:', e);
        }
    }

    // ========================================
    // REMPLIR LE SELECT STANDS
    // ========================================
    async function updateStandSelect() {
        const select = document.getElementById('input-lieu');
        const customOptions = document.getElementById('custom-stand-options');
        const customText = document.getElementById('custom-stand-text');
        if (!select || !customOptions || !customText) return;
        
        try {
            const stands = await Storage.getAllStands();
            const currentVal = select.value;
            select.innerHTML = '<option value="">-- Aucun / Pas noté --</option>';
            customOptions.innerHTML = '';
            customText.textContent = currentVal || '-- Aucun / Pas noté --';

            const defaultOpt = document.createElement('div');
            defaultOpt.className = 'custom-neu-option' + (!currentVal ? ' selected' : '');
            defaultOpt.textContent = '-- Aucun / Pas noté --';
            defaultOpt.dataset.value = '';
            customOptions.appendChild(defaultOpt);
            
            stands.sort((a, b) => String(a.nom).localeCompare(String(b.nom))).forEach(stand => {
                const option = document.createElement('option');
                option.value = stand.nom;
                option.textContent = stand.nom;
                if (stand.nom === currentVal) option.selected = true;
                select.appendChild(option);

                const customOpt = document.createElement('div');
                customOpt.className = 'custom-neu-option' + (stand.nom === currentVal ? ' selected' : '');
                customOpt.textContent = stand.nom;
                customOpt.dataset.value = stand.nom;
                customOptions.appendChild(customOpt);
            });
        } catch (e) {
            console.error('Erreur updateStandSelect:', e);
        }
    }

    // ========================================
    // REMPLIR LE SELECT TENUES
    // ========================================
    async function updateTenueSelect() {
        const customOptions = document.getElementById('custom-tenue-options');
        const customText = document.getElementById('custom-tenue-text');
        const select = document.getElementById('select-tenue');
        if (!customOptions || !customText || !select) return;

        try {
            const tenuesData = await Storage.getTenues();
            const tenues = { ete: tenuesData.ete || '', 'mi-saison': tenuesData['mi-saison'] || '', hiver: tenuesData.hiver || '' };
            select.innerHTML = '<option value="">-- Aucune / Pas noté --</option>';
            customOptions.innerHTML = '';

            const defaultOpt = document.createElement('div');
            defaultOpt.className = 'custom-neu-option selected';
            defaultOpt.textContent = '-- Aucune / Pas noté --';
            defaultOpt.dataset.value = '';
            customOptions.appendChild(defaultOpt);

            const categories = [
                { key: 'ete', label: '☀️ Été', values: tenues.ete },
                { key: 'mi-saison', label: '⛅ Mi-saison', values: tenues['mi-saison'] },
                { key: 'hiver', label: '❄️ Hiver', values: tenues.hiver }
            ];

            categories.forEach(cat => {
                if (cat.values && cat.values.trim()) {
                    // Séparateur de catégorie
                    const sep = document.createElement('div');
                    sep.className = 'custom-neu-option';
                    sep.style.cssText = 'font-weight:800; color:var(--accent); pointer-events:none; font-size:0.8rem;';
                    sep.textContent = cat.label;
                    customOptions.appendChild(sep);

                    const items = cat.values.split('\n').filter(v => v.trim());
                    items.forEach(val => {
                        const opt = document.createElement('option');
                        opt.value = `${cat.label} ${val.trim()}`;
                        opt.textContent = val.trim();
                        select.appendChild(opt);

                        const customOpt = document.createElement('div');
                        customOpt.className = 'custom-neu-option';
                        customOpt.textContent = val.trim();
                        customOpt.dataset.value = `${cat.label} ${val.trim()}`;
                        customOptions.appendChild(customOpt);
                    });
                }
            });

            customText.textContent = '-- Aucune / Pas noté --';
        } catch (e) {
            console.error('Erreur updateTenueSelect:', e);
        }
    }

    // ========================================
    // GESTION DES CLICS - Custom Selects
    // ========================================
    // Fusil
    const fusilTrigger = document.getElementById('custom-fusil-trigger');
    const fusilOptionsContainer = document.getElementById('custom-fusil-options');
    const fusilText = document.getElementById('custom-fusil-text');
    const realFusilSelect = document.getElementById('select-fusil');

    if (fusilTrigger && fusilOptionsContainer && fusilText && realFusilSelect) {
        fusilTrigger.addEventListener('click', () => fusilOptionsContainer.classList.toggle('open'));
        fusilOptionsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('custom-neu-option') && !e.target.style.pointerEvents) {
                fusilText.textContent = e.target.textContent;
                fusilOptionsContainer.querySelectorAll('.custom-neu-option').forEach(o => o.classList.remove('selected'));
                e.target.classList.add('selected');
                fusilOptionsContainer.classList.remove('open');
                realFusilSelect.value = e.target.dataset.value;
                const realSelectedOpt = realFusilSelect.options[realFusilSelect.selectedIndex];
                if (realSelectedOpt) {
                    realSelectedOpt.dataset.chokeType = e.target.dataset.chokeType;
                    realSelectedOpt.dataset.chokeCanon1 = e.target.dataset.chokeCanon1;
                    realSelectedOpt.dataset.chokeCanon2 = e.target.dataset.chokeCanon2;
                }
                realFusilSelect.dispatchEvent(new Event('change'));
            }
        });
    }

    // Cartouche
    const cartoucheTrigger = document.getElementById('custom-cartouche-trigger');
    const cartoucheOptionsContainer = document.getElementById('custom-cartouche-options');
    const cartoucheText = document.getElementById('custom-cartouche-text');
    const realCartoucheSelect = document.getElementById('input-cartouche');

    if (cartoucheTrigger && cartoucheOptionsContainer && cartoucheText && realCartoucheSelect) {
        cartoucheTrigger.addEventListener('click', () => cartoucheOptionsContainer.classList.toggle('open'));
        cartoucheOptionsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('custom-neu-option')) {
                cartoucheText.textContent = e.target.textContent;
                cartoucheOptionsContainer.querySelectorAll('.custom-neu-option').forEach(o => o.classList.remove('selected'));
                e.target.classList.add('selected');
                cartoucheOptionsContainer.classList.remove('open');
                realCartoucheSelect.value = e.target.dataset.value;
            }
        });
    }

    // Stand
    const standTrigger = document.getElementById('custom-stand-trigger');
    const standOptionsContainer = document.getElementById('custom-stand-options');
    const standText = document.getElementById('custom-stand-text');
    const realStandSelect = document.getElementById('input-lieu');

    if (standTrigger && standOptionsContainer && standText && realStandSelect) {
        standTrigger.addEventListener('click', () => standOptionsContainer.classList.toggle('open'));
        standOptionsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('custom-neu-option')) {
                standText.textContent = e.target.textContent;
                standOptionsContainer.querySelectorAll('.custom-neu-option').forEach(o => o.classList.remove('selected'));
                e.target.classList.add('selected');
                standOptionsContainer.classList.remove('open');
                realStandSelect.value = e.target.dataset.value;
            }
        });
    }

    // Choke 1
    const choke1Trigger = document.getElementById('custom-choke1-trigger');
    const choke1OptionsContainer = document.getElementById('custom-choke1-options');
    const choke1Text = document.getElementById('custom-choke1-text');
    const realChoke1Select = document.getElementById('select-choke1');

    if (choke1Trigger && choke1OptionsContainer && choke1Text && realChoke1Select) {
        choke1Trigger.addEventListener('click', () => choke1OptionsContainer.classList.toggle('open'));
        choke1OptionsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('custom-neu-option')) {
                choke1Text.textContent = e.target.textContent;
                choke1OptionsContainer.querySelectorAll('.custom-neu-option').forEach(o => o.classList.remove('selected'));
                e.target.classList.add('selected');
                choke1OptionsContainer.classList.remove('open');
                realChoke1Select.value = e.target.dataset.value;
            }
        });
    }

    // Choke 2
    const choke2Trigger = document.getElementById('custom-choke2-trigger');
    const choke2OptionsContainer = document.getElementById('custom-choke2-options');
    const choke2Text = document.getElementById('custom-choke2-text');
    const realChoke2Select = document.getElementById('select-choke2');

    if (choke2Trigger && choke2OptionsContainer && choke2Text && realChoke2Select) {
        choke2Trigger.addEventListener('click', () => choke2OptionsContainer.classList.toggle('open'));
        choke2OptionsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('custom-neu-option')) {
                choke2Text.textContent = e.target.textContent;
                choke2OptionsContainer.querySelectorAll('.custom-neu-option').forEach(o => o.classList.remove('selected'));
                e.target.classList.add('selected');
                choke2OptionsContainer.classList.remove('open');
                realChoke2Select.value = e.target.dataset.value;
            }
        });
    }

    // Tenue
    const tenueTrigger = document.getElementById('custom-tenue-trigger');
    const tenueOptionsContainer = document.getElementById('custom-tenue-options');
    const tenueText = document.getElementById('custom-tenue-text');
    const realTenueSelect = document.getElementById('select-tenue');

    if (tenueTrigger && tenueOptionsContainer && tenueText && realTenueSelect) {
        tenueTrigger.addEventListener('click', () => tenueOptionsContainer.classList.toggle('open'));
        tenueOptionsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('custom-neu-option') && !e.target.style.pointerEvents) {
                tenueText.textContent = e.target.textContent;
                tenueOptionsContainer.querySelectorAll('.custom-neu-option').forEach(o => o.classList.remove('selected'));
                e.target.classList.add('selected');
                tenueOptionsContainer.classList.remove('open');
                realTenueSelect.value = e.target.dataset.value;
            }
        });
    }

    // ========================================
    // FERMETURE GLOBALE (Clic en dehors)
    // ========================================
    document.addEventListener('click', (e) => {
        if (!document.getElementById('custom-fusil-select')?.contains(e.target)) fusilOptionsContainer?.classList.remove('open');
        if (!document.getElementById('custom-cartouche-select')?.contains(e.target)) cartoucheOptionsContainer?.classList.remove('open');
        if (!document.getElementById('custom-stand-select')?.contains(e.target)) standOptionsContainer?.classList.remove('open');
        if (!document.getElementById('custom-choke1-select')?.contains(e.target)) choke1OptionsContainer?.classList.remove('open');
        if (!document.getElementById('custom-choke2-select')?.contains(e.target)) choke2OptionsContainer?.classList.remove('open');
        if (!document.getElementById('custom-tenue-select')?.contains(e.target)) tenueOptionsContainer?.classList.remove('open');
    });

    // ========================================
    // CHOKES SELON FUSIL
    // ========================================
    if (selectFusil) {
        selectFusil.addEventListener('change', updateChokeField);
    }

    function updateChokeField() {
        const selectedOption = selectFusil.options[selectFusil.selectedIndex];
        const chokeType = selectedOption ? selectedOption.dataset.chokeType : 'fixes';
        
        if (!selectFusil.value) {
            chokeContainer.style.display = 'none';
            return;
        }
        
        chokeContainer.style.display = 'block';
        chokeFixesDisplay.style.display = 'none';
        chokeAmoviblesSelects.style.display = 'none';
        chokeStatus.textContent = '';
        
        if (chokeType === 'fixes') {
            chokeFixesDisplay.style.display = 'flex';
            fixedChokeText.textContent = `${selectedOption.dataset.chokeCanon1} - ${selectedOption.dataset.chokeCanon2}`;
        } else if (chokeType === 'amovibles') {
            chokeAmoviblesSelects.style.display = 'block';
            chokeStatus.textContent = '🔧 Choisissez vos chokes';
            chokeStatus.style.color = 'var(--accent)';
        }
    }

    // ========================================
    // MODALE ÉQUIPEMENT
    // ========================================
    function updateCompNameFieldState() {
        const container = document.getElementById('comp-name-container');
        const input = document.getElementById('input-comp-name');
        const label = document.getElementById('comp-name-label');
        const comp = _activeCompCache;
        if (!container || !input) return;

        // Le conteneur est TOUJOURS visible
        container.style.display = 'block';

        if (comp) {
            // Mode COMPÉTITION — champ obligatoire
            if (label) label.textContent = 'Nom de la compétition';
            input.placeholder = 'Obligatoire — nom de la compétition';
            input.classList.add('comp-mandatory');
            input.classList.remove('comp-optional');
            input.style.fontWeight = '700';
            input.style.opacity = '1';
            // Pré-remplir si le nom a déjà été personnalisé
            const currentName = comp.name || '';
            const nameWithoutDisc = currentName.replace(/ — .+$/, '');
            if (nameWithoutDisc && nameWithoutDisc !== 'Compétition' && !input.value) {
                input.value = nameWithoutDisc;
            }
        } else {
            // Mode ENTRAÎNEMENT — champ optionnel
            if (label) label.textContent = 'Nom de session';
            input.placeholder = 'Optionnel — nom de session';
            input.classList.remove('comp-mandatory');
            input.classList.add('comp-optional');
            input.style.fontWeight = '400';
            input.style.opacity = '0.7';
            input.value = '';
        }
        // Clear erreur
        const compNameError = document.getElementById('comp-name-error');
        if (compNameError) {
            compNameError.textContent = '';
            compNameError.classList.remove('show');
        }
    }

    function openEquipModal() {
        if (modalEquip) {
            updateCompNameFieldState();
            modalEquip.style.display = 'flex';
            // Si compétition active, focus sur le champ nom après animation
            const comp = _activeCompCache;
            if (comp) {
                const inputCompName = document.getElementById('input-comp-name');
                if (inputCompName) {
                    setTimeout(() => inputCompName.focus(), 350);
                }
            }
        }
    }

    function closeEquipModal() {
        if (modalEquip) modalEquip.style.display = 'none';
        equipValidatedForThisSerie = true;
        updateCompNameFieldState();
        updateEquipSummary();
        updateEquipStatusBadge();
    }

    // Flag pour vérifier si l'équipement a été validé pour cette série
    let equipValidatedForThisSerie = false;

    // Sauvegarde du nom de session/compétition avant que la modale ne l'efface
    let savedSessionOrCompName = null;

    // Badge de statut sur la tuile équipement
    function updateEquipStatusBadge() {
        const badge = document.getElementById('equip-status-badge');
        if (!badge) return;
        if (equipValidatedForThisSerie) {
            badge.style.display = 'none';
        } else {
            badge.style.display = 'inline-block';
        }
    }

    function updateEquipSummary() {
        const line1 = document.getElementById('equip-line-1');
        const line2 = document.getElementById('equip-line-2');
        if (!line1 || !line2) return;

        const fusil = selectFusil?.value || '';
        const cartouche = inputCartouche?.value || '';
        const lieu = inputLieu?.value || '';
        const tenue = selectTenue?.value || '';

        // Chokes
        let chokes = '';
        const selectedOption = selectFusil?.options[selectFusil?.selectedIndex];
        if (selectFusil?.value && selectedOption) {
            const chokeType = selectedOption.dataset.chokeType;
            if (chokeType === 'fixes') {
                chokes = `${selectedOption.dataset.chokeCanon1 || ''} - ${selectedOption.dataset.chokeCanon2 || ''}`;
            } else if (chokeType === 'amovibles' && selectChoke1?.value && selectChoke2?.value) {
                chokes = `${selectChoke1.value} - ${selectChoke2.value}`;
            }
        }

        // Ligne 1 : Fusil — Chokes
        const parts1 = [];
        if (fusil) parts1.push(fusil);
        if (chokes) parts1.push(chokes);
        line1.textContent = parts1.length > 0 ? parts1.join(' — ') : 'Fusil — Chokes';

        // Ligne 2 : Cartouche — Stand — Tenue
        const parts2 = [];
        if (cartouche) parts2.push(cartouche);
        if (lieu) parts2.push(lieu);
        if (tenue) parts2.push(tenue);
        line2.textContent = parts2.length > 0 ? parts2.join(' — ') : 'Cartouche — Stand — Tenue';
    }

    // Tuile équipement → ouvre la modale
    const equipTile = document.getElementById('equip-tile');
    if (equipTile) {
        equipTile.addEventListener('click', () => openEquipModal());
    }

    // Boutons modale équipement
    const btnValiderEquip = document.getElementById('btn-valider-equip');

    if (btnValiderEquip) {
        btnValiderEquip.addEventListener('click', async () => {
            const comp = _activeCompCache;
            const inputCompName = document.getElementById('input-comp-name');
            const compNameError = document.getElementById('comp-name-error');

            // Validation du nom de compétition si mode compétition
            if (comp && inputCompName && !inputCompName.value.trim()) {
                if (compNameError) {
                    compNameError.textContent = 'Le nom de la compétition est obligatoire';
                    compNameError.classList.add('show');
                }
                inputCompName.focus();
                return;
            }

            // Mettre à jour le nom de la compétition
            if (comp && inputCompName && inputCompName.value.trim()) {
                const oldName = comp.name;
                comp.name = inputCompName.value.trim() + ' — ' + comp.disc;
                await saveCompetitionActive(comp);
                await updateCompetitionTile();
                // Toast uniquement si c'est la première validation du nom
                if (oldName === 'Compétition — ' + comp.disc) {
                    showToast(comp.name + ' — ' + comp.mode + ' plateaux !');
                }
            }

            // Clear erreur
            if (compNameError) {
                compNameError.textContent = '';
                compNameError.classList.remove('show');
            }

            // ⚠️ Sauvegarder le nom AVANT closeEquipModal() qui efface le champ
            if (comp) {
                savedSessionOrCompName = comp.name; // Nom de compétition déjà mis à jour ci-dessus
            } else {
                savedSessionOrCompName = inputCompName?.value?.trim() || null; // Nom de session
            }

            // Sauvegarder la cartouche dans l'historique si nouvelle
            const cartVal = inputCartouche?.value?.trim();
            if (cartVal) {
                await Storage.addCartouche(cartVal);
                await updateCartoucheSelect();
            }
            closeEquipModal();
        });
    }

    // Le bouton Fermer a été supprimé — la modale est obligatoire
    // On ne ferme qu'avec le bouton Valider

    // Empêcher la fermeture par clic dehors — modale obligatoire
    // (plus de closeEquipModal sur clic overlay)

    // ========================================
    // DISCIPLINE
    // ========================================
    document.querySelectorAll('#disc-group .btn-choice').forEach(btn => {
        btn.addEventListener('click', () => {
            const comp = _activeCompCache;
            if (comp) {
                showToast(`Discipline verrouillée : ${comp.disc}`);
                return;
            }

            document.querySelectorAll('#disc-group .btn-choice').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDisc = btn.dataset.val;
            
            const maxVal = SCORES_MAX[currentDisc];
            inputScore.max = maxVal;
            inputScore.placeholder = `Entrez votre score (max ${maxVal})`;
            
            scoreError.textContent = '';
            inputScore.value = '';
        });
    });

    // ========================================
    // BOUTONS FORMAT (Entrainement / 100 Plx / 200 Plx)
    // ========================================
    document.querySelectorAll('#format-group .btn-format').forEach(btn => {
        btn.addEventListener('click', () => {
            const format = btn.dataset.format;
            const comp = _activeCompCache;

            if (comp) {
                showToast('Compétition en cours, annulez-la d\'abord.');
                return;
            }

            // Blocage 200 plateaux pour disciplines olympiques
            if (format === '200' && OLYMPIC_DISCIPLINES.includes(currentDisc)) {
                afficherErreurModal('Le règlement des compétitions Olympiques étant très complexe, cette évolution sera implémentée plus tard, désolé.');
                return;
            }

            currentFormat = format;
            updateFormatButtons();

            if (format === '100' || format === '200') {
                demarrerCompetition(format);
            }
        });
    });

    // Bouton annuler compétition
    const btnAnnulerComp = document.getElementById('btn-annuler-comp');
    if (btnAnnulerComp) {
        btnAnnulerComp.addEventListener('click', annulerCompetition);
    }

    // ========================================
    // BOUTONS VENT
    // ========================================
    function setupGroupBtns(groupId) {
        const btns = document.querySelectorAll(`#${groupId} .btn-sm`);
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }
    setupGroupBtns('vent-group');

    // ========================================
    // SOUMISSION DU FORMULAIRE
    // ========================================
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Vérifier si l'équipement a été validé pour cette série
            if (!equipValidatedForThisSerie) {
                openEquipModal();
                showToast('Veuillez d\'abord valider votre équipement');
                return;
            }
            
            const scoreVal = parseInt(inputScore.value);
            const comp = _activeCompCache;
            const discFinale = comp ? comp.disc : currentDisc;
            const maxFinale = SCORES_MAX[discFinale];
            
            if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > maxFinale) {
                afficherErreurModal(`Le score <strong>${scoreVal}</strong> est invalide pour la discipline <strong>${discFinale}</strong>.<br><br>Le score doit être compris entre <strong>0 et ${maxFinale}</strong>.`);
                inputScore.focus();
                inputScore.select();
                return;
            }

            const selectedOption = selectFusil.options[selectFusil.selectedIndex];
            const chokeType = selectedOption ? selectedOption.dataset.chokeType : 'fixes';
            
            scoreError.classList.remove('show');

            let chokesVal = '';
            if (selectFusil.value && chokeType === 'amovibles') {
                if (!selectChoke1.value || !selectChoke2.value) {
                    chokeStatus.textContent = '⚠️ Sélectionnez les deux chokes';
                    chokeStatus.style.color = 'var(--score-faible)';
                    openEquipModal();
                    return;
                }
                chokesVal = `${selectChoke1.value} - ${selectChoke2.value}`;
                await Storage.addChokeCombo(chokesVal);
            } else if (selectFusil.value && selectedOption) {
                chokesVal = `${selectedOption.dataset.chokeCanon1} - ${selectedOption.dataset.chokeCanon2}`;
            }

            const lieuVal = inputLieu.value.trim();
            const stands = await Storage.getAllStands();
            const matchStand = stands.find(s => s.nom.toLowerCase() === lieuVal.toLowerCase());

            const meteoData = typeof MeteoManager !== 'undefined' ? MeteoManager.getMeteoData() : { meteo: 'Soleil', vent: 'Calme' };

            const serieData = {
                date: getISODate(),
                discipline: discFinale,
                score: scoreVal,
                max: maxFinale,
                lieu: lieuVal,
                standId: matchStand ? matchStand.id : null,
                meteo: meteoData.meteo,
                vent: meteoData.vent,
                notes: inputNotes ? inputNotes.value : '',
                fusil: selectFusil.value,
                cartouche: inputCartouche.value.trim(),
                chokes: chokesVal,
                chokeType: chokeType,
                tenue: selectTenue ? selectTenue.value : '',
                competitionId: comp ? comp.id : null,
                competitionName: comp ? savedSessionOrCompName : null,
                sessionName: (!comp && savedSessionOrCompName) || null
            };

            if (serieData.cartouche) {
                await Storage.addCartouche(serieData.cartouche);
            }

            try {
                const serieId = await Storage.addSerie(serieData);

                // ========================================
                // GESTION COMPÉTITION
                // ========================================
                let msgToast = "Série enregistrée !";

                if (comp) {
                    comp.series.push(serieId);
                    comp.scoreCumul = (comp.scoreCumul || 0) + scoreVal;
                    const totalRequis = SERIES_PAR_COMP[comp.mode] || 4;

                    if (comp.series.length >= totalRequis) {
                        msgToast = `${comp.name || 'Compétition'} terminée ! Score total : ${comp.scoreCumul}`;
                        comp.dateFin = getISODate();
                        comp.scoreMaxCumul = totalRequis * SCORES_MAX[comp.disc];
                        await archiveCompetition(comp);
                        await saveCompetitionActive(null);
                        currentFormat = 'entrainement';
                        updateFormatButtons();
                        // Reset équipement à zéro après fin de compétition
                        resetEquipFields();
                    } else {
                        msgToast = `Série compétition ajoutée (${comp.series.length} / ${totalRequis})`;
                        await saveCompetitionActive(comp);
                    }
                    await updateCompetitionTile();
                }

                showToast(msgToast);
                
                // Reset score only, keep equipment for next series
                inputScore.value = '';
                scoreError.textContent = '';
                if (inputNotes) inputNotes.value = '';
                // Réinitialiser le flag équipement pour la prochaine série
                equipValidatedForThisSerie = false;
                savedSessionOrCompName = null; // Reset du nom sauvegardé
                updateEquipStatusBadge();
                // Réinitialiser le nom de session en mode entraînement
                const inputCompName = document.getElementById('input-comp-name');
                if (!comp && inputCompName) inputCompName.value = '';

                // Si pas de compétition ou compétition terminée → reset discipline
                if (!comp || comp.series.length >= (SERIES_PAR_COMP[comp.mode] || 4)) {
                    document.querySelectorAll('#disc-group .btn-choice').forEach(b => b.classList.remove('active'));
                    document.querySelector('#disc-group .btn-choice').classList.add('active');
                    currentDisc = 'FU';
                    inputScore.max = 25;
                    inputScore.placeholder = 'Entrez votre score (max 25)';
                    // Si compétition terminée, reset équipement
                    if (comp && comp.series.length >= (SERIES_PAR_COMP[comp.mode] || 4)) {
                        resetEquipFields();
                    }
                } else {
                    currentDisc = comp.disc;
                    const maxVal = SCORES_MAX[currentDisc];
                    inputScore.max = maxVal;
                    inputScore.placeholder = `Entrez votre score (max ${maxVal})`;
                }
                
                updateEquipSummary();
                
                setTimeout(() => {
                    if (document.getElementById('page-historique')?.classList.contains('active')) {
                        renderHistory();
                    }
                }, 1500);
            } catch (error) {
                console.error("Erreur sauvegarde:", error);
                showToast("Erreur sauvegarde");
            }
        });
    }

    // ========================================
    // TOAST NOTIFICATION
    // ========================================
    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ========================================
    // GESTION MODALE ERREUR
    // ========================================
    const modalErreur = document.getElementById('modal-erreur-saisie');
    const messageErreur = document.getElementById('erreur-saisie-message');

    function afficherErreurModal(message) {
        if (messageErreur) messageErreur.innerHTML = message;
        if (modalErreur) modalErreur.style.display = 'flex';
    }

    const btnFermerErreur = modalErreur ? modalErreur.querySelector('.btn-main') : null;
    if (btnFermerErreur) {
        btnFermerErreur.addEventListener('click', () => {
            if (modalErreur) {
                modalErreur.style.display = 'none';
                if (inputScore) inputScore.focus();
            }
        });
    }

    if (modalErreur) {
        modalErreur.addEventListener('click', (e) => {
            if (e.target === modalErreur) {
                modalErreur.style.display = 'none';
                if (inputScore) inputScore.focus();
            }
        });
    }

    // ========================================
    // GESTION MODAL AJOUT RAPIDE STAND
    // ========================================
    function openQuickStandModal() {
        const modal = document.getElementById('modal-quick-stand');
        const inputName = document.getElementById('quick-stand-name');
        if (inputName) inputName.value = '';
        
        const btnGps = document.querySelector('button[onclick="getQuickPosition()"]');
        if (btnGps) {
            btnGps.innerHTML = `<svg class="icon-sm" viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg> Position GPS actuelle`;
            btnGps.disabled = false;
        }
        if (modal) modal.style.display = 'flex';
    }

    function closeQuickStandModal() {
        const modal = document.getElementById('modal-quick-stand');
        if (modal) modal.style.display = 'none';
    }

    function getQuickPosition() {
        const btnGps = document.querySelector('button[onclick="getQuickPosition()"]');
        if (!navigator.geolocation) { showToast("Géolocalisation non supportée"); return; }

        if (btnGps) {
            btnGps.disabled = true;
            btnGps.innerHTML = `<svg class="icon-sm" style="animation:spin 1s linear infinite" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="15 35"></circle></svg> Recherche...`;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const inputName = document.getElementById('quick-stand-name');
                inputName.dataset.lat = pos.coords.latitude;
                inputName.dataset.lon = pos.coords.longitude;
                if (btnGps) {
                    btnGps.innerHTML = `<svg class="icon-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg> Position capturée !`;
                    btnGps.style.color = 'var(--accent)';
                }
            },
            (err) => {
                showToast("Impossible de localiser votre position.");
                if (btnGps) {
                    btnGps.innerHTML = `<svg class="icon-sm" viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg> Position GPS actuelle`;
                    btnGps.disabled = false;
                }
            }
        );
    }

    async function saveQuickStand() {
        const inputName = document.getElementById('quick-stand-name');
        const nom = inputName.value.trim();
        if (!nom) { showToast("Merci d'entrer au moins le nom du stand."); return; }

        const newStand = {
            id: Date.now(),
            nom: nom,
            adresse: "Adresse à compléter",
            tel: "",
            notes: "",
            lat: inputName.dataset.lat || null,
            lon: inputName.dataset.lon || null
        };

        try {
            await Storage.saveStand(newStand);
            await updateStandSelect();
            closeQuickStandModal();
            showToast("Stand ajouté !");
        } catch (e) {
            showToast("Erreur lors de l'enregistrement");
        }
    }

    // ========================================
    // EXPOSITION GLOBALE
    // ========================================
    window.openQuickStandModal = openQuickStandModal;
    window.closeQuickStandModal = closeQuickStandModal;
    window.getQuickPosition = getQuickPosition;
    window.saveQuickStand = saveQuickStand;
    window.updateFusilSelect = updateFusilSelect;
    window.updateCartoucheSelect = updateCartoucheSelect;
    window.updateTenueSelect = updateTenueSelect;
    window.updateEquipSummary = updateEquipSummary;
    window.showToast = showToast;
    window.updateCompNameFieldState = updateCompNameFieldState;

    // ========================================
    // RESET ÉQUIPEMENT À ZÉRO
    // ========================================
    function resetEquipFields() {
        // Reset fusil
        if (selectFusil) selectFusil.value = '';
        if (fusilText) fusilText.textContent = '-- Aucun / Pas noté --';
        if (fusilOptionsContainer) fusilOptionsContainer.querySelectorAll('.custom-neu-option').forEach(o => o.classList.remove('selected'));
        const fusilDefaultOpt = fusilOptionsContainer?.querySelector('.custom-neu-option[data-value=""]');
        if (fusilDefaultOpt) fusilDefaultOpt.classList.add('selected');
        chokeContainer.style.display = 'none';

        // Reset chokes amovibles
        if (selectChoke1) selectChoke1.value = '';
        if (selectChoke2) selectChoke2.value = '';
        if (choke1Text) choke1Text.textContent = '1er Canon';
        if (choke2Text) choke2Text.textContent = '2ème Canon';

        // Reset cartouche
        if (inputCartouche) inputCartouche.value = '';
        if (cartoucheText) cartoucheText.textContent = '-- Aucune / Pas noté --';
        if (cartoucheOptionsContainer) cartoucheOptionsContainer.querySelectorAll('.custom-neu-option').forEach(o => o.classList.remove('selected'));
        const cartDefaultOpt = cartoucheOptionsContainer?.querySelector('.custom-neu-option[data-value=""]');
        if (cartDefaultOpt) cartDefaultOpt.classList.add('selected');

        // Reset stand
        if (inputLieu) inputLieu.value = '';
        if (standText) standText.textContent = '-- Aucun / Pas noté --';
        if (standOptionsContainer) standOptionsContainer.querySelectorAll('.custom-neu-option').forEach(o => o.classList.remove('selected'));
        const standDefaultOpt = standOptionsContainer?.querySelector('.custom-neu-option[data-value=""]');
        if (standDefaultOpt) standDefaultOpt.classList.add('selected');

        // Reset tenue
        if (selectTenue) selectTenue.value = '';
        if (tenueText) tenueText.textContent = '-- Aucune / Pas noté --';
        if (tenueOptionsContainer) tenueOptionsContainer.querySelectorAll('.custom-neu-option').forEach(o => o.classList.remove('selected'));
        const tenueDefaultOpt = tenueOptionsContainer?.querySelector('.custom-neu-option[data-value=""]');
        if (tenueDefaultOpt) tenueDefaultOpt.classList.add('selected');

        // Mettre à jour le résumé visuel
        updateEquipSummary();
        // Mettre à jour l'état du champ nom de compétition
        updateCompNameFieldState();
    }

    const styleSheet = document.createElement("style");
    styleSheet.textContent = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(styleSheet);

    // ========================================
    // INITIALISATION UNIQUE
    // ========================================
    setTimeout(async () => {
        // Charger la compétition active en cache AVANT tout le reste
        await getCompetitionActive();
        
        if (selectFusil?.value) updateChokeField();
        if (typeof MeteoManager !== 'undefined') MeteoManager.init();
        
        updateFusilSelect();
        updateCartoucheSelect();
        updateStandSelect();
        updateTenueSelect();

        // Restaurer l'état compétition si existant
        const compExistante = _activeCompCache;
        if (compExistante) {
            currentFormat = compExistante.mode;
            currentDisc = compExistante.disc;
            document.querySelectorAll('#disc-group .btn-choice').forEach(b => {
                b.classList.toggle('active', b.dataset.val === compExistante.disc);
            });
            const maxVal = SCORES_MAX[currentDisc];
            inputScore.max = maxVal;
            inputScore.placeholder = `Entrez votre score (max ${maxVal})`;
        }
        updateFormatButtons();
        (async () => { await updateCompetitionTile(); })();
        updateEquipSummary();
        updateCompNameFieldState();
        updateEquipStatusBadge();
    }, 100);

    window.selectVent = function(btn) {
        document.querySelectorAll('.btn-vent').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    };

}); // ← FIN DU DOMContentLoaded
