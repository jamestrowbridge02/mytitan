"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRADE_PACKS = void 0;
exports.TRADE_PACKS = [
    {
        code: 'WHEELS',
        name: 'Wheels & Tyres',
        description: 'Best for alloy wheel repair, tyre fitting, balancing, and alignment services.',
        tags: ['wheels', 'tyres', 'alignment'],
        includes: ['4 starter services', 'Pricing presets', 'Customer-ready email copy', 'Booking defaults'],
        catalogItems: [
            { name: 'Wheel Alignment Check', description: 'Full alignment check and adjustment.', unitPrice: 79, defaultQty: 1, durationMinutes: 60, capacity: 2 },
            { name: 'Tyre Replacement', description: 'Supply and fit one tyre including balancing.', unitPrice: 125, defaultQty: 1, durationMinutes: 45, capacity: 2 },
            { name: 'Puncture Repair', description: 'Repair puncture and re-balance wheel.', unitPrice: 35, defaultQty: 1, durationMinutes: 30, capacity: 3 },
            { name: 'Alloy Wheel Refurb', description: 'Refurbishment for curb damage and finish.', unitPrice: 160, defaultQty: 1, durationMinutes: 180, capacity: 1 },
        ],
        pricingPresets: [
            { key: 'wheel_standard', label: 'Standard margin', marginPct: 42, vatRateBps: 2000 },
            { key: 'wheel_trade', label: 'Trade account margin', marginPct: 28, vatRateBps: 2000 },
        ],
        checklist: [
            { key: 'check_size_range', title: 'Confirm tyre size range', description: 'Set supported tyre sizes before going live.' },
            { key: 'upload_before_after_examples', title: 'Upload before/after photos', description: 'Show examples in customer quotes.' },
        ],
        emailTemplates: [
            { key: 'wheels_booking', subject: 'Your wheel booking is confirmed', bodyText: 'Thanks for booking with us. We have reserved your slot and will text reminders before arrival.' },
        ],
        pdfTemplates: [
            { key: 'wheel_quote', title: 'Wheel Service Quote', blocks: ['Service summary', 'Tyre and wheel line items', 'Customer approval/signature'] },
        ],
        bookingDefaults: { slotMinutes: 30, leadTimeHours: 2, windowDays: 21 },
        portalCopy: {
            intro: 'Review your wheel service details, approve the work, then sign and pay online when ready.',
            paymentNote: 'Card payments are secure and receipts are emailed instantly.',
        },
    },
    {
        code: 'BODYSHOP',
        name: 'Bodyshop',
        description: 'Best for paint, dent, and cosmetic repairs.',
        tags: ['paint', 'bodywork', 'repair'],
        includes: ['Inspection checklist', 'Bodywork quote copy', 'Workshop-friendly booking defaults'],
        catalogItems: [
            { name: 'Panel Scratch Repair', description: 'Minor scratch repair and polish.', unitPrice: 180, defaultQty: 1, durationMinutes: 180, capacity: 1 },
            { name: 'Dent Removal', description: 'Paint-safe dent removal for one panel.', unitPrice: 220, defaultQty: 1, durationMinutes: 180, capacity: 1 },
            { name: 'Bumper Respray', description: 'Prepare and respray bumper finish.', unitPrice: 340, defaultQty: 1, durationMinutes: 300, capacity: 1 },
        ],
        pricingPresets: [
            { key: 'bodyshop_standard', label: 'Standard bodyshop margin', marginPct: 48, vatRateBps: 2000 },
        ],
        checklist: [
            { key: 'capture_damage_photos', title: 'Capture damage photos', description: 'Always include 4-angle photos in estimates.' },
            { key: 'set_paint_supplier', title: 'Set paint supplier lead times', description: 'Define expected lead times for materials.' },
        ],
        emailTemplates: [
            { key: 'bodyshop_update', subject: 'Update on your vehicle repair', bodyText: 'Your vehicle is in progress. We will notify you as soon as final checks are complete.' },
        ],
        pdfTemplates: [
            { key: 'bodyshop_quote', title: 'Body Repair Estimate', blocks: ['Damage summary', 'Parts and labor', 'Approval signature'] },
        ],
        bookingDefaults: { slotMinutes: 60, leadTimeHours: 8, windowDays: 28 },
        portalCopy: {
            intro: 'Check your repair summary, approve the estimate, and sign online in minutes.',
            paymentNote: 'You can pay now or later using the secure payment link.',
        },
    },
    {
        code: 'GARAGE',
        name: 'General Garage',
        description: 'Best for servicing, diagnostics, brakes, and MOT prep.',
        tags: ['service', 'garage', 'diagnostics'],
        includes: ['Popular garage services', 'Service reminder template', 'Booking defaults for workshop flow'],
        catalogItems: [
            { name: 'Interim Service', description: 'Oil, filter, and safety checks.', unitPrice: 149, defaultQty: 1, durationMinutes: 90, capacity: 2 },
            { name: 'Full Service', description: 'Comprehensive service with full checklist.', unitPrice: 249, defaultQty: 1, durationMinutes: 150, capacity: 2 },
            { name: 'Brake Inspection', description: 'Pads, discs, and brake fluid check.', unitPrice: 69, defaultQty: 1, durationMinutes: 45, capacity: 2 },
            { name: 'Diagnostic Scan', description: 'ECU fault code scan and report.', unitPrice: 89, defaultQty: 1, durationMinutes: 45, capacity: 2 },
        ],
        pricingPresets: [
            { key: 'garage_retail', label: 'Retail pricing', marginPct: 40, vatRateBps: 2000 },
            { key: 'garage_fleet', label: 'Fleet pricing', marginPct: 25, vatRateBps: 2000 },
        ],
        checklist: [
            { key: 'set_vehicle_dropoff_policy', title: 'Set drop-off policy', description: 'Tell customers drop-off and collection times clearly.' },
            { key: 'enable_service_reminders', title: 'Enable service reminders', description: 'Turn on reminder emails for due services.' },
        ],
        emailTemplates: [
            { key: 'garage_ready', subject: 'Your vehicle is ready for collection', bodyText: 'Your vehicle is ready. Please bring your booking reference when collecting.' },
        ],
        pdfTemplates: [
            { key: 'garage_invoice', title: 'Garage Service Invoice', blocks: ['Work completed', 'Advisory notes', 'Payment summary'] },
        ],
        bookingDefaults: { slotMinutes: 30, leadTimeHours: 4, windowDays: 14 },
        portalCopy: {
            intro: 'Review your service summary, approve work, and track progress online.',
            paymentNote: 'Pay securely online before collection to save time at pickup.',
        },
    },
    {
        code: 'MOBILE_TECH',
        name: 'Mobile Technician',
        description: 'Best for on-site diagnostics and repair visits.',
        tags: ['mobile', 'onsite', 'field-service'],
        includes: ['Mobile job templates', 'Travel-aware booking defaults', 'On-site customer messaging copy'],
        catalogItems: [
            { name: 'On-site Diagnostic Visit', description: 'Mobile diagnostic visit at customer location.', unitPrice: 119, defaultQty: 1, durationMinutes: 60, capacity: 1 },
            { name: 'Battery Replacement', description: 'Supply and fit battery at customer location.', unitPrice: 189, defaultQty: 1, durationMinutes: 45, capacity: 1 },
            { name: 'Emergency Breakdown Assist', description: 'Urgent attendance and initial repair.', unitPrice: 149, defaultQty: 1, durationMinutes: 90, capacity: 1 },
        ],
        pricingPresets: [
            { key: 'mobile_standard', label: 'Standard callout', marginPct: 38, vatRateBps: 2000 },
            { key: 'mobile_urgent', label: 'Urgent callout', marginPct: 52, vatRateBps: 2000 },
        ],
        checklist: [
            { key: 'set_service_area', title: 'Set service area', description: 'Define coverage radius and travel fees.' },
            { key: 'set_eta_message', title: 'Set ETA message', description: 'Use clear ETA updates for customers.' },
        ],
        emailTemplates: [
            { key: 'mobile_eta', subject: 'Your mobile technician is on the way', bodyText: 'Your technician is on route. We will message you with live ETA updates.' },
        ],
        pdfTemplates: [
            { key: 'mobile_report', title: 'On-site Service Report', blocks: ['Issue summary', 'Actions taken', 'Customer sign-off'] },
        ],
        bookingDefaults: { slotMinutes: 60, leadTimeHours: 1, windowDays: 10 },
        portalCopy: {
            intro: 'Review your mobile service request and approve work before we travel.',
            paymentNote: 'Pay securely online to confirm your mobile appointment.',
        },
    },
];
//# sourceMappingURL=trade-packs.data.js.map