import { useAuth } from "../lib/auth";
import UserTable from "../components/UserTable";
import { Button, Center, Box } from "@chakra-ui/react";

export default function UsersPage() {
  const { user, isAdmin, logout } = useAuth();

  if (!user || !isAdmin)
    return (
      <Center h="100vh">
        <Box textAlign="center">
          <p>Accès refusé (admin uniquement).</p>
          <Button mt={6} onClick={logout}>Se déconnecter</Button>
        </Box>
      </Center>
    );
  return (
    <Box p={5}>
      <UserTable />
      <Button mt={8} variant="outline" onClick={logout}>
        Se déconnecter
      </Button>
    </Box>
  );
}
