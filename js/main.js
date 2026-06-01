/**
 * BALL-TRAP TRACKER - MAIN ENGINE
 * Avec groupement compétition dans l'historique + suppression
 */

// 1. Formatage des dates
window.formatDateFR = function(dateInput) {
    if (!dateInput) return 'Date inconnue';
    try {
        // Si déjà au format DD/MM/YYYY (ancien format stocké), retourner tel quel
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) return dateInput;
        // Si format ISO YYYY-MM-DD, parser manuellement pour éviter l'inversion
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            const parts = dateInput.split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        // Sinon tenter le parsing JS
        const d = new Date(dateInput);
        return isNaN(d.getTime()) ? String(dateInput) : d.toLocaleDateString('fr-FR');
    } catch(e) { return String(dateInput); }
};

// 2. Gestionnaire de navigation (Router)
window.router = {
    navigate(pageId) {
        console.log("📍 Navigation vers :", pageId);
        
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        
        const target = document.getElementById(pageId);
        if (target) {
            target.classList.add('active');
        }
        
        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.page === pageId);
        });
        
        if (pageId === 'page-saisie' && typeof updateFusilSelect === 'function') {
            updateFusilSelect();
        }
        if (pageId === 'page-historique' && typeof renderHistory === 'function') {
            renderHistory();
        }
        if (pageId === 'page-ratelier' && typeof renderRatelier === 'function') {
            renderRatelier();
        }
        if (pageId === 'page-stats' && typeof initStats === 'function') {
            initStats();
        }
    }
};

// 3. Bouton Entrer
window.entrerApp = function() {
    console.log("🚀 Lancement de l'application...");
    const splash = document.querySelector('.page-splash');
    const nav = document.getElementById('main-nav');
    const fabReglages = document.getElementById('btn-reglages');
    const fabTheme = document.getElementById('btn-theme-cycle');
    
    if (splash) splash.classList.add('hidden');
    setTimeout(() => {
        if (splash) splash.style.display = 'none';
        if (nav) nav.style.display = 'flex';
        if (fabReglages) fabReglages.classList.remove('hidden-default');
        if (fabTheme) fabTheme.classList.remove('hidden-default');
        if (typeof updateThemeIcon === 'function') updateThemeIcon();
        window.router.navigate('page-saisie');
    }, 600);
};

// 4. Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log("📦 Initialisation Storage...");
    if (window.Storage && typeof window.Storage.init === 'function') {
        window.Storage.init().catch(console.error);
    }
    
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', () => window.router.navigate(tab.dataset.page));
    });

    // ========================================
    // GESTION DE L'HISTORIQUE
    // ========================================

    let currentHistoriqueFilter = 'FU';

    window.filterHistorique = function(discipline) {
        currentHistoriqueFilter = discipline;
        
        const btns = document.querySelectorAll('#historique-disc-group .btn-choice');
        btns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.val === discipline);
        });
        
        renderHistory();
    };

    window.renderHistory = async function() {
        var container = document.getElementById('historique-list');
        if (!container) return;
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Chargement...</p>';

        try {
            var allSeries = await Storage.getAllSeries();
            if (!allSeries || allSeries.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:0.9rem">Aucune série enregistrée.<br>Commencez par saisir une séance !</div>';
                return;
            }

            var filteredSeries = allSeries.filter(function(s) { return s.discipline === currentHistoriqueFilter; });
            if (filteredSeries.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:0.9rem">Aucune série en ' + currentHistoriqueFilter + '</div>';
                return;
            }

            // Store for drill-down access
            window._drillAllSeries = filteredSeries;
            window._drillStack = [];

            // Build years map
            var yearMap = {};
            filteredSeries.forEach(function(s) {
                var d = parseSerieDate(s.date);
                if (!d) return;
                var y = d.getFullYear();
                if (!yearMap[y]) yearMap[y] = [];
                yearMap[y].push(s);
            });
            var years = Object.keys(yearMap).sort(function(a, b) { return b - a; });

            if (years.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:0.9rem">Aucune donnée exploitable</div>';
                return;
            }

            // Build drill-down viewport
            var html = '<div class="drill-viewport">';

            // Level 0: Years
            html += '<div class="drill-level current" id="drill-level-years">';
            html += '<div class="drill-level-title">Années</div>';
            html += '<div class="drill-tile-group">';
            years.forEach(function(y) {
                var ySeries = yearMap[y];
                var avg = Math.round(ySeries.reduce(function(a, s) {
                    var max = (s.discipline === 'DTL' || s.discipline === 'TRAP1') ? 75 : 25;
                    return a + Math.round((parseInt(s.score) / max) * 100);
                }, 0) / ySeries.length);
                html += '<div class="drill-tile" onclick="window._drillDown(\'years\',\'' + y + '\')">';
                html += '<div class="tile-left"><div class="tile-icon icon-year">' + String(y).slice(-2) + '</div>';
                html += '<div class="tile-text"><div class="tile-label">' + y + '</div>';
                html += '<div class="tile-sub">' + ySeries.length + ' série' + (ySeries.length > 1 ? 's' : '') + ' · Moy. ' + avg + '%</div></div></div>';
                html += '<span class="tile-chevron">›</span></div>';
            });
            html += '</div></div>';

            // Level 1: Quarters
            html += '<div class="drill-level right" id="drill-level-quarters">';
            html += '<button class="drill-back" onclick="window._drillBack(\'quarters\')"><span class="back-arrow">‹</span> Retour</button>';
            html += '<div class="drill-breadcrumb" id="drill-bc-quarters"></div>';
            html += '<div class="drill-level-title" id="drill-title-quarters"></div>';
            html += '<div id="drill-content-quarters"></div></div>';

            // Level 2: Months
            html += '<div class="drill-level right" id="drill-level-months">';
            html += '<button class="drill-back" onclick="window._drillBack(\'months\')"><span class="back-arrow">‹</span> Retour</button>';
            html += '<div class="drill-breadcrumb" id="drill-bc-months"></div>';
            html += '<div class="drill-level-title" id="drill-title-months"></div>';
            html += '<div id="drill-content-months"></div></div>';

            // Level 3: Series
            html += '<div class="drill-level right" id="drill-level-series">';
            html += '<button class="drill-back" onclick="window._drillBack(\'series\')"><span class="back-arrow">‹</span> Retour</button>';
            html += '<div class="drill-breadcrumb" id="drill-bc-series"></div>';
            html += '<div class="drill-level-title" id="drill-title-series"></div>';
            html += '<div id="drill-content-series"></div></div>';

            html += '</div>';

            container.innerHTML = html;

        } catch (error) {
            container.innerHTML = '<p style="text-align:center;color:var(--score-faible)">Erreur de chargement.</p>';
        }
    };

    // ========================================
    // CONSTRUCTION DE L'ARBORESCENCE
    // ========================================
    function buildHistoryTree(series, competitions) {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentQ = Math.floor(now.getMonth() / 3) + 1;
        const currentMonth = now.getMonth();

        // Indexer les compétitions par leur date de début
        const compMap = {};
        competitions.forEach(comp => {
            const d = parseSerieDate(comp.startDate);
            if (!d) return;
            const y = d.getFullYear();
            const m = d.getMonth();
            const q = Math.floor(m / 3) + 1;
            const monday = getMonday(d);
            const weekKey = monday.toISOString().slice(0, 10);
            const level = `${y}|${q}|${m}|${weekKey}|${comp.disc}`;
            if (!compMap[level]) compMap[level] = [];
            compMap[level].push(comp);
        });

        // Grouper les séries par Année → Trimestre → Mois → Semaine → Discipline
        const yearMap = {};
        series.forEach(s => {
            // Ignorer les séries de compétition — elles sont affichées via les compétitions
            if (s.competitionId) return;
            const d = parseSerieDate(s.date);
            if (!d) return;
            const y = d.getFullYear();
            const m = d.getMonth();
            const q = Math.floor(m / 3) + 1;
            const monday = getMonday(d);
            const weekKey = monday.toISOString().slice(0, 10);
            const weekLabel = `Semaine du ${fmtDDMM(monday)} au ${fmtDDMM(getSunday(d))}`;
            const disc = s.discipline;

            if (!yearMap[y]) yearMap[y] = {};
            if (!yearMap[y][q]) yearMap[y][q] = {};
            if (!yearMap[y][q][m]) yearMap[y][q][m] = {};
            if (!yearMap[y][q][m][weekKey]) yearMap[y][q][m][weekKey] = { label: weekLabel, discs: {} };
            if (!yearMap[y][q][m][weekKey].discs[disc]) yearMap[y][q][m][weekKey].discs[disc] = [];
            yearMap[y][q][m][weekKey].discs[disc].push(s);
        });

        // Convertir en structure triée
        const tree = [];
        Object.keys(yearMap).sort((a, b) => b - a).forEach(y => {
            const yearNode = {
                type: 'year',
                label: y,
                isCurrent: parseInt(y) === currentYear,
                children: []
            };

            Object.keys(yearMap[y]).sort((a, b) => b - a).forEach(q => {
                const qNum = parseInt(q);
                const qLabel = quarterLabel(qNum, parseInt(y));
                const quarterNode = {
                    type: 'quarter',
                    label: qLabel,
                    isCurrent: parseInt(y) === currentYear && qNum === currentQ,
                    children: []
                };

                Object.keys(yearMap[y][q]).sort((a, b) => b - a).forEach(m => {
                    const mNum = parseInt(m);
                    const monthNode = {
                        type: 'month',
                        label: MONTHS_FR[mNum],
                        isCurrent: parseInt(y) === currentYear && mNum === currentMonth,
                        children: []
                    };

                    Object.keys(yearMap[y][q][m]).sort((a, b) => b - a).forEach(wk => {
                        const weekData = yearMap[y][q][m][wk];
                        const weekNode = {
                            type: 'week',
                            label: weekData.label,
                            isCurrent: false, // Will check below
                            children: []
                        };

                        // Vérifier si c'est la semaine en cours
                        const weekMonday = new Date(wk + 'T00:00:00');
                        const nowMonday = getMonday(now);
                        if (weekMonday.getTime() === nowMonday.getTime()) {
                            weekNode.isCurrent = true;
                        }

                        Object.keys(weekData.discs).sort().forEach(disc => {
                            const discSeries = weekData.discs[disc];
                            const discNode = {
                                type: 'discipline',
                                label: disc,
                                isCurrent: false,
                                series: discSeries,
                                competitions: []
                            };

                            // Ajouter les compétitions de cette discipline/semaine
                            const level = `${y}|${q}|${m}|${wk}|${disc}`;
                            if (compMap[level]) {
                                discNode.competitions = compMap[level];
                            }

                            weekNode.children.push(discNode);
                        });

                        monthNode.children.push(weekNode);
                    });

                    quarterNode.children.push(monthNode);
                });

                yearNode.children.push(quarterNode);
            });

            tree.push(yearNode);
        });

        return tree;
    }

    // ========================================
    // RENDU DE L'ARBORESCENCE
    // ========================================
    function renderTree(container, nodes, depth) {
        nodes.forEach(node => {
            const folder = document.createElement('div');
            folder.className = 'tree-folder';
            folder.dataset.depth = depth;

            // En-tête du dossier
            const header = document.createElement('div');
            header.className = 'tree-folder-header';
            header.style.paddingLeft = `${8 + depth * 14}px`;

            // Icône dossier (chevron ▼/▶)
            const icon = document.createElement('span');
            icon.className = 'tree-folder-icon';
            icon.innerHTML = svgChevronRight;

            // Icône type
            const typeIcon = document.createElement('span');
            typeIcon.className = 'tree-folder-type-icon';
            typeIcon.innerHTML = getFolderIcon(node.type);

            // Label
            const label = document.createElement('span');
            label.className = 'tree-folder-label';
            label.textContent = node.label;

            // Compteur
            const count = document.createElement('span');
            count.className = 'tree-folder-count';

            if (node.type === 'week') {
                // Semaine : regrouper toutes les séries et compétitions des sous-disciplines
                const allSeries = [];
                const allComps = [];
                if (node.children) {
                    node.children.forEach(discNode => {
                        if (discNode.series) allSeries.push(...discNode.series);
                        if (discNode.competitions) allComps.push(...discNode.competitions);
                    });
                }
                const totalSeries = allSeries.length + allComps.reduce((s, c) => s + (c.series ? c.series.length : 0), 0);
                let countText = `${totalSeries} série${totalSeries > 1 ? 's' : ''}`;
                if (allComps.length > 0) countText += ` + ${allComps.length} comp.`;
                count.textContent = countText;
            } else if (node.type === 'discipline') {
                count.textContent = `${node.series.length} série${node.series.length > 1 ? 's' : ''}`;
                if (node.competitions && node.competitions.length > 0) {
                    count.textContent += ` + ${node.competitions.length} comp.`;
                }
            } else {
                const total = countAllSeries(node);
                count.textContent = `${total} série${total > 1 ? 's' : ''}`;
            }

            header.appendChild(icon);
            header.appendChild(typeIcon);
            header.appendChild(label);
            header.appendChild(count);
            folder.appendChild(header);

            // Contenu (enfants)
            const content = document.createElement('div');
            content.className = 'tree-folder-content';

            if (node.type === 'week') {
                // SEMAINE : afficher 2 sous-entrées (Entraînement + Compétition)
                const allTrainSeries = [];
                const allComps = [];
                if (node.children) {
                    node.children.forEach(discNode => {
                        if (discNode.series) allTrainSeries.push(...discNode.series);
                        if (discNode.competitions) allComps.push(...discNode.competitions);
                    });
                }

                // Sous-entrée Entraînement
                if (allTrainSeries.length > 0) {
                    const nbSeries = allTrainSeries.length;
                    const totalScore = allTrainSeries.reduce((s, serie) => s + (serie.score || 0), 0);
                    const totalMax = allTrainSeries.reduce((s, serie) => s + (serie.max || 0), 0);
                    const avgPct = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;

                    const trainSummary = document.createElement('div');
                    trainSummary.className = 'tree-disc-summary';
                    trainSummary.innerHTML = `
                        <div class="tree-disc-summary-left">
                            <span class="tree-disc-summary-icon">${svgTarget}</span>
                            <span class="tree-disc-summary-text">${nbSeries} série${nbSeries > 1 ? 's' : ''} d'entraînement — ${totalScore}/${totalMax} (${avgPct}%)</span>
                        </div>
                        <span class="tree-disc-summary-arrow">voir détail ›</span>
                    `;
                    trainSummary.addEventListener('click', () => {
                        openTrainDetail({ label: node.label, series: allTrainSeries });
                    });
                    content.appendChild(trainSummary);
                }

                // Sous-entrée(s) Compétition
                allComps.forEach(comp => {
                    const pct = comp.scoreMaxCumul ? Math.round((comp.scoreCumul / comp.scoreMaxCumul) * 100) : 0;
                    const compTile = document.createElement('div');
                    compTile.className = 'tree-comp-tile';

                    const compContent = document.createElement('div');
                    compContent.className = 'tree-comp-content';
                    compContent.innerHTML = `
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="comp-badge">${svgTrophySmall} Compétition</span>
                            <span style="font-weight:700; color:var(--text-primary);">${formatDateFR(comp.startDate)}</span>
                        </div>
                        <div style="font-size:0.95rem; font-weight:800; color:var(--text-primary); margin-top:4px;">${comp.name || comp.disc + ' - ' + comp.mode + ' plateaux'}</div>
                        <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">${(comp.series && comp.series.length) || 0} séries — Score total : ${comp.scoreCumul}/${comp.scoreMaxCumul}</div>
                    `;
                    compContent.addEventListener('click', () => openCompDetail(comp));

                    const scoreDiv = document.createElement('div');
                    scoreDiv.className = 'tree-comp-score';
                    scoreDiv.innerHTML = `
                        <div style="font-size:1.3rem; font-weight:800; color:var(--accent);">${pct}%</div>
                        <div style="color:var(--text-muted); font-size:0.75rem;">${comp.mode === '100' ? '4/4' : '8/8'}</div>
                    `;
                    scoreDiv.addEventListener('click', () => openCompDetail(comp));

                    const btnDelete = document.createElement('button');
                    btnDelete.className = 'btn-stand-action delete tree-delete-btn';
                    btnDelete.title = 'Supprimer cette compétition';
                    btnDelete.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
                    btnDelete.addEventListener('click', (e) => {
                        e.stopPropagation();
                        confirmDeleteCompetition(comp);
                    });

                    compTile.appendChild(compContent);
                    compTile.appendChild(scoreDiv);
                    compTile.appendChild(btnDelete);
                    content.appendChild(compTile);
                });

                // Si aucun contenu sous la semaine, ne pas afficher
                if (content.children.length === 0) {
                    return;
                }

                folder.appendChild(content);
                container.appendChild(folder);

                // Gestion du pliage/dépliage
                header.addEventListener('click', () => {
                    const isOpen = content.style.display !== 'none';
                    content.style.display = isOpen ? 'none' : 'block';
                    icon.innerHTML = isOpen ? svgChevronRight : svgChevronDown;
                    header.classList.toggle('open', !isOpen);
                });

                // Auto-ouvrir si c'est la semaine en cours
                if (node.isCurrent) {
                    content.style.display = 'block';
                    icon.innerHTML = svgChevronDown;
                    header.classList.add('open');
                } else {
                    content.style.display = 'none';
                    icon.innerHTML = svgChevronRight;
                    header.classList.remove('open');
                }
                return;
            } else if (node.type === 'discipline') {
                // Niveau le plus bas : afficher les compétitions puis les séries
                renderDisciplineContent(content, node);
            } else if (node.children) {
                renderTree(content, node.children, depth + 1);
            }

            // Ne pas afficher le dossier s'il est vide
            if (content.children.length === 0) {
                return; // Skip empty folders
            }

            folder.appendChild(content);
            container.appendChild(folder);

            // Gestion du pliage/dépliage
            header.addEventListener('click', () => {
                const isOpen = content.style.display !== 'none';
                content.style.display = isOpen ? 'none' : 'block';
                icon.innerHTML = isOpen ? svgChevronRight : svgChevronDown;
                header.classList.toggle('open', !isOpen);
            });

            // Auto-ouvrir si c'est la période en cours
            if (node.isCurrent) {
                content.style.display = 'block';
                icon.innerHTML = svgChevronDown;
                header.classList.add('open');
            } else {
                content.style.display = 'none';
                icon.innerHTML = svgChevronRight;
                header.classList.remove('open');
            }
        });
    }

    // ========================================
    // RENDU DU CONTENU DISCIPLINE (Option B : résumé cliquable + compétitions)
    // ========================================
    function renderDisciplineContent(container, discNode) {
        // 1. Afficher les compétitions (tuiles cliquables comme avant)
        if (discNode.competitions && discNode.competitions.length > 0) {
            discNode.competitions.forEach(comp => {
                const tile = document.createElement('div');
                tile.className = 'tree-comp-tile';
                const pct = comp.scoreMaxCumul ? Math.round((comp.scoreCumul / comp.scoreMaxCumul) * 100) : 0;

                const compContent = document.createElement('div');
                compContent.className = 'tree-comp-content';
                compContent.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="comp-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"><path d="M8 2h8v8a4 4 0 0 1-8 0V2z"/><path d="M6 4H4v3a2 2 0 0 0 2 2"/><path d="M18 4h2v3a2 2 0 0 1-2 2"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="8" y1="18" x2="16" y2="18"/></svg> Compétition</span>
                        <span style="font-weight:700; color:var(--text-primary);">${formatDateFR(comp.startDate)}</span>
                    </div>
                    <div style="font-size:0.95rem; font-weight:800; color:var(--text-primary); margin-top:4px;">${comp.name || comp.disc + ' - ' + comp.mode + ' plateaux'}</div>
                    <div style="font-size:0.82rem; color:var(--text-muted); margin-top:2px;">${(comp.series && comp.series.length) || 0} séries — Score total : ${comp.scoreCumul}/${comp.scoreMaxCumul}</div>
                `;
                compContent.addEventListener('click', () => openCompDetail(comp));

                const scoreDiv = document.createElement('div');
                scoreDiv.className = 'tree-comp-score';
                scoreDiv.innerHTML = `
                    <div style="font-size:1.3rem; font-weight:800; color:var(--accent);">${pct}%</div>
                    <div style="color:var(--text-muted); font-size:0.75rem;">${comp.mode === '100' ? '4/4' : '8/8'}</div>
                `;
                scoreDiv.addEventListener('click', () => openCompDetail(comp));

                const btnDelete = document.createElement('button');
                btnDelete.className = 'btn-stand-action delete tree-delete-btn';
                btnDelete.title = 'Supprimer cette compétition';
                btnDelete.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    confirmDeleteCompetition(comp);
                });

                tile.appendChild(compContent);
                tile.appendChild(scoreDiv);
                tile.appendChild(btnDelete);
                container.appendChild(tile);
            });
        }

        // 2. Afficher le résumé cliquable pour les séries d'entraînement (Option B)
        if (discNode.series && discNode.series.length > 0) {
            const nbSeries = discNode.series.length;
            const totalScore = discNode.series.reduce((s, serie) => s + (serie.score || 0), 0);
            const totalMax = discNode.series.reduce((s, serie) => s + (serie.max || 0), 0);
            const avgPct = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;

            const summary = document.createElement('div');
            summary.className = 'tree-disc-summary';
            summary.innerHTML = `
                <div class="tree-disc-summary-left">
                    <span class="tree-disc-summary-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span>
                    <span class="tree-disc-summary-text">${nbSeries} série${nbSeries > 1 ? 's' : ''} — ${totalScore}/${totalMax} (${avgPct}%)</span>
                </div>
                <span class="tree-disc-summary-arrow">voir détail ›</span>
            `;
            summary.addEventListener('click', () => openTrainDetail(discNode));
            container.appendChild(summary);
        }
    }

    // ========================================
    // HELPERS ARBORESCENCE
    // ========================================
    // SVG helpers pour l'arborescence et modales
    const svgChevronRight = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    const svgChevronDown = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    const svgChevronRightAccent = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

    // Icônes type pour l'arborescence
    const svgCalendarYear = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
    const svgClipboard = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="9" y1="14" x2="15" y2="14"/><line x1="9" y1="18" x2="13" y2="18"/></svg>';
    const svgCalendarMonth = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="12" y2="18"/></svg>';
    const svgCalendarWeek = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="7" y1="14" x2="10" y2="14"/><line x1="12" y1="14" x2="17" y2="14"/><line x1="7" y1="18" x2="10" y2="18"/><line x1="12" y1="18" x2="15" y2="18"/></svg>';
    const svgTarget = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
    const svgTrophy = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8v8a4 4 0 0 1-8 0V2z"/><path d="M6 4H4v3a2 2 0 0 0 2 2"/><path d="M18 4h2v3a2 2 0 0 1-2 2"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="8" y1="18" x2="16" y2="18"/></svg>';
    const svgTrophySmall = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"><path d="M8 2h8v8a4 4 0 0 1-8 0V2z"/><path d="M6 4H4v3a2 2 0 0 0 2 2"/><path d="M18 4h2v3a2 2 0 0 1-2 2"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="8" y1="18" x2="16" y2="18"/></svg>';
    const svgFolder = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

    function getFolderIcon(type) {
        const icons = {
            year: svgCalendarYear,
            quarter: svgClipboard,
            month: svgCalendarMonth,
            week: svgCalendarWeek,
            discipline: svgTarget
        };
        return icons[type] || svgFolder;
    }

    function countAllSeries(node) {
        if (node.type === 'discipline') {
            let total = node.series.length;
            if (node.competitions) {
                node.competitions.forEach(c => total += c.series.length);
            }
            return total;
        }
        if (node.children) {
            return node.children.reduce((sum, child) => sum + countAllSeries(child), 0);
        }
        return 0;
    }

    // ========================================
    // SUPPRESSION SÉRIE ENTRAÎNEMENT
    // ========================================
    window.confirmDeleteSerie = function(serieId) {
        if (typeof showConfirmModal === 'function') {
            showConfirmModal('Supprimer cette série ? Cette action est irréversible.', function() {
                deleteSerieConfirmed(serieId);
            });
        } else {
            // Fallback
            if (confirm('Supprimer cette série ?')) {
                deleteSerieConfirmed(serieId);
            }
        }
    };

    async function deleteSerieConfirmed(serieId) {
        try {
            await Storage.deleteSerie(serieId);
            showToast('Série supprimée');
            renderHistory();
        } catch (e) {
            console.error('Erreur suppression série:', e);
            showToast('Erreur lors de la suppression');
        }
    }

    // ========================================
    // SUPPRESSION COMPÉTITION (toutes les séries)
    // ========================================
    window.confirmDeleteCompetition = function(comp) {
        if (typeof showConfirmModal === 'function') {
            showConfirmModal(`Supprimer la compétition "${comp.name || 'Compétition'}" et ses ${(comp.series && comp.series.length) || 0} séries ? Cette action est irréversible.`, function() {
                deleteCompetitionConfirmed(comp);
            });
        } else {
            if (confirm(`Supprimer la compétition et ses ${(comp.series && comp.series.length) || 0} séries ?`)) {
                deleteCompetitionConfirmed(comp);
            }
        }
    };

    async function deleteCompetitionConfirmed(comp) {
        try {
            // 1. Supprimer toutes les séries de la compétition
            for (const serieId of (comp.series || [])) {
                await Storage.deleteSerie(serieId);
            }

            // 2. Retirer la compétition de l'archive (IndexedDB)
            await Storage.deleteCompetition(comp.id);

            showToast('Compétition supprimée');
            renderHistory();
        } catch (e) {
            console.error('Erreur suppression compétition:', e);
            showToast('Erreur lors de la suppression');
        }
    }

    // ========================================
    // MODALE DÉTAIL COMPÉTITION (cartes à plat)
    // ========================================
    window.openCompDetail = async function(comp) {
        const modal = document.getElementById('modal-comp-detail');
        const titleEl = document.getElementById('comp-detail-title');
        const scoreEl = document.getElementById('comp-detail-score');
        const seriesContainer = document.getElementById('comp-detail-series');
        if (!modal || !seriesContainer) return;

        const pct = comp.scoreMaxCumul ? Math.round((comp.scoreCumul / comp.scoreMaxCumul) * 100) : 0;

        titleEl.textContent = `${comp.name || comp.disc + ' - ' + comp.mode + ' plateaux'} — ${formatDateFR(comp.startDate)}`;
        scoreEl.textContent = `Score total : ${comp.scoreCumul} / ${comp.scoreMaxCumul} (${pct}%)`;

        seriesContainer.innerHTML = '';

        // Récupérer les séries par leur ID
        const allSeries = await Storage.getAllSeries();
        const compSeries = (comp.series || []).map(id => allSeries.find(s => s.id === id)).filter(Boolean);

        compSeries.forEach((serie, index) => {
            const percent = serie.max ? Math.round((serie.score / serie.max) * 100) : 0;
            const card = document.createElement('div');
            card.className = 'modal-serie-card';

            // Contenu série
            const content = document.createElement('div');
            content.className = 'modal-serie-content';
            content.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-weight:800; color:var(--text-primary);">Série ${index + 1}</span>
                    <span style="font-weight:800; color:var(--accent); font-size:1.1rem;">${serie.score}/${serie.max} (${percent}%)</span>
                </div>
                <div style="font-size:0.82rem; color:var(--text-muted); display:flex; flex-direction:column; gap:2px;">
                    <span>${formatDateFR(serie.date)} — ${serie.meteo || 'N/A'} — ${serie.vent || 'N/A'}</span>
                    <span>${serie.fusil || 'Non renseigné'}${serie.chokes ? ' — ' + serie.chokes : ''}</span>
                    <span>${serie.cartouche || 'Non renseigné'} — ${serie.lieu || 'Non renseigné'}${serie.tenue ? ' — ' + serie.tenue : ''}</span>
                    ${serie.notes ? '<span>' + serie.notes + '</span>' : ''}
                </div>
            `;

            // Bouton poubelle (à plat)
            const btnDelete = document.createElement('button');
            btnDelete.className = 'modal-serie-delete';
            btnDelete.title = 'Supprimer cette série';
            btnDelete.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                confirmDeleteSerieFromComp(serie.id, comp);
            });

            card.appendChild(content);
            card.appendChild(btnDelete);
            seriesContainer.appendChild(card);
        });

        modal.style.display = 'flex';
    };

    // ========================================
    // MODALE DÉTAIL ENTRAÎNEMENT
    // ========================================
    window.openTrainDetail = function(discNode) {
        const modal = document.getElementById('modal-train-detail');
        const titleEl = document.getElementById('train-detail-title');
        const scoreEl = document.getElementById('train-detail-score');
        const seriesContainer = document.getElementById('train-detail-series');
        if (!modal || !seriesContainer) return;

        const nbSeries = discNode.series.length;
        const totalScore = discNode.series.reduce((s, serie) => s + (serie.score || 0), 0);
        const totalMax = discNode.series.reduce((s, serie) => s + (serie.max || 0), 0);
        const avgPct = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;

        titleEl.textContent = discNode.label;
        scoreEl.textContent = `${nbSeries} série${nbSeries > 1 ? 's' : ''} — Score cumulé : ${totalScore} / ${totalMax} (${avgPct}%)`;

        seriesContainer.innerHTML = '';

        discNode.series.forEach((serie, index) => {
            const percent = serie.max ? Math.round((serie.score / serie.max) * 100) : 0;
            const card = document.createElement('div');
            card.className = 'modal-serie-card';

            // Contenu série
            const content = document.createElement('div');
            content.className = 'modal-serie-content';
            const displayName = serie.sessionName || '';
            content.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-weight:800; color:var(--text-primary);">Série ${index + 1}</span>
                    <span style="font-weight:800; color:var(--accent); font-size:1.1rem;">${serie.score}/${serie.max} (${percent}%)</span>
                </div>
                ${displayName ? `<div style="font-size:0.85rem; font-weight:700; color:var(--text-primary); margin-bottom:4px;">${displayName}</div>` : ''}
                <div style="font-size:0.82rem; color:var(--text-muted); display:flex; flex-direction:column; gap:2px;">
                    <span>${formatDateFR(serie.date)} — ${serie.meteo || 'N/A'} — ${serie.vent || 'N/A'}</span>
                    <span>${serie.fusil || 'Non renseigné'}${serie.chokes ? ' — ' + serie.chokes : ''}</span>
                    <span>${serie.cartouche || 'Non renseigné'} — ${serie.lieu || 'Non renseigné'}${serie.tenue ? ' — ' + serie.tenue : ''}</span>
                    ${serie.notes ? '<span>' + serie.notes + '</span>' : ''}
                </div>
            `;

            // Bouton poubelle
            const btnDelete = document.createElement('button');
            btnDelete.className = 'modal-serie-delete';
            btnDelete.title = 'Supprimer cette série';
            btnDelete.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                confirmDeleteSerie(serie.id);
                modal.style.display = 'none';
            });

            card.appendChild(content);
            card.appendChild(btnDelete);
            seriesContainer.appendChild(card);
        });

        modal.style.display = 'flex';
    };

    // ========================================
    // SUPPRESSION D'UNE SÉRIE DANS UNE COMPÉTITION
    // ========================================
    window.confirmDeleteSerieFromComp = function(serieId, comp) {
        if (typeof showConfirmModal === 'function') {
            showConfirmModal('Supprimer cette série de la compétition ?', function() {
                deleteSerieFromCompConfirmed(serieId, comp);
            });
        } else {
            if (confirm('Supprimer cette série ?')) {
                deleteSerieFromCompConfirmed(serieId, comp);
            }
        }
    };

    async function deleteSerieFromCompConfirmed(serieId, comp) {
        try {
            // 1. Supprimer la série
            await Storage.deleteSerie(serieId);

            // 2. Retirer l'ID de la série de la compétition dans IndexedDB
            const compInDb = await Storage.getAllCompetitions();
            const compInArchive = compInDb.find(c => c.id === comp.id);
            if (compInArchive) {
                compInArchive.series = compInArchive.series.filter(id => id !== serieId);
                // Recalculer le score cumulé
                const allSeries = await Storage.getAllSeries();
                const remainingSeries = compInArchive.series.map(id => allSeries.find(s => s.id === id)).filter(Boolean);
                compInArchive.scoreCumul = remainingSeries.reduce((sum, s) => sum + s.score, 0);
                compInArchive.scoreMaxCumul = remainingSeries.reduce((sum, s) => sum + s.max, 0);

                // Si plus aucune série, supprimer la compétition
                if (compInArchive.series.length === 0) {
                    await Storage.deleteCompetition(compInArchive.id);
                } else {
                    await Storage.saveCompetition(compInArchive);
                }
            }

            showToast('Série supprimée');

            // Fermer la modale détail et rafraîchir l'historique
            const modal = document.getElementById('modal-comp-detail');
            if (modal) modal.style.display = 'none';
            renderHistory();
        } catch (e) {
            console.error('Erreur suppression série compétition:', e);
            showToast('Erreur lors de la suppression');
        }
    }
});

// 5. Placeholders pour éviter les erreurs ReferenceError
window.deleteSerie = window.deleteSerie || function() { console.warn("deleteSerie non chargé"); };

/* ══════════════════════════════════════════
   DRILL-DOWN HISTORIQUE — Navigation par niveaux
   ══════════════════════════════════════════ */
(function() {
    var drillLevels = ['years', 'quarters', 'months', 'series'];

    function setDrillLevel(id, direction) {
        drillLevels.forEach(function(lv) {
            var el = document.getElementById('drill-level-' + lv);
            if (!el) return;
            if (lv === id) {
                el.className = 'drill-level current';
            } else if (direction === 'forward') {
                el.className = 'drill-level left';
            } else {
                el.className = 'drill-level right';
            }
        });
    }

    function maxForDiscipline(disc) {
        return (disc === 'DTL' || disc === 'TRAP1') ? 75 : 25;
    }

    function discClass(disc) {
        if (!disc) return '';
        return disc.toLowerCase().replace(/\s+/g, '').replace(/olympique/g, '');
    }

    window._drillDown = function(fromLevel, value) {
        var allSeries = window._drillAllSeries || [];

        if (fromLevel === 'years') {
            var year = value;
            var yearSeries = allSeries.filter(function(s) {
                var d = parseSerieDate(s.date);
                return d && d.getFullYear() === parseInt(year);
            });
            var quarters = [];
            yearSeries.forEach(function(s) {
                var d = parseSerieDate(s.date);
                var q = Math.floor(d.getMonth() / 3) + 1;
                if (quarters.indexOf(q) === -1) quarters.push(q);
            });
            quarters.sort(function(a, b) { return b - a; });

            var titleEl = document.getElementById('drill-title-quarters');
            if (titleEl) titleEl.textContent = year;
            var bcEl = document.getElementById('drill-bc-quarters');
            if (bcEl) bcEl.innerHTML = buildDrillBreadcrumb(['years'], [year]);

            var html = '<div class="drill-tile-group">';
            quarters.forEach(function(q) {
                var qSeries = yearSeries.filter(function(s) {
                    var d = parseSerieDate(s.date);
                    return Math.floor(d.getMonth() / 3) + 1 === q;
                });
                var avg = Math.round(qSeries.reduce(function(a, s) { return a + Math.round(parseInt(s.score) / maxForDiscipline(s.discipline) * 100); }, 0) / qSeries.length);
                html += '<div class="drill-tile" onclick="window._drillDown(\'quarters\',\'' + q + '\',\'' + year + '\')">';
                html += '<div class="tile-left"><div class="tile-icon icon-q">T' + q + '</div>';
                html += '<div class="tile-text"><div class="tile-label">Trimestre ' + q + '</div>';
                html += '<div class="tile-sub">' + qSeries.length + ' série' + (qSeries.length > 1 ? 's' : '') + ' · Moy. ' + avg + '%</div></div></div>';
                html += '<span class="tile-chevron">›</span></div>';
            });
            html += '</div>';

            var cont = document.getElementById('drill-content-quarters');
            if (cont) cont.innerHTML = html;
            window._drillStack = [{ level: 'years', data: { year: year } }];
            setDrillLevel('quarters', 'forward');

        } else if (fromLevel === 'quarters') {
            var quarter = value;
            var year = arguments[2] || (window._drillStack[0] && window._drillStack[0].data.year) || '2026';
            var qSeries = allSeries.filter(function(s) {
                var d = parseSerieDate(s.date);
                return d && d.getFullYear() === parseInt(year) && Math.floor(d.getMonth() / 3) + 1 === parseInt(quarter);
            });
            var months = [];
            qSeries.forEach(function(s) {
                var d = parseSerieDate(s.date);
                if (months.indexOf(d.getMonth()) === -1) months.push(d.getMonth());
            });
            months.sort(function(a, b) { return b - a; });

            var titleEl = document.getElementById('drill-title-months');
            if (titleEl) titleEl.textContent = 'Trimestre ' + quarter;
            var bcEl = document.getElementById('drill-bc-months');
            if (bcEl) bcEl.innerHTML = buildDrillBreadcrumb(['years', 'quarters'], [year, 'T' + quarter]);

            var html = '<div class="drill-tile-group">';
            months.forEach(function(m) {
                var mSeries = qSeries.filter(function(s) { return parseSerieDate(s.date).getMonth() === m; });
                var avg = Math.round(mSeries.reduce(function(a, s) { return a + Math.round(parseInt(s.score) / maxForDiscipline(s.discipline) * 100); }, 0) / mSeries.length);
                html += '<div class="drill-tile" onclick="window._drillDown(\'months\',\'' + m + '\',\'' + quarter + '\',\'' + year + '\')">';
                html += '<div class="tile-left"><div class="tile-icon icon-month">' + MONTHS_FR[m].substring(0, 3) + '</div>';
                html += '<div class="tile-text"><div class="tile-label">' + MONTHS_FR[m] + '</div>';
                html += '<div class="tile-sub">' + mSeries.length + ' série' + (mSeries.length > 1 ? 's' : '') + ' · Moy. ' + avg + '%</div></div></div>';
                html += '<span class="tile-chevron">›</span></div>';
            });
            html += '</div>';

            var cont = document.getElementById('drill-content-months');
            if (cont) cont.innerHTML = html;
            window._drillStack.push({ level: 'quarters', data: { year: year, quarter: quarter } });
            setDrillLevel('months', 'forward');

        } else if (fromLevel === 'months') {
            var month = value;
            var quarter = arguments[2] || '1';
            var year = arguments[3] || '2026';
            var mSeries = allSeries.filter(function(s) {
                var d = parseSerieDate(s.date);
                return d && d.getFullYear() === parseInt(year) && Math.floor(d.getMonth() / 3) + 1 === parseInt(quarter) && d.getMonth() === parseInt(month);
            });

            var titleEl = document.getElementById('drill-title-series');
            if (titleEl) titleEl.textContent = MONTHS_FR[parseInt(month)];
            var bcEl = document.getElementById('drill-bc-series');
            if (bcEl) bcEl.innerHTML = buildDrillBreadcrumb(['years', 'quarters', 'months'], [year, 'T' + quarter, MONTHS_FR[parseInt(month)]]);

            var html = '<div class="drill-series-group">';
            mSeries.sort(function(a, b) { return (b.id || 0) - (a.id || 0); }).forEach(function(s, idx) {
                var max = maxForDiscipline(s.discipline);
                var pct = Math.round(parseInt(s.score) / max * 100);
                var pctClass = pct >= 85 ? 'excellent' : pct >= 70 ? 'good' : 'poor';
                var dClass = discClass(s.discipline);
                var windInfo = s.vent && s.vent !== 'faible' ? '💨 ' + s.vent : '';
                html += '<div class="drill-series-card drill-slide-up" onclick="openTrainDetailDrill(' + idx + ')">';
                html += '<div class="sc-left">';
                html += '<div class="sc-date">' + s.date + (s.poste ? ' · Poste ' + s.poste : '') + '</div>';
                if (windInfo) html += '<div class="sc-detail">' + windInfo + '</div>';
                html += '</div>';
                html += '<div class="sc-right">';
                html += '<span class="sc-badge ' + dClass + '">' + (s.discipline || '?') + '</span>';
                html += '<span class="sc-score">' + s.score + '/' + max + '</span>';
                html += '<span class="sc-pct ' + pctClass + '">' + pct + '%</span>';
                html += '</div></div>';
            });
            if (mSeries.length === 0) html += '<div class="drill-empty">Aucune série enregistrée</div>';
            html += '</div>';

            var cont = document.getElementById('drill-content-series');
            if (cont) cont.innerHTML = html;

            // Store month series for detail access
            window._drillMonthSeries = mSeries;
            window._drillStack.push({ level: 'months', data: { year: year, quarter: quarter, month: month } });
            setDrillLevel('series', 'forward');
        }
    };

    window._drillBack = function(fromLevel) {
        var idx = drillLevels.indexOf(fromLevel);
        if (idx <= 0) return;
        var targetLevel = drillLevels[idx - 1];
        setDrillLevel(targetLevel, 'backward');
        window._drillStack.pop();
    };

    function buildDrillBreadcrumb(levels, labels) {
        var html = '';
        levels.forEach(function(lv, i) {
            var isCurrent = (i === levels.length - 1);
            if (i > 0) html += '<span class="bc-sep">›</span>';
            if (isCurrent) {
                html += '<span class="bc-current">' + labels[i] + '</span>';
            } else {
                html += '<span class="bc-seg" onclick="window._drillBack(\'' + levels[i + 1] + '\')">' + labels[i] + '</span>';
            }
        });
        return html;
    }

    // Open training detail from drill-down
    window.openTrainDetailDrill = function(idx) {
        var s = window._drillMonthSeries && window._drillMonthSeries[idx];
        if (s) {
            // Build a discipline node for the detail modal
            var discNode = { type: 'discipline', label: s.discipline, series: [s] };
            openTrainDetail(discNode);
        }
    };
})();
