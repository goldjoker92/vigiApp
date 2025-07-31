// /components/FiltersPanel.jsx
import { HStack, Input, Select, Button } from "@chakra-ui/react";

export default function FiltersPanel({ filters, setFilters }) {
  return (
    <HStack spacing={3} mb={3}>
      <Input
        type="date"
        value={filters.startDate || ""}
        onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
        placeholder="Date début"
      />
      <Input
        type="date"
        value={filters.endDate || ""}
        onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
        placeholder="Date fin"
      />
      <Select
        placeholder="Statut"
        value={filters.status || ""}
        onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
      >
        <option value="open">Ouvert</option>
        <option value="closed">Fermé</option>
        <option value="cancelled">Annulé</option>
        <option value="scheduled">Planifié</option>
      </Select>
      <Button variant="outline" onClick={() => setFilters({})}>Réinitialiser</Button>
    </HStack>
  );
}
