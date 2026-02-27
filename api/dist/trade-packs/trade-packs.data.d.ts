export type TradePackCode = 'WHEELS' | 'BODYSHOP' | 'GARAGE' | 'MOBILE_TECH';
export type TradePackDefinition = {
    code: TradePackCode;
    name: string;
    description: string;
    tags: string[];
    includes: string[];
    catalogItems: Array<{
        name: string;
        description: string;
        unitPrice: number;
        defaultQty: number;
        durationMinutes: number;
        capacity: number;
    }>;
    pricingPresets: Array<{
        key: string;
        label: string;
        marginPct: number;
        vatRateBps: number;
    }>;
    checklist: Array<{
        key: string;
        title: string;
        description: string;
    }>;
    emailTemplates: Array<{
        key: string;
        subject: string;
        bodyText: string;
    }>;
    pdfTemplates: Array<{
        key: string;
        title: string;
        blocks: string[];
    }>;
    bookingDefaults: {
        slotMinutes: number;
        leadTimeHours: number;
        windowDays: number;
    };
    portalCopy: {
        intro: string;
        paymentNote: string;
    };
};
export declare const TRADE_PACKS: TradePackDefinition[];
