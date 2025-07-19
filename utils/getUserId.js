// utils/getUserId.js
export function getUserId(user) {
  return user?.id || user?.uid;
}
// Assure-toi que l'utilisateur a un identifiant valide
// Utilise cette fonction pour obtenir l'ID de l'utilisateur dans d'autres parties de l'application
// Exemple d'utilisation : const userId = getUserId(currentUser);   