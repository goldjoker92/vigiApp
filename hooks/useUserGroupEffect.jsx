import { useEffect } from "react";
import { useUserStore } from "../store/users";
import { getUserGroupId } from "../utils/getUserGroupId";

/**
 * Hook: recharge le groupId quand l'utilisateur se connecte/déconnecte
 */
export function useUserGroupEffect() {
  const user = useUserStore((s) => s.user);
  const groupId = useUserStore((s) => s.groupId);
  const setGroupId = useUserStore((s) => s.setGroupId);

  useEffect(() => {
    if (user?.id && !groupId) {
      getUserGroupId(user.id).then((foundGroupId) => {
        setGroupId(foundGroupId);
        console.log("[useUserGroupEffect] GroupId rechargé après login/boot:", foundGroupId);
      });
    }
    if (!user?.id) {
      setGroupId(null);
      console.log("[useUserGroupEffect] User déconnecté, groupId reset");
    }
  }, [user?.id, groupId, setGroupId]);
}
