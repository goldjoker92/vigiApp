// /components/ExportCSVButton.jsx
import { Button } from "@chakra-ui/react";
import { exportStatsCSV } from "../lib/api";

export default function ExportCSVButton({ filters }) {
  const handleExport = async () => {
    const csv = await exportStatsCSV(filters);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stats-vigiapp-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Button size="sm" colorScheme="yellow" ml={2} onClick={handleExport}>
      Exporter CSV
    </Button>
  );
}
// /components/ExportCSVButton.jsx