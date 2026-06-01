# Ball-Trap Tracker V1.5.2

Application de suivi de performances Ball-Trap pour le tireur — PWA offline.

## Fonctionnalités

- **7 disciplines** : FU, DTL, TRAP 1, PCH, CS, Fosse Olympique, Skeet Olympique
- **Saisie rapide** : grille interactive par discipline, scores instantanés
- **Historique** : arborescence calendaire par discipline, suppression individuelle
- **Statistiques** : progression, records, analyse détaillée
- **Équipement** : gestion du ratelier, chokes et configurations
- **Stands** : suivi des stands de tir fréquentés
- **Météo** : conditions dynamiques (vent, temps, température)
- **3 thèmes** : clair, sombre, plein soleil (haute visibilité extérieur)
- **PWA** : installable, fonctionne offline, Service Worker

## Installation

1. Héberger les fichiers sur un serveur HTTPS (GitHub Pages, Netlify, etc.)
2. Ouvrir dans un navigateur mobile (Chrome / Safari)
3. Ajouter à l'écran d'accueil via le navigateur

## Fichiers

```
├── index.html              # Page principale
├── js                      # Logique applicative
├── css                     # Styles neumorphiques
├── manifest.json           # Manifeste PWA
├── sw.js                   # Service Worker (généré en ligne)
├── icon-192.png            # Icône 192x192
├── icon-512.png            # Icône 512x512
├── apple-touch-icon.png    # Icône iOS 180x180
├── .gitignore
└── README.md
```

## Technologies

- Vanilla JS (aucun framework)
- IndexedDB (stockage local)
- Service Worker (cache offline)
- CSS Neumorphism (design system)

## Auteur

**Bob Patrick DEV (BP-DEV)**

## Licence

Propriétaire — Tous droits réservés.
