// src/hooks/useQueueOfflineActions.js
import { useRef } from "react";

export function useQueueOfflineActions({ isOnline, onFlush }) {
  // Queue locale en mémoire (tu peux la brancher à AsyncStorage si tu veux persister)
  const queue = useRef([]);

  // Ajoute une action à la queue
  const enqueue = (action) => {
    queue.current.push(action);
  };

  // Quand la connexion revient, on flush la queue
  if (isOnline && queue.current.length > 0) {
    while (queue.current.length > 0) {
      const action = queue.current.shift();
      onFlush?.(action);
    }
  }

  return enqueue;
}
// src/hooks/useQueueOfflineActions.js  