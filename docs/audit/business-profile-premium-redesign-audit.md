# Business Profile Premium Redesign Audit

## Scope

Audited `/dashboard/settings?tab=general&section=business-profile` and related profile sections in `app/pages/dashboard/settings.tsx`.

## Classification

| Area | Classification | Result |
| --- | --- | --- |
| Business name, registered name, trading name, company number | Business identity / legal details | Preserved in Business Profile |
| VAT/tax number, VAT default, rate, label, category, invoice prefix, payment terms | Finance/tax defaults | Preserved in Business Profile |
| Contact phone, email, website, support phone | Contact details | Preserved in Business Profile |
| Registered address fields | Legal/contact details | Preserved in Business Profile |
| Logo upload and saved logo preview | Branding | Preserved; raw logo URL input removed from normal UI |
| Brand colours and default appearance | Branding | Preserved |
| Country, timezone, locale, public booking locale, phone country default | Regional defaults | Preserved |
| Output visibility controls | Business profile output visibility | Preserved |
| Live Work layout, analytics layout, navigation toggles, theme | Application/layout preference | Moved behind the Settings appearance/layout deep link |
| Guided setup progress and launch tasks | Setup/readiness | Reduced on Settings directory; not shown as Business Profile content |
| Technical wording such as tenant settings API and single source of truth | Technical/internal wording | Removed from tenant-facing Business Profile copy |

## Result

Business Profile now presents business identity and defaults first, with one page title and one primary Save action. Persistence remains the existing tenant settings API and audit path.
