// js/ratelier.js - Version UNIFIÉE "Ball-Trap Tracker"

const Armurerie = {
    // Récupère tous les fusils depuis IndexedDB
    async getAll() {
        try {
            return await Storage.getAllFusils();
        } catch (e) {
            console.error("Erreur getAllFusils:", e);
            return [];
        }
    },

    // Ajoute ou met à jour une arme
    async add(gun) {
        try {
            return await Storage.saveFusil(gun);
        } catch (e) {
            console.error("Erreur saveFusil:", e);
        }
    },

    // Supprime une arme
    async delete(id) {
        try {
            return await Storage.deleteFusil(Number(id));
        } catch (e) {
            console.error("Erreur deleteFusil:", e);
        }
    }
};

// ========================================
// GESTION DE LA MODALE LISTE (Hub Equipement)
// ========================================

// Ouvrir la modale qui contient la liste des fusils
window.openArmurerieManager = function() {
    const modal = document.getElementById('modal-armurerie');
    if (modal) {
        modal.style.display = 'flex';
        renderRatelier(); // Rafraîchit la liste à chaque ouverture
    }
};

// Fermer la modale qui contient la liste des fusils
window.closeArmurerieManager = function() {
    const modal = document.getElementById('modal-armurerie');
    if (modal) modal.style.display = 'none';
};

// ========================================
// RENDU DE LA LISTE DES FUSILS
// ========================================
async function renderRatelier() {
    const container = document.getElementById('armurerie-list');
    if (!container) return;

    const guns = await Armurerie.getAll();
    container.innerHTML = '';

    if (guns.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);margin-top:20px;">Aucune arme enregistrée.</p>';
        return;
    }

    guns.forEach(g => {
        let chokesDisplay = '';
        if (g.chokeType === 'fixes') {
            const c1 = g.chokeCanon1 ? g.chokeCanon1.split(' (')[0] : 'N/A';
            const c2 = g.chokeCanon2 ? g.chokeCanon2.split(' (')[0] : 'N/A';
            chokesDisplay = `${c1} - ${c2} 🔒`;
        } else {
            chokesDisplay = 'Amovibles 🔧';
        }

        const html = `
            <div class="gun-card">
                <div class="gun-info">
                    <h4>${g.nom}</h4>
                    <p>${g.type || 'Non spécifié'} • ${chokesDisplay}</p>
                </div>
                <div class="gun-actions">
                    <button class="btn-gun-delete" onclick="confirmDeleteGun(${g.id})" title="Supprimer">
                        <svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
    
    // Met à jour le menu déroulant Custom de la page saisie
    if (typeof updateFusilSelect === 'function') {
        await updateFusilSelect();
    }
}

// ========================================
// SUPPRESSION D'UNE ARME
// ========================================
window.confirmDeleteGun = function(id) {
    // Utilise la fonction showConfirm de ton main.js
    showConfirmModal("Supprimer cette arme ?", async function() {
        try {
            await Armurerie.delete(id);
            await renderRatelier();
            // Utilise la fonction showToast de ton saisie.js
            showToast("Arme supprimée"); 
        } catch (e) {
            console.error("Erreur suppression arme:", e);
            showToast("Erreur lors de la suppression");
        }
    });
};

// ========================================
// GESTION DE LA MODALE D'AJOUT
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modal-fusil');
    const btnOuvrir = document.getElementById('btn-ouvrir-ajout-fusil');
    const btnAnnuler = document.getElementById('btn-annuler-fusil');
    const btnValider = document.getElementById('btn-valider-fusil');
    const chokeTypeGroup = document.getElementById('choke-type-group');
    const chokesFixesFields = document.getElementById('chokes-fixes-fields');
    
    if (!btnOuvrir) return;

    btnOuvrir.addEventListener('click', () => {
        resetGunModal();
        modal.style.display = 'flex';
    });

    btnAnnuler.addEventListener('click', () => modal.style.display = 'none');

    chokeTypeGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-choice');
        if (btn) {
            chokeTypeGroup.querySelectorAll('.btn-choice').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            chokesFixesFields.style.display = btn.dataset.val === 'fixes' ? 'block' : 'none';
        }
    });

    btnValider.addEventListener('click', async () => {
        const nom = document.getElementById('input-nom-fusil').value.trim();
        const type = document.getElementById('input-type-fusil').value.trim();
        const activeChokeBtn = chokeTypeGroup.querySelector('.btn-choice.active');
        const chokeType = activeChokeBtn ? activeChokeBtn.dataset.val : 'fixes';
        
        if (!nom) {
            alert("Le nom du fusil est obligatoire.");
            return;
        }

        const gunData = {
            nom,
            type,
            chokeType,
            chokeCanon1: chokeType === 'fixes' ? document.getElementById('input-choke-canon1').value : '',
            chokeCanon2: chokeType === 'fixes' ? document.getElementById('input-choke-canon2').value : ''
        };

        await Armurerie.add(gunData);
        modal.style.display = 'none';
        await renderRatelier();
        showToast("Arme ajoutée !");
    });

    function resetGunModal() {
        document.getElementById('input-nom-fusil').value = '';
        document.getElementById('input-type-fusil').value = '';
        chokesFixesFields.style.display = 'block';
        // Remettre le bouton "Fixes" actif par défaut
        chokeTypeGroup.querySelectorAll('.btn-choice').forEach((b, i) => b.classList.toggle('active', i === 0));
    }
});