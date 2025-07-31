import { useAuth } from "../lib/auth";
import DashboardStats from "../components/DashboardStats";
import ContactAdmin from "../components/ContactAdmin";
import { Button, Center, Box } from "@chakra-ui/react";

export default function Home() {
  const { user, isAdmin, login, logout } = useAuth();

  if (!user)
    return (
      <Center h="100vh">
        <Button size="lg" colorScheme="yellow" onClick={login}>
          Se connecter avec Google
        </Button>
      </Center>
    );
  if (!isAdmin)
    return (
      <Center h="100vh">
        <Box textAlign="center">
          <p>Accès refusé (admin uniquement).</p>
          <Button mt={6} onClick={logout}>
            Se déconnecter
          </Button>
        </Box>
      </Center>
    );
  return (
    <Box p={5}>
      <DashboardStats />
      <ContactAdmin />
      <Button mt={8} variant="outline" onClick={logout}>
        Se déconnecter
      </Button>
    </Box>
  );
}
