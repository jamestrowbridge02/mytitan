import { DashboardShell } from "../../components/dashboard-shell";
import { InventoryWorkspace } from "../../components/inventory/inventory-workspace";

export default function PurchaseOrdersPage() {
  return (
    <DashboardShell>
      <InventoryWorkspace initialTab="purchase-orders" />
    </DashboardShell>
  );
}
