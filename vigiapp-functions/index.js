/**
 * 🔥 VigiApp – Função de Purga e Arquivamento Automático
 * (index.js – Cloud Functions Firebase)
 *
 * Esta função:
 * - Arquiva e apaga todas as solicitações de ajuda ("groupHelps") com mais de 5 dias
 * - Arquiva e apaga todos os chats ("chats") relacionados à solicitação
 * - Mantém um histórico mínimo (contexto) em collections separadas
 * - Não guarda mensagens (privacidade forte)
 * 
 * 📁 A colocar no arquivo: functions/index.js
 */

const v1functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const dayjs = require("dayjs");

admin.initializeApp();
const db = admin.firestore();

/**
 * 🛡️ Wrapper para tratamento de erros
 */
const errorHandlingWrapper = async (functionName, callback) => {
  try {
    return await callback();
  } catch (error) {
    console.error(`❌ Erro em ${functionName}: ${error.message}`);
    await db.collection("errorLogs").add({
      functionName,
      error: error.message,
      stack: error.stack,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    return null;
  }
};

/**
 * 🧹 purgeAndArchiveOldRequestsAndChats
 * 
 * FR: Purge et archive toutes les demandes d'aide ("groupHelps") de +5 jours 
 *     et tous les chats ("chats") associés, dans la même tâche.
 * PT: Limpa e arquiva todas as solicitações de ajuda ("groupHelps") com mais de 5 dias 
 *     e todos os chats ("chats") ligados, na mesma função.
 * 
 * Cette fonction s’exécute **tous les jours** et fait :
 * - Cherche toutes les demandes d’aide vieilles de +5 jours
 * - Pour chacune, archive tous les chats associés (sans messages)
 * - Supprime les messages et les docs chats
 * - Archive puis supprime la demande d’aide
 * - Logue tout dans `purgeLogs` et erreurs dans `errorLogs`
 */
exports.purgeAndArchiveOldRequestsAndChats = v1functions.pubsub
  .schedule("every 24 hours")
  .timeZone("America/Fortaleza")
  .onRun(async (context) => {
    return await errorHandlingWrapper("purgeAndArchiveOldRequestsAndChats", async () => {
      // Data limite (5 dias atrás)
      const cutoff = dayjs().subtract(5, "day").toDate();

      // 1️⃣ Procurar todas as solicitações antigas
      const oldRequestsSnap = await db
        .collection("groupHelps")
        .where("createdAt", "<", cutoff)
        .get();

      if (oldRequestsSnap.empty) {
        console.log("Nenhuma solicitação antiga para arquivar/limpar.");
        await db.collection("purgeLogs").add({
          type: "purge",
          archivedCount: 0,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          note: "Nenhuma solicitação para purgar"
        });
        return null;
      }

      let archiveCount = 0;

      // 2️⃣ Para cada solicitação...
      for (const demandaDoc of oldRequestsSnap.docs) {
        const demandaId = demandaDoc.id;
        const demandaData = demandaDoc.data();

        // 3️⃣ ARCHIVAR E APAGAR OS CHATS RELACIONADOS
        const chatsSnap = await db.collection("chats")
          .where("demandaId", "==", demandaId)
          .get();

        for (const chatDoc of chatsSnap.docs) {
          const chatData = chatDoc.data();

          // Arquivar contexto do chat (sem mensagens)
          await db.collection("chatsArquivados").doc(chatDoc.id).set({
            ...chatData,
            archivedAt: admin.firestore.FieldValue.serverTimestamp(),
            motivo: "Solicitação expirada – purga sincronizada"
          });

          // Apagar todas as mensagens (subcoleção "mensagens")
          const mensagensSnap = await db.collection("chats").doc(chatDoc.id).collection("mensagens").get();
          for (const msg of mensagensSnap.docs) {
            await msg.ref.delete();
          }

          // Apagar o chat principal
          await chatDoc.ref.delete();
        }

        // 4️⃣ ARCHIVAR A SOLICITAÇÃO (após os chats, para garantir sincronismo)
        await db.collection("archivedGroupHelps").doc(demandaId).set({
          ...demandaData,
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 5️⃣ APAGAR A SOLICITAÇÃO original
        await demandaDoc.ref.delete();

        archiveCount++;
      }

      console.log(`✅ ${archiveCount} solicitações e todos os chats relacionados arquivados/apagados.`);

      // 6️⃣ Log no Firestore para rastreamento
      await db.collection("purgeLogs").add({
        type: "purge",
        archivedCount: archiveCount,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        note: "Purge automática – solicitações e chats sincronizados"
      });

      return null;
    });
  });

/**
 * ✨ EXPLICATION (FR)
 * - Ce fichier index.js gère la purge quotidienne et l’archivage automatique des demandes d’aide et de leurs chats liés
 * - Archivage = on garde uniquement le contexte (pas les messages)
 * - Les messages privés sont effacés (privacy by design)
 * - Logs d’opération et logs d’erreur centralisés
 * - Aucun chat ne survit à la demande d’aide !
 *
 * ✨ EXPLICAÇÃO (PT)
 * - Este arquivo index.js faz a limpeza diária e o arquivamento automático dos pedidos de ajuda e seus chats relacionados
 * - O arquivamento guarda só o contexto (sem mensagens)
 * - Mensagens privadas são apagadas (privacidade máxima)
 * - Logs de operação e logs de erro ficam centralizados
 * - Nenhum chat sobrevive à solicitação!
 */
