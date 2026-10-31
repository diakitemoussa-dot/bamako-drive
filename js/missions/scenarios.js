// Scénarios locaux (Bamako / Mali) : ce qu'on transporte, ce que disent l'expéditeur et le destinataire.
// fragile : sensibilité aux chocs et à la vitesse (1 = normal) ; base + perKm : prix en FCFA ; hot : livraison urgente (le client annule si tu es trop en retard)

/** réglages par type de véhicule de livraison : distance des trajets, vitesse de référence (m/s) pour le délai */
export const DELIVERY = {
  moto:     { label: 'Livraison', minD: 600,  maxD: 2600, speed: 11, crate: { size: [0.46, 0.42, 0.42], pos: [-0.62, 1.02, 0] } },
  tricycle: { label: 'Transport', minD: 500,  maxD: 2200, speed: 5.5, crate: { size: [0.95, 0.6, 1.0], pos: [-0.45, 0.85, 0] } },
  pickup:   { label: 'Chargement', minD: 800, maxD: 3200, speed: 9, crate: { size: [1.3, 0.7, 1.5], pos: [-1.75, 1.22, 0] } },
  truck:    { label: 'Cargaison', minD: 1200, maxD: 3800, speed: 7, crate: null },   // caisson fermé : pas de charge visible
};

export const JOBS = {
  moto: [
    { item: 'Poulet braisé', icon: '🍗', fragile: 1.1, base: 500, perKm: 750, hot: true, give: 'Voilà le poulet braisé du maquis, il doit arriver CHAUD ! Va vite, Jakarta !', get: 'Hmm, encore chaud ! Que Dieu te le rende, voilà pour toi.' },
    { item: 'Médicaments', icon: '💊', fragile: 1.2, base: 700, perKm: 800, hot: true, give: 'Ordonnance urgente de la pharmacie. Ne traîne pas, c’est pour un malade !', get: 'Allah soit loué, tu es arrivé à temps. Merci beaucoup !' },
    { item: 'Attaya et pain', icon: '🍵', fragile: 1.6, base: 400, perKm: 650, give: 'Le thé et le pain pour les amis du grin. Attention, ça se renverse !', get: 'Le thé est encore bien chaud, parfait pour le grin !' },
    { item: 'Dossiers', icon: '📁', fragile: 0.8, base: 500, perKm: 700, give: 'Les dossiers à déposer à l’administration avant la fermeture !', get: 'Parfait, c’est dans les temps. Merci, jeune homme !' },
    { item: 'Colis de la boutique', icon: '📦', fragile: 1.0, base: 450, perKm: 700, give: 'Un colis de la boutique à livrer au client. Soigne-le bien !', get: 'Mon colis ! Merci, c’était rapide !' },
  ],
  tricycle: [
    { item: 'Sacs de charbon', icon: '🪵', fragile: 0.7, base: 600, perKm: 600, give: 'Les sacs de charbon pour la vendeuse du quartier. C’est lourd, doucement !', get: 'Merci, avec ça je vais vendre toute la semaine.' },
    { item: 'Bidons d’eau', icon: '💧', fragile: 1.1, base: 500, perKm: 550, give: 'Des bidons d’eau pour la famille. Ne les renverse pas !', get: 'De l’eau fraîche, merci mon frère !' },
    { item: 'Légumes du marché', icon: '🥬', fragile: 1.4, base: 600, perKm: 600, give: 'Salades, tomates et oignons pour la vendeuse du marché. Ça se fane vite !', get: 'Frais comme ce matin, merci !' },
    { item: 'Mil et arachides', icon: '🌾', fragile: 0.8, base: 650, perKm: 600, give: 'Mil et arachides à porter à la boutique. Bonne route !', get: 'Merci, ta livraison arrive au bon moment.' },
  ],
  pickup: [
    { item: 'Moutons de Tabaski', icon: '🐑', fragile: 1.4, base: 1500, perKm: 900, give: 'Deux beaux moutons pour la Tabaski ! Ne freine pas trop fort, ils sont nerveux.', get: 'Quels beaux moutons ! Que Dieu t’accorde une longue vie, voilà.' },
    { item: 'Tomates du Grand Marché', icon: '🍅', fragile: 1.5, base: 1200, perKm: 800, give: 'Les caisses de tomates pour la revendeuse. Elles sont fragiles, hein !', get: 'Pas une tomate abîmée, bravo chauffeur !' },
    { item: 'Matériaux de chantier', icon: '🧱', fragile: 0.7, base: 1500, perKm: 900, give: 'Briques et fer à béton pour le chantier. Ça tient bien, tu peux rouler.', get: 'Le maçon t’attendait. Merci, voilà ton argent.' },
  ],
  truck: [
    { item: 'Sacs de ciment', icon: '🧱', fragile: 0.6, base: 3000, perKm: 1300, give: 'Du ciment pour le chantier de Bamako. La charge est bien arrimée, bonne route.', get: 'Le ciment est arrivé, les maçons peuvent travailler. Merci !' },
    { item: 'Mangues de Sikasso', icon: '🥭', fragile: 1.5, base: 3200, perKm: 1400, hot: true, give: 'Les mangues de Sikasso pour le marché. Elles mûrissent vite : roule sans secousses !', get: 'Magnifiques mangues, pas une de gâtée ! Voilà ton salaire.' },
    { item: 'Sacs de riz', icon: '🌾', fragile: 0.8, base: 3000, perKm: 1300, give: 'Le riz de l’Office du Niger pour les grossistes. Charge lourde, prudence aux virages.', get: 'Le riz est bien arrivé. Merci, le grossiste est content.' },
    { item: 'Beurre de karité', icon: '🧴', fragile: 1.2, base: 3200, perKm: 1300, give: 'Les bidons de beurre de karité des coopératives de femmes. Ne les secoue pas.', get: 'Du beurre de karité de qualité, merci pour le transport !' },
  ],
};
export const pickJob = kind => { const a = JOBS[kind]; return a[(Math.random()*a.length) | 0]; };

/** phrases de l'apprenti du sotrama (« le gaindé ») */
export const SOTRAMA_CALLS = ['Bamako ! Bamako ! Monte, monte, il reste des places !', 'Vite vite, ça part ! Direction {last} !', 'Une place devant, une place derrière !'];
