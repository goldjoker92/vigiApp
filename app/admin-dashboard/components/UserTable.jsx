// /components/UserTable.jsx
import { useEffect, useState } from "react";
import { Table, Thead, Tbody, Tr, Th, Td, Box } from "@chakra-ui/react";
import { fetchUsers } from "../lib/api";
import SkeletonBox from "./SkeletonBox";

export default function UserTable() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers().then(data => {
      setUsers(data.users || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonBox />;

  return (
    <Box mt={8}>
      <Table size="sm">
        <Thead>
          <Tr><Th>ID</Th><Th>Email</Th><Th>Nom</Th><Th>Statut</Th><Th>Dernière activité</Th></Tr>
        </Thead>
        <Tbody>
          {users.map(u => (
            <Tr key={u.id}>
              <Td>{u.id}</Td>
              <Td>{u.email}</Td>
              <Td>{u.name}</Td>
              <Td>{u.status}</Td>
              <Td>{u.lastActive}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
}
