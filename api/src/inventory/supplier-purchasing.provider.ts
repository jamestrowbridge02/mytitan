import { Injectable } from '@nestjs/common';

export type SupplierPurchaseOrderDryRun = {
  supplierId?: string | null;
  purchaseOrderId?: string | null;
  lineCount: number;
};

export type SupplierPurchaseOrderDryRunResult = {
  mode: 'internal_po_only';
  canSubmitExternally: false;
  safeToDisplay: true;
  message: string;
};

export interface SupplierPurchasingProvider {
  capabilities(): {
    liveOrdering: false;
    dryRunOnly: true;
    exposesSecrets: false;
    label: string;
  };
  validateDryRun(input: SupplierPurchaseOrderDryRun): SupplierPurchaseOrderDryRunResult;
}

@Injectable()
export class InternalOnlySupplierPurchasingProvider implements SupplierPurchasingProvider {
  capabilities() {
    return {
      liveOrdering: false as const,
      dryRunOnly: true as const,
      exposesSecrets: false as const,
      label: 'Internal PO only',
    };
  }

  validateDryRun(input: SupplierPurchaseOrderDryRun): SupplierPurchaseOrderDryRunResult {
    return {
      mode: 'internal_po_only',
      canSubmitExternally: false,
      safeToDisplay: true,
      message: `Validated ${input.lineCount || 0} line(s) for internal purchasing only. No supplier API call was made.`,
    };
  }
}
