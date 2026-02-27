export type WheelsFieldType = "text" | "date" | "select" | "checkbox" | "number" | "textarea" | "radio" | "signature" | "image" | "url";
export type WheelsTemplateField = {
    key: string;
    label: string;
    type: WheelsFieldType;
    required?: boolean;
    group: string;
    options?: string[];
};
export declare const WHEELS_TEMPLATE_VERSION = 1;
export declare const WHEELS_TEMPLATE_TRADE = "WHEELS";
export declare const WHEELS_TEMPLATE_FIELDS: WheelsTemplateField[];
export declare const WHEELS_TEMPLATE_META: {
    tradeCode: string;
    version: number;
    name: string;
};
