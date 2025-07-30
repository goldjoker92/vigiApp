/**
 * 🔥 VigiApp – Automatisation Purge & Archivage (Cloud Functions Firebase)
 * FR: Automatisation de la purge et archivage des demandes d'aide
 * EN: Automated purge and archive of help requests
 * PT: Automação de limpeza e arquivamento dos pedidos de ajuda
 */

// ======== Dépendances / Dependencies / Dependências ========
const functions = require("firebase-functions");        // FR: Fonctions cloud Firebase | EN: Cloud Functions | PT: Funções do Firebase
const v1functions = require("firebase-functions/v1");   // FR: API v1 pour scheduled functions | EN: v1 API for scheduled functions | PT: API v1 para funções agendadas
const admin = require("firebase-admin");                // FR: Accès Firestore | EN: Firestore access | PT: Acesso ao Firestore
const dayjs = require("dayjs");                         // FR: Manipulation dates | EN: Date handling | PT: Manipulação de datas

admin.initializeApp();                                  // FR: Initialisation SDK | EN: SDK init | PT: Inicialização do SDK
const db = admin.firestore();                           // FR: Ref Firestore | EN: Firestore ref | PT: Ref Firestore

// ======== Utilitaires / Utilities / Utilitários ========

/**
 * 🛡️ Wrapper de gestion d'erreurs pour fonctions
 * @param {string} functionName - Nom de la fonction
 * @param {Function} callback - Fonction à exécuter
 */
const errorHandlingWrapper = async (functionName, callback) => {
  try {
    return await callback();
  } catch (error) {
    console.error(`❌ Erreur dans ${functionName}: ${error.message}`);
    
    // Log l'erreur dans Firestore pour suivi
    await db.collection("errorLogs").add({
      functionName: functionName,
      error: error.message,
      stack: error.stack,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return null;
  }
};

// ======== Fonctions planifiées / Scheduled functions / Funções agendadas ========

/**
 * 🧹 purgeAndArchiveOldRequests
 * FR: Purge et archive automatiquement toutes les demandes d'aide ("groupHelps") de +5 jours.
 * EN: Automatically purges and archives all help requests ("groupHelps") older than 5 days.
 * PT: Limpa e arquiva automaticamente todos os pedidos de ajuda ("groupHelps") com mais de 5 dias.
 */
exports.purgeAndArchiveOldRequests = v1functions.pubsub
  .schedule("every 24 hours") // FR: Planifié chaque jour | EN: Scheduled daily | PT: Agendado todo dia
  .timeZone("America/Fortaleza") // FR: Change si besoin | EN: Change if needed | PT: Mude se necessário
  .onRun(async (context) => {
    return await errorHandlingWrapper("purgeAndArchiveOldRequests", async () => {
      // 1️⃣ Date limite il y a 5 jours
      const cutoff = dayjs().subtract(5, "day").toDate();

      // 2️⃣ Recherche demandes trop vieilles
      const oldRequestsSnap = await db
        .collection("groupHelps")
        .where("createdAt", "<", cutoff)
        .get();

      // 3️⃣ Si rien à faire, log & stop
      if (oldRequestsSnap.empty) {
        console.log("Aucune demande à archiver/purger ! / No requests to archive! / Nenhum pedido para arquivar!");
        await db.collection("purgeLogs").add({
          type: "purge",
          archivedCount: 0,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          note: "Aucune demande à purger / No requests to purge / Nenhum pedido para limpar"
        });
        return null;
      }

      // 4️⃣ Archivage + suppression par lots
      let archiveCount = 0;
      let batch = db.batch();
      let opInBatch = 0;

      for (const doc of oldRequestsSnap.docs) {
        const data = doc.data();
        const archiveRef = db.collection("archivedGroupHelps").doc(doc.id);
        batch.set(archiveRef, {
          ...data,
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.delete(doc.ref);
        archiveCount++;
        opInBatch += 2; // Un set + un delete

        if (opInBatch >= 400) {
          await batch.commit();
          batch = db.batch();
          opInBatch = 0;
        }
      }
      if (opInBatch > 0) {
        await batch.commit();
      }

      console.log(`✅ Archivé et supprimé ${archiveCount} demandes anciennes.`);

      // 5️⃣ Log Firestore pour suivi
      await db.collection("purgeLogs").add({
        type: "purge",
        archivedCount: archiveCount,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        note: "Purge automatique terminée / Automatic purge done / Limpeza automática concluída"
      });

      return null;
    });
  });

/**
 * 📊 Statistiques quotidiennes
 * FR: Calcule et enregistre les statistiques quotidiennes des demandes d'aide
 * EN: Calculates and stores daily help request statistics
 * PT: Calcula e armazena estatísticas diárias de pedidos de ajuda
 */
exports.dailyHelpRequestStats = v1functions.pubsub
  .schedule("every day 23:30")
  .timeZone("America/Fortaleza")
  .onRun(async (context) => {
    return await errorHandlingWrapper("dailyHelpRequestStats", async () => {
      // Date d'aujourd'hui à minuit
      const today = dayjs().startOf('day').toDate();
      const yesterday = dayjs().subtract(1, 'day').startOf('day').toDate();
      
      // Requêtes créées aujourd'hui
      const todayRequestsSnap = await db
        .collection("groupHelps")
        .where("createdAt", ">=", yesterday)
        .where("createdAt", "<", today)
        .get();
      
      // Compter par statut
      let stats = {
        total: todayRequestsSnap.size,
        open: 0,
        closed: 0,
        cancelled: 0,
        scheduled: 0,
        date: yesterday,
      };
      
      todayRequestsSnap.forEach(doc => {
        const status = doc.data().status;
        if (status === "open") stats.open++;
        else if (status === "closed") stats.closed++;
        else if (status === "cancelled") stats.cancelled++;
        else if (status === "scheduled") stats.scheduled++;
      });
      
      // Enregistrer les stats
      await db.collection("helpRequestStats").add({
        ...stats,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`📊 Stats du jour enregistrées: ${stats.total} demandes d'aide`);
      return null;
    });
  });

// ======== API HTTP / Endpoints REST / API REST ========

/**
 * 📋 Exporter les statistiques en CSV
 * FR: Permet d'exporter les statistiques des demandes d'aide au format CSV
 * EN: Export help request statistics in CSV format
 * PT: Exportar estatísticas de pedidos de ajuda em formato CSV
 */
exports.exportStatisticsCSV = functions.https.onRequest(async (req, res) => {
  return await errorHandlingWrapper("exportStatisticsCSV", async () => {
    // Paramètre optionnel pour définir le nombre de jours
    const days = parseInt(req.query.days || "30");
    const cutoffDate = dayjs().subtract(days, "day").toDate();
    
    // Récupérer les statistiques
    const statsSnap = await db.collection("helpRequestStats")
      .where("date", ">=", cutoffDate)
      .orderBy("date", "desc")
      .get();
    
    if (statsSnap.empty) {
      res.status(404).send("Aucune statistique trouvée / No statistics found / Nenhuma estatística encontrada");
      return null;
    }
    
    // Créer l'en-tête CSV
    let csv = "Date,Total,Ouvert,Fermé,Annulé,Planifié\n";
    
    // Ajouter chaque ligne
    statsSnap.forEach(doc => {
      const data = doc.data();
      const dateStr = data.date ? dayjs(data.date.toDate()).format("YYYY-MM-DD") : "N/A";
      csv += `${dateStr},${data.total},${data.open},${data.closed},${data.cancelled},${data.scheduled}\n`;
    });
    
    // Définir les headers pour le téléchargement
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=vigiapp-stats-${dayjs().format("YYYY-MM-DD")}.csv`);
    res.status(200).send(csv);
    
    console.log(`✅ Export CSV généré: ${statsSnap.size} jours de statistiques`);
    return null;
  });
});

/**
 * 📱 Récupérer les dernières statistiques (JSON)
 * FR: API pour récupérer les statistiques récentes au format JSON
 * EN: API to get recent statistics in JSON format
 * PT: API para obter estatísticas recentes em formato JSON
 */
exports.getRecentStats = functions.https.onRequest(async (req, res) => {
  return await errorHandlingWrapper("getRecentStats", async () => {
    // Paramètre optionnel pour limiter le nombre de jours
    const limit = parseInt(req.query.limit || "7");
    
    // Récupérer les statistiques récentes
    const statsSnap = await db.collection("helpRequestStats")
      .orderBy("date", "desc")
      .limit(limit)
      .get();
    
    // Formater les données pour JSON
    const stats = statsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        date: data.date ? data.date.toDate().toISOString() : null,
        total: data.total,
        open: data.open,
        closed: data.closed,
        cancelled: data.cancelled,
        scheduled: data.scheduled
      };
    });
    
    // Autoriser les requêtes cross-origin
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      success: true,
      count: stats.length,
      stats: stats
    });
    
    console.log(`📊 API: ${stats.length} jours de statistiques récupérés`);
    return null;
  });
});

/**
 * 🔍 Recherche dans les archives
 * FR: Permet de rechercher dans les demandes archivées
 * EN: Search in archived requests
 * PT: Pesquisar nos pedidos arquivados
 */
exports.searchArchivedRequests = functions.https.onRequest(async (req, res) => {
  return await errorHandlingWrapper("searchArchivedRequests", async () => {
    const { query, userId, status, limit } = req.query;
    const maxResults = limit ? parseInt(limit) : 20;
    
    // Construire la requête de base
    let dbQuery = db.collection("archivedGroupHelps");
    
    // Ajouter les filtres si présents
    if (userId) {
      dbQuery = dbQuery.where("userId", "==", userId);
    }
    
    if (status) {
      dbQuery = dbQuery.where("status", "==", status);
    }
    
    // Toujours trier par date d'archivage
    dbQuery = dbQuery.orderBy("archivedAt", "desc").limit(maxResults);
    
    // Exécuter la requête
    const snapshot = await dbQuery.get();
    
    // Formater les résultats
    const results = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        apelido: data.apelido || "Anônimo",
        message: data.message || "",
        status: data.status || "unknown",
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
        archivedAt: data.archivedAt ? data.archivedAt.toDate().toISOString() : null
      };
    });
    
    // Filtrer par texte si nécessaire (côté client car Firestore n'a pas de recherche texte native)
    let filteredResults = results;
    if (query && query.length > 0) {
      const searchLower = query.toLowerCase();
      filteredResults = results.filter(item => 
        (item.message && item.message.toLowerCase().includes(searchLower)) ||
        (item.apelido && item.apelido.toLowerCase().includes(searchLower))
      );
    }
    
    // Renvoyer les résultats
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      success: true,
      count: filteredResults.length,
      results: filteredResults
    });
    
    console.log(`🔍 Recherche dans les archives: ${filteredResults.length} résultats`);
    return null;
  });
});

/**
 * 📝 Exporter les demandes d'aide récentes en CSV
 * FR: Permet d'exporter les demandes d'aide récentes au format CSV
 * EN: Export recent help requests in CSV format
 * PT: Exportar pedidos de ajuda recentes em formato CSV
 */
exports.exportHelpRequestsCSV = functions.https.onRequest(async (req, res) => {
  return await errorHandlingWrapper("exportHelpRequestsCSV", async () => {
    // Paramètres optionnels
    const days = parseInt(req.query.days || "7");
    const cutoff = dayjs().subtract(days, "day").toDate();
    
    // Récupérer les données
    const requestsSnap = await db.collection("groupHelps")
      .where("createdAt", ">", cutoff)
      .orderBy("createdAt", "desc")
      .get();
    
    // Créer CSV
    let csv = "ID,Data,Status,Apelido,Mensagem,Agendamento,Grupo\n";
    
    requestsSnap.forEach(doc => {
      const data = doc.data();
      csv += `"${doc.id}","${data.createdAt ? dayjs(data.createdAt.toDate()).format('DD/MM/YYYY HH:mm') : ''}","${data.status || ''}","${data.apelido || ''}","${(data.message || '').replace(/"/g, '""')}","${data.dateHelp ? dayjs(data.dateHelp.toDate()).format('DD/MM/YYYY HH:mm') : ''}","${data.groupId || ''}"\n`;
    });
    
    // Envoyer le CSV
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="vigiapp-requests-${dayjs().format('YYYY-MM-DD')}.csv"`);
    res.status(200).send(csv);
    
    console.log(`📝 Export CSV généré: ${requestsSnap.size} demandes d'aide`);
    return null;
  });
});

/**
 * 📈 Dashboard simple des statistiques
 * FR: Fournit une page HTML simple pour visualiser les statistiques
 * EN: Provides a simple HTML page to visualize statistics
 * PT: Fornece uma página HTML simples para visualizar estatísticas
 */
exports.simpleDashboard = functions.https.onRequest(async (req, res) => {
  return await errorHandlingWrapper("simpleDashboard", async () => {
    // Récupérer les 30 derniers jours de statistiques
    const statsSnap = await db.collection("helpRequestStats")
      .orderBy("date", "desc")
      .limit(30)
      .get();
    
    // Formater les données pour le graphique
    const stats = statsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        date: data.date ? dayjs(data.date.toDate()).format("DD/MM") : "N/A",
        total: data.total,
        open: data.open,
        closed: data.closed,
        cancelled: data.cancelled,
        scheduled: data.scheduled
      };
    }).reverse(); // Ordre chronologique
    
    // Créer la page HTML avec un graphique simple
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>VigiApp - Statistiques</title>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #4285f4; }
        .chart-container { margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📊 VigiApp - Statistiques</h1>
        <div class="chart-container">
          <canvas id="statsChart"></canvas>
        </div>
        
        <h2>Données des 30 derniers jours</h2>
        <table>
          <tr>
            <th>Date</th>
            <th>Total</th>
            <th>Ouvert</th>
            <th>Fermé</th>
            <th>Annulé</th>
            <th>Planifié</th>
          </tr>
          ${stats.map(day => `
            <tr>
              <td>${day.date}</td>
              <td>${day.total}</td>
              <td>${day.open}</td>
              <td>${day.closed}</td>
              <td>${day.cancelled}</td>
              <td>${day.scheduled}</td>
            </tr>
          `).join('')}
        </table>
        
        <p style="margin-top: 20px;">
          <a href="/exportStatisticsCSV">📥 Télécharger en CSV</a> | 
          <a href="/getRecentStats">🔄 Voir en JSON</a>
        </p>
      </div>
      
      <script>
        // Données pour le graphique
        const data = ${JSON.stringify(stats)};
        
        // Créer le graphique
        const ctx = document.getElementById('statsChart').getContext('2d');
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: data.map(d => d.date),
            datasets: [
              {
                label: 'Total',
                data: data.map(d => d.total),
                borderColor: '#4285f4',
                fill: false
              },
              {
                label: 'Ouvert',
                data: data.map(d => d.open),
                borderColor: '#fbbc05',
                fill: false
              },
              {
                label: 'Fermé',
                data: data.map(d => d.closed),
                borderColor: '#34a853',
                fill: false
              },
              {
                label: 'Annulé',
                data: data.map(d => d.cancelled),
                borderColor: '#ea4335',
                fill: false
              },
              {
                label: 'Planifié',
                data: data.map(d => d.scheduled),
                borderColor: '#9c27b0',
                fill: false
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      </script>
    </body>
    </html>
    `;
    
    // Définir le content-type et envoyer la page
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
    
    console.log(`📈 Dashboard généré avec ${stats.length} jours de données`);
    return null;
  });
});