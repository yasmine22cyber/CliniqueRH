import { useMemo } from "react";
import BISlicer from "./BISlicer";

const DEFAULT_PERIOD_OPTIONS = [
  { id: "7", label: "7 derniers jours" },
  { id: "30", label: "30 derniers jours" },
  { id: "90", label: "3 derniers mois" },
  { id: "365", label: "12 derniers mois" },
];

export default function BIFiltersPanel({
  contractOptions = [],
  contractFilter = "all",
  onContractChange,
  onContractReset,
  serviceOptions = [],
  serviceFilter = "all",
  onServiceChange,
  onServiceReset,
  periodFilter = "30",
  onPeriodChange,
  periodOptions = DEFAULT_PERIOD_OPTIONS,
}) {
  const contractItems = useMemo(
    () => (Array.isArray(contractOptions) ? contractOptions.filter((opt) => String(opt?.id) !== "all") : []),
    [contractOptions],
  );
  const serviceItems = useMemo(
    () => (Array.isArray(serviceOptions) ? serviceOptions.filter((opt) => String(opt?.id) !== "all") : []),
    [serviceOptions],
  );
  const periodItems = useMemo(
    () => (Array.isArray(periodOptions) ? periodOptions : []),
    [periodOptions],
  );

  return (
    <div className="admin-bi-top-controls">
      <div className="admin-bi-slicer-grid">
        <BISlicer
          title="Type de contrat"
          className="admin-bi-slicer-contract"
          options={contractItems}
          value={contractFilter}
          onChange={onContractChange}
          onReset={onContractReset}
          resetDisabled={contractFilter === "all"}
          emptyLabel="Aucun type"
          ariaLabel="Filtre type de contrat"
        />

        <BISlicer
          title="Service"
          className="admin-bi-slicer-service"
          options={serviceItems}
          value={serviceFilter}
          onChange={onServiceChange}
          onReset={onServiceReset}
          resetDisabled={serviceFilter === "all"}
          emptyLabel="Aucun service"
          ariaLabel="Filtre service"
        />

        <BISlicer
          title="Periode"
          className="admin-bi-slicer-period"
          options={periodItems}
          value={periodFilter}
          onChange={onPeriodChange}
          onReset={() => onPeriodChange?.("30")}
          resetLabel="Defaut"
          resetDisabled={String(periodFilter) === "30"}
          emptyLabel="Aucune periode"
          ariaLabel="Filtre periode"
        />
      </div>
    </div>
  );
}
