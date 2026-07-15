# Business Profile Visual Preservation Matrix

| Capability / field | Authoritative source | Permission | New section | Result | Coverage |
| --- | --- | --- | --- | --- | --- |
| Business name | Tenant settings | `settings.manage` | Details / Business | Preserved | App typecheck, full E2E |
| Trading name | Tenant settings | `settings.manage` | Details / Business | Preserved | App typecheck, full E2E |
| Registered name | Tenant settings | `settings.manage` | Details / Business | Preserved | App typecheck, full E2E |
| Company number | Tenant settings | `settings.manage` | Details / Business | Preserved | App typecheck, full E2E |
| VAT/tax registration number | Tenant settings | `settings.manage` | Details / Business | Preserved | App typecheck, full E2E |
| Phone, support phone, email, website | Tenant settings | `settings.manage` | Details / Contact | Preserved | App typecheck, full E2E |
| Registered address | Tenant settings | `settings.manage` | Details / Registered address | Preserved | App typecheck, full E2E |
| Output visibility switches | `businessDisplayJson` | `settings.manage` | Details / Output visibility | Preserved | App typecheck, full E2E |
| Logo upload | Tenant logo upload API | `settings.manage` | Brand | Preserved | Existing logo E2E, full E2E |
| Logo previews | SafeImage + tenant logo URL | Read access | Brand | Preserved/enhanced | Full E2E |
| Brand colours | Tenant settings | `settings.manage` | Brand | Preserved | App typecheck, full E2E |
| Region/timezone/locale | Tenant settings + geo defaults | `settings.manage` | Regional | Preserved | App typecheck, full E2E |
| Currency | Tenant settings | `settings.manage` | Regional and Finance | Preserved | App typecheck, full E2E |
| VAT enabled/rate/category | Tenant settings / business config | `settings.manage` | Finance & tax | Preserved | App typecheck, full E2E |
| Invoice prefix/footer/payment terms | Business config / tenant settings | `settings.manage` | Finance & tax | Preserved | App typecheck, full E2E |
| Payment setup handoff | Canonical payments route | Read/link | Finance & tax | Linked | Full E2E |
