// /components/DashboardStats.jsx
import React, { useEffect, useState } from "react";
import { Box, Heading, useColorMode, Table, Thead, Tbody, Tr, Th, Td, Spinner, Button } from "@chakra-ui/react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";
import { fetchStats } from "../lib/api";
import FiltersPanel from "./FilterPanel";
import ExportCSVButton from "./ExportCSVButton";
import ToastNotify from "./ToastNotify";

export default function DashboardStats() {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [toast, setToast] = useState(null);
  const { colorMode, toggleColorMode } = useColorMode();

  useEffect(() => {
    setLoading(true);
    fetchStats(filters)
      .then(data => { setStats(data.stats || []); setLoading(false); })
      .catch(() => { setLoading(false); setToast("Erreur de chargement stats"); });
  }, [filters]);

  const chartData = {
    labels: stats.map(d => d.date?.slice(0, 10)),
    datasets: [
      { label: "Total", data: stats.map(d => d.total), borderColor: "#FFD600", tension: 0.35 },
      { label: "Ouvert", data: stats.map(d => d.open), borderColor: "#B2EC6B", tension: 0.35 },
      { label: "Fermé", data: stats.map(d => d.closed), borderColor: "#34a853", tension: 0.35 },
    ],
  };

  return (
    <Box p={5}>
      <Heading mb={3} color="#FFD600" fontSize="2xl">📊 Statistiques VigiApp</Heading>
      <Button size="sm" onClick={toggleColorMode} mb={3}>
        {colorMode === "light" ? "Mode sombre" : "Mode clair"}
      </Button>
      <FiltersPanel filters={filters} setFilters={setFilters} />
      <ExportCSVButton filters={filters} />
      {loading ? <Spinner size="xl" /> : (
        <>
          <Box maxW="100%" overflowX="auto" mb={6}><Line data={chartData} height={110} /></Box>
          <Table size="sm"><Thead><Tr>
            <Th>Date</Th><Th>Total</Th><Th>Ouvert</Th><Th>Fermé</Th><Th>Annulé</Th><Th>Planifié</Th>
          </Tr></Thead><Tbody>
            {stats.map((d, i) => <Tr key={i}>
              <Td>{new Date(d.date).toLocaleDateString("fr-FR")}</Td>
              <Td>{d.total}</Td><Td>{d.open}</Td><Td>{d.closed}</Td>
              <Td>{d.cancelled}</Td><Td>{d.scheduled}</Td>
            </Tr>)}
          </Tbody></Table>
        </>
      )}
      <ToastNotify message={toast} onClose={() => setToast(null)} />
    </Box>
  );
}
