import { useEffect } from "react";
import { useUserStore } from "../store/users";
import { getUserGroupId } from "../utils/getUserGroupId";

/**
 * Hook: recharge le groupId quand l'utilisateur se connecte/déconnecte
 * et gère l'état du skeleton isGroupLoading.
 */
export function useUserGroupEffect() {
  const user = useUserStore((s) => s.user);
  const groupId = useUserStore((s) => s.groupId);
  const setGroupId = useUserStore((s) => s.setGroupId);
  const setIsGroupLoading = useUserStore((s) => s.setIsGroupLoading);

  useEffect(() => {
    if (user?.id && !groupId) {
      setIsGroupLoading(true);
      getUserGroupId(user.id)
        .then((foundGroupId) => {
          setGroupId(foundGroupId);
          console.log("[useUserGroupEffect] GroupId rechargé après login/boot:", foundGroupId);
        })
        .finally(() => {
          setIsGroupLoading(false);
        });
    }
    if (!user?.id) {
      setGroupId(null);
      setIsGroupLoading(false);
      console.log("[useUserGroupEffect] User déconnecté, groupId reset");
    }
  }, [user?.id, groupId, setGroupId, setIsGroupLoading]);
}
