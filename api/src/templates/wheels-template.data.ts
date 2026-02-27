export type WheelsFieldType =
  | "text"
  | "date"
  | "select"
  | "checkbox"
  | "number"
  | "textarea"
  | "radio"
  | "signature"
  | "image"
  | "url";

export type WheelsTemplateField = {
  key: string;
  label: string;
  type: WheelsFieldType;
  required?: boolean;
  group: string;
  options?: string[];
};

export const WHEELS_TEMPLATE_VERSION = 1;
export const WHEELS_TEMPLATE_TRADE = "WHEELS";

export const WHEELS_TEMPLATE_FIELDS: WheelsTemplateField[] = [
  { key: "jobReference", label: "Job Reference", type: "text", required: true, group: "Job Details" },
  { key: "jobDate", label: "Job Date", type: "date", required: true, group: "Job Details" },
  { key: "completedDate", label: "Completed Date", type: "date", group: "Job Details" },
  { key: "jobType", label: "Job Type", type: "text", required: true, group: "Job Details" },

  { key: "customerName", label: "Customer Name", type: "text", required: true, group: "Customer & Trade" },
  { key: "tradeName", label: "Trade Name", type: "text", group: "Customer & Trade" },
  { key: "customerPhone", label: "Customer Phone", type: "text", group: "Customer & Trade" },
  { key: "customerEmail", label: "Customer Email", type: "text", group: "Customer & Trade" },
  { key: "addressLine1", label: "Address Line 1", type: "text", group: "Customer & Trade" },
  { key: "addressLine2", label: "Address Line 2", type: "text", group: "Customer & Trade" },
  { key: "town", label: "Town/City", type: "text", group: "Customer & Trade" },
  { key: "postcode", label: "Postcode", type: "text", group: "Customer & Trade" },

  { key: "technicianName", label: "Technician Name", type: "text", required: true, group: "Technician & Vehicle" },
  { key: "vehicleMake", label: "Vehicle Make", type: "text", group: "Technician & Vehicle" },
  { key: "vehicleModel", label: "Vehicle Model", type: "text", group: "Technician & Vehicle" },
  { key: "vehicleReg", label: "Registration", type: "text", group: "Technician & Vehicle" },
  { key: "vehicleChassis", label: "Chassis/VIN", type: "text", group: "Technician & Vehicle" },
  { key: "torqueSetting", label: "Torque Setting", type: "text", group: "Technician & Vehicle" },
  { key: "tyrePressure", label: "Tyre Pressure", type: "text", group: "Technician & Vehicle" },

  { key: "wheel_nsf", label: "NSF", type: "checkbox", group: "Wheel & Service" },
  { key: "wheel_nsr", label: "NSR", type: "checkbox", group: "Wheel & Service" },
  { key: "wheel_osf", label: "OSF", type: "checkbox", group: "Wheel & Service" },
  { key: "wheel_osr", label: "OSR", type: "checkbox", group: "Wheel & Service" },
  { key: "wheel_spare", label: "SPARE", type: "checkbox", group: "Wheel & Service" },
  { key: "looseWheels", label: "Loose Wheels", type: "radio", group: "Wheel & Service", options: ["x1", "x2", "x3", "x4", "x5", "clear"] },
  { key: "serviceTypes", label: "Service Types", type: "checkbox", group: "Wheel & Service", options: ["Tyre Change", "Puncture Repair", "Wheel Swap", "Balancing", "TPMS"] },
  { key: "notes", label: "Notes", type: "textarea", group: "Wheel & Service" },

  { key: "beforePhotos", label: "Before Photos", type: "image", group: "Evidence & Photos" },
  { key: "afterPhotos", label: "After Photos", type: "image", group: "Evidence & Photos" },
  { key: "torqueEvidence", label: "Torque Evidence", type: "image", group: "Evidence & Photos" },
  { key: "torqueEvidenceLink", label: "Torque Evidence Link", type: "url", group: "Evidence & Photos" },

  { key: "serviceName", label: "Service Name", type: "text", group: "Pricing" },
  { key: "unitPrice", label: "Unit Price", type: "number", group: "Pricing" },
  { key: "quantity", label: "Quantity", type: "number", group: "Pricing" },
  { key: "pricePerWheel", label: "Price Per Wheel", type: "number", group: "Pricing" },
  { key: "wheelCount", label: "Wheel Count", type: "number", group: "Pricing" },
  { key: "discount", label: "Discount", type: "number", group: "Pricing" },
  { key: "vatEnabled", label: "VAT Enabled", type: "checkbox", group: "Pricing" },
  { key: "vatRate", label: "VAT Rate (%)", type: "number", group: "Pricing" },

  { key: "invoiceNumber", label: "Invoice Number", type: "text", group: "Invoice & Payment" },
  { key: "paymentStatus", label: "Payment Status", type: "select", group: "Invoice & Payment", options: ["UNPAID", "PART_PAID", "PAID"] },
  { key: "paymentMethod", label: "Payment Method", type: "select", group: "Invoice & Payment", options: ["CASH", "CARD", "BANK_TRANSFER", "STRIPE_LINK"] },
  { key: "invoiceDate", label: "Invoice Date", type: "date", group: "Invoice & Payment" },

  { key: "whatsappMessage", label: "WhatsApp Message", type: "textarea", group: "WhatsApp" },
  { key: "whatsappCompletionLink", label: "Completion Link", type: "url", group: "WhatsApp" },

  { key: "technicianSignatureName", label: "Technician Signature Name", type: "text", required: true, group: "Signatures" },
  { key: "technicianSignature", label: "Technician Signature", type: "signature", required: true, group: "Signatures" },
  { key: "customerSignatureName", label: "Customer Signature Name", type: "text", group: "Signatures" },
  { key: "customerSignature", label: "Customer Signature", type: "signature", group: "Signatures" },

  { key: "declarationConsent", label: "Declaration / Consent", type: "textarea", group: "Declaration" },
];

export const WHEELS_TEMPLATE_META = {
  tradeCode: WHEELS_TEMPLATE_TRADE,
  version: WHEELS_TEMPLATE_VERSION,
  name: "Wheels Job Form v1",
};
