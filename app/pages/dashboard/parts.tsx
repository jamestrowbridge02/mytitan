import { DashboardShell } from "../../components/dashboard-shell";
import { InventoryWorkspace } from "../../components/inventory/inventory-workspace";

export default function PartsPage() {
  return (
    <DashboardShell>
      <InventoryWorkspace initialTab="parts" />
    </DashboardShell>
  );
}
