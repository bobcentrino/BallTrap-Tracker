// js/stands.js - Version Page Dédiée & Sync Auto

// 1. GESTIONNAIRE DE DONNÉES (IndexedDB)
const StandsManager = {
    async getAll() {
        try { return await Storage.getAllStands(); } catch(e) { console.error(e); return []; }
    },
    async save(stand) {
        try { return await Storage.saveStand(stand); } catch(e) { console.error(e); }
    },
    async delete(id) {
        try { return await Storage.deleteStand(Number(id)); } catch(e) { console.error(e); }
    },
    async getById(id) {
        const all = await this.getAll();
        return all.find(s => Number(s.id) === Number(id));
    }
};

// 2. RENDU DE LA LISTE (Page Mes Stands)
async function renderFullStandsList() {
    const container = document.getElementById('stands-full-list');
    if (!container) return;

    const stands = await StandsManager.getAll();
    container.innerHTML = '';

    if (stands.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:50px 0; color:var(--text-muted);">
                <svg class="icon-lg" style="margin-bottom:12px; opacity:0.4;" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <p style="margin-bottom:15px;">Aucun stand enregistré.</p>
                <button class="btn-main" onclick="openQuickStandModal()">+ Ajouter un premier stand</button>
            </div>`;
        return;
    }

    // Tri alphabétique
    stands.sort((a, b) => String(a.nom).localeCompare(String(b.nom)));

    stands.forEach(stand => {
        const card = document.createElement('div');
        card.className = 'stand-card';
        card.innerHTML = `
            <!-- Icône œil à gauche (sans bouton) -->
            <div style="display:flex; align-items:center; margin-right:12px;">
                <svg viewBox="0 0 24 24" style="width:24px; height:24px; stroke:var(--accent); fill:none; stroke-width:2;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </div>
            
            <!-- Texte centré -->
            <div class="stand-info" onclick="openViewStandModal(${stand.id})" style="flex:1; text-align:center; cursor:pointer;">
                <div class="stand-name">${stand.nom}</div>
                <div class="stand-details">${stand.adresse || 'Adresse non renseignée'} ${stand.tel ? '• ' + stand.tel : ''}</div>
            </div>
            
            <!-- Bouton poubelle SEUL à droite -->
            <button class="btn-stand-action delete" onclick="confirmDeleteStand(${stand.id})" title="Supprimer" style="margin-left:12px;">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
        `;
        container.appendChild(card);
    });
}

// 3. MODIFICATION (Réutilise ton modal existant)
async function openEditStandModal(id) {
    const stand = await StandsManager.getById(id);
    if (!stand) return;

    // Remplissage du formulaire modal
    document.getElementById('stand-id').value = stand.id;
    document.getElementById('stand-nom').value = stand.nom || '';
    document.getElementById('stand-adresse').value = stand.adresse || '';
    document.getElementById('stand-tel').value = stand.tel || '';
    document.getElementById('stand-lat').value = stand.lat || '';
    document.getElementById('stand-lon').value = stand.lon || '';
    if(document.getElementById('stand-notes')) document.getElementById('stand-notes').value = stand.notes || '';

    // ✅ AJOUT ICI : Afficher/masquer le bouton carte selon GPS
    const btnMap = document.getElementById('btn-show-map');
    if (btnMap) {
        btnMap.style.display = (stand.lat && stand.lon) ? 'flex' : 'none';
    }

    document.getElementById('stand-modal-title').textContent = 'Modifier le stand';
    document.getElementById('modal-stand').style.display = 'flex';
}

// Fonction pour ouvrir le modal en mode VISUALISATION
async function openViewStandModal(id) {
    const stand = await StandsManager.getById(id);
    if (!stand) return;

    // 1. Remplir les champs du modal existant
    document.getElementById('stand-id').value = stand.id;
    document.getElementById('stand-nom').value = stand.nom;
    document.getElementById('stand-adresse').value = stand.adresse || '';
    document.getElementById('stand-tel').value = stand.tel || '';
    document.getElementById('stand-lat').value = stand.lat || '';
    document.getElementById('stand-lon').value = stand.lon || '';
    if(document.getElementById('stand-notes')) document.getElementById('stand-notes').value = stand.notes || '';

    // 2. Gérer le bouton "Voir sur la carte" (on le montre seulement si on a des coords)
    const btnMap = document.getElementById('btn-show-map');
    if (btnMap) {
        btnMap.style.display = (stand.lat && stand.lon) ? 'flex' : 'none';
    }

    // 3. Changer le titre du modal
    document.getElementById('stand-modal-title').innerHTML = '<svg class="icon-sm" style="margin-right:8px; vertical-align:middle;" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>' + stand.nom;

    // 4. Afficher le modal
    document.getElementById('modal-stand').style.display = 'flex';
}

// On l'ajoute à l'exposition globale pour que le HTML la trouve
window.openViewStandModal = openViewStandModal;

// Fonction qui ouvre le modal de confirmation
window.confirmDeleteStand = function(id) {
    showConfirmModal("Êtes-vous sûr de vouloir supprimer ce stand ?", function() {
        // Si l'utilisateur confirme, on appelle la vraie suppression
        deleteStandConfirmed(id);
    });
};

// 4. SUPPRESSION (Corrigée - plus de double confirmation)
async function deleteStandConfirmed(id) {
    try {
        await StandsManager.delete(id);
        await renderFullStandsList();

        // Mise à jour synchronisée de la page Saisie
        if (typeof updateStandSelect === 'function') await updateStandSelect();
        
        // Notification de succès
        if (typeof showSuccessToast === 'function') {
            showSuccessToast("Stand supprimé");
        }
    } catch (e) {
        console.error("Erreur suppression stand:", e);
        if (typeof showErrorToast === 'function') {
            showErrorToast("Erreur lors de la suppression");
        }
    }
}

// 5. SAUVEGARDE UNIFIÉE (Ajout ou Modif)
window.saveStand = async function() {
    const id = document.getElementById('stand-id').value;
    const nom = document.getElementById('stand-nom').value.trim();

    if (!nom) { alert("Le nom du stand est obligatoire."); return; }

    const standData = {
        id: id ? Number(id) : Date.now(),
        nom: nom,
        adresse: document.getElementById('stand-adresse').value.trim(),
        tel: document.getElementById('stand-tel').value.trim(),
        lat: document.getElementById('stand-lat').value,
        lon: document.getElementById('stand-lon').value,
        notes: document.getElementById('stand-notes') ? document.getElementById('stand-notes').value.trim() : '',
        dateModif: new Date().toISOString()
    };

    try {
        await StandsManager.save(standData);
        document.getElementById('modal-stand').style.display = 'none';

        // Rafraîchissement global
        await renderFullStandsList();
        if (typeof updateStandSelect === 'function') await updateStandSelect();

        showToast("Stand enregistré !");
    } catch (e) {
        console.error(e);
        alert("Erreur lors de la sauvegarde.");
    }
};

        // Fonction universelle de confirmation
    window.showConfirmModal = function(message, onConfirm) {
    const modal = document.getElementById('modal-confirm');
    const msgEl = document.getElementById('confirm-message');
    const btnOk = document.getElementById('btn-confirm-ok');
    const btnCancel = document.getElementById('btn-confirm-cancel');

    // 1. Afficher le message
    msgEl.textContent = message;
    modal.style.display = 'flex';

    // 2. Action du bouton OK
    btnOk.onclick = function() {
        modal.style.display = 'none';
        if (onConfirm) onConfirm(); // Exécute la vraie suppression
    };

    // 3. Action du bouton Annuler
    btnCancel.onclick = function() {
        modal.style.display = 'none';
    };
};

// 6. EXPOSITION GLOBALE (pour les onclick HTML)
window.renderFullStandsList = renderFullStandsList;
window.openEditStandModal = openEditStandModal;
window.deleteStandConfirmed = deleteStandConfirmed;

// 🚀 Auto-init : charge la liste dès que la page est visible
document.addEventListener('DOMContentLoaded', () => {
    const pageStands = document.getElementById('page-stands');
    if (pageStands) {
        // Si la page est déjà visible au chargement, on lance tout de suite
        if (pageStands.style.display === 'block') {
            renderFullStandsList();
        }
    }
});

// 📍 Auto-chargement quand on clique sur l'onglet Stands
document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab-item[data-page="page-stands"]');
    if (tab) {
        setTimeout(() => renderFullStandsList(), 100);
    }

    // Fonction pour fermer le modal d'édition
window.closeStandModal = function() {
    const modal = document.getElementById('modal-stand');
    if (modal) modal.style.display = 'none';
};
// Afficher le stand sur Google Maps / OpenStreetMap
window.showStandMap = function() {
    const lat = document.getElementById('stand-lat').value;
    const lon = document.getElementById('stand-lon').value;
    
    if (!lat || !lon) {
        alert("Position GPS non disponible pour ce stand");
        return;
    }
    
    // Ouvre Google Maps dans un nouvel onglet
    const url = `https://www.google.com/maps?q=${lat},${lon}`;
    window.open(url, '_blank');
};
});
