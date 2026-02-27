export function computeWheelCount(alloyWheelSelections: string[]): number {
  return alloyWheelSelections.filter(Boolean).length;
}

export function buildWhatsAppMessage(input: {
  template?: string | null;
  name?: string | null;
  jobRef?: string | null;
  completedDate?: string | null;
}): string {
  const name = (input.name || 'Customer').trim();
  const jobRef = (input.jobRef || 'job').trim();
  const completedDate = (input.completedDate || new Date().toISOString().slice(0, 10)).trim();
  const template = (input.template || '').trim();

  if (!template) {
    return `Hi ${name}, your wheels service ${jobRef} was completed on ${completedDate}.`;
  }

  return template
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*jobRef\s*\}\}/gi, jobRef)
    .replace(/\{\{\s*completedDate\s*\}\}/gi, completedDate);
}

export function applyPricingPreset(
  currentPrice: number,
  presetPrice: number | null,
  userEditedFlag: boolean,
): { unitPrice: number; userEditedFlag: boolean } {
  if (userEditedFlag || presetPrice === null || !Number.isFinite(presetPrice)) {
    return { unitPrice: currentPrice, userEditedFlag };
  }

  return { unitPrice: presetPrice, userEditedFlag: false };
}

export function computeTotals(input: {
  unitPrice: number;
  qty: number;
  wheelCount?: number;
  pricePerWheel?: number;
  discount: number;
  vatEnabled: boolean;
  vatRate: number;
}): { subtotal: number; vat: number; total: number } {
  const unitPrice = Number.isFinite(input.unitPrice) ? input.unitPrice : 0;
  const qty = Number.isFinite(input.qty) ? input.qty : 0;
  const wheelCount = Number.isFinite(input.wheelCount ?? 0) ? Number(input.wheelCount ?? 0) : 0;
  const pricePerWheel = Number.isFinite(input.pricePerWheel ?? 0) ? Number(input.pricePerWheel ?? 0) : 0;
  const discount = Number.isFinite(input.discount) ? input.discount : 0;
  const vatRate = Number.isFinite(input.vatRate) ? input.vatRate : 0;

  const subtotal = Math.max(0, unitPrice * qty + pricePerWheel * wheelCount - discount);
  const vat = input.vatEnabled ? Math.max(0, subtotal * (vatRate / 100)) : 0;
  return {
    subtotal,
    vat,
    total: subtotal + vat,
  };
}
