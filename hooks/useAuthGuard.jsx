// hooks/useAuthGuard.jsx
import { useUserStore } from "../store/users";
import { useRouter } from "expo-router";
import { useEffect } from "react";

/**
 * Protège une page : redirige vers "/" si user non connecté.
 * Retourne le user, ou null si on redirige.
 */
export function useAuthGuard() {
  const { user } = useUserStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      setTimeout(() => router.replace("/"), 0);
    }
  }, [user, router]);

  return user;
}
