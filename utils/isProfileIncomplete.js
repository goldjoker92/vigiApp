// /utils/isProfileIncomplete.js

export function isProfileIncomplete(user) {
  if (!user) {return true;} // aucun utilisateur connecté

  // Ajoute ici tous les champs essentiels
  if (!user.apelido || user.apelido.length < 2) {return true;}
  if (!user.cep || user.cep.length < 5) {return true;}
  if (!user.cpf || user.cpf.length < 8) {return true;}
  // Ajoute d'autres conditions si tu veux (ex: nom, etc)

  return false; // profil complet
}
// Utilise cette fonction pour vérifier si le profil est complet avant de naviguer vers certaines pages
// Par exemple dans le useEffect de TabsLayout.jsx
