// src/hooks/usePersistentQueue.js
import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@offlineQueue";

export function usePersistentQueue({ isOnline, onFlush }) {
  const queue = useRef([]);

  // Charger la queue depuis AsyncStorage au démarrage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) queue.current = JSON.parse(data);
    });
  }, []);

  // Enregistrer la queue à chaque changement
  const saveQueue = () => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue.current));
  };

  // Ajouter une action
  const enqueue = (action) => {
    queue.current.push(action);
    saveQueue();
  };

  // Si la connexion revient, flush et nettoie la queue persistée
  useEffect(() => {
    if (isOnline && queue.current.length > 0) {
      (async () => {
        while (queue.current.length > 0) {
          const action = queue.current.shift();
          await onFlush?.(action);
        }
        saveQueue();
      })();
    }
  }, [isOnline, onFlush]);

  return enqueue;
}
