// /lib/api.js
// 🇫🇷 Fonctions pour appeler tes Cloud Functions REST (stats, users, logs, etc.)
// 🇧🇷 Funções para consumir Cloud Functions REST (stats, usuários, logs, etc.)

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://us-central1-TON_PROJET.cloudfunctions.net";

// Récupérer les stats récentes
export const fetchStats = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/getRecentStats?${query}`);
  if (!res.ok) throw new Error("Erreur API stats");
  return await res.json();
};

// Exporter CSV
export const exportStatsCSV = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/exportStatisticsCSV?${query}`);
  if (!res.ok) throw new Error("Erreur export CSV");
  return await res.text();
};

// Récupérer les utilisateurs/logs
export const fetchUsers = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/getUsers?${query}`);
  if (!res.ok) throw new Error("Erreur API users");
  return await res.json();
};

// Ajouter d’autres fonctions ici...
// Récupérer les logs
export const fetchLogs = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/getLogs?${query}`);
  if (!res.ok) throw new Error("Erreur API logs");
  return await res.json();
};
// Récupérer les détails d'un utilisateur
export const fetchUserDetails = async (userId) => {                                 
  const res = await fetch(`${API_BASE}/getUserDetails?userId=${userId}`);
  if (!res.ok) throw new Error("Erreur API user details");
  return await res.json();
}  