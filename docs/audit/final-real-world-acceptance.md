# Final Real-World Acceptance

Run this checklist against the intended tenant, using owner/admin access and a private browser window for customer-facing checks. Record the date, tester, tenant, browser, and result for every item.

## 1. Upload The Wheel A&R Logo

1. Open **Settings → Branding**.
2. Choose `Wheel A&R logo non Background.png`.
3. Confirm the filename, file size, and preview appear immediately.
4. Confirm **Upload logo** becomes enabled.
5. Upload the image and confirm a saved message appears.
6. Refresh Settings and confirm the saved preview remains.
7. Sign out and back in, then confirm the preview remains.
8. Open every public booking step and checkout in a private window.
9. Confirm the actual image renders, no logo alt text is visible, and no MyTitan branding appears unless powered-by branding is enabled.

## 2. Save Theme

1. Open **Settings → Appearance**.
2. Select Light, Dark, or Use device setting.
3. Confirm the interface changes and the save result is visible.
4. Refresh and confirm the selected mode remains.
5. Sign out and back in and confirm it remains.
6. Check dashboard, settings, customer portal, and public pages where the tenant theme applies.

## 3. Set Company Number

1. Open **Settings → Business profile**.
2. Enter the registered name, trading name, company number, tax registration, address, phone, email, and website.
3. Choose each intended display surface.
4. Save, refresh, and sign out/in.
5. Confirm enabled information appears on invoice output, statements, job sheets, customer email, customer portal, booking confirmation, trade portal, and legal footer as configured.
6. Confirm disabled information is absent from each corresponding surface.

## 4. Restore Wheel A&R Booking Fields

1. Open **Booking Settings → Customer Fields**.
2. Confirm `Reg Number` is a required public field.
3. Confirm `Locking Wheel Nut Readily Available?` is a required public checkbox.
4. Save and refresh.
5. Open public booking and confirm both fields appear under the Wheel A&R tenant only.
6. Go forward, back, and forward again; confirm both answers remain.
7. Submit with each required answer missing and confirm clear validation.
8. Complete a booking and verify the answers in confirmation, booking, job, and job-sheet data.

## 5. Complete Public Booking And Pay Deposit

1. Select location, service folder, service, appointment, and customer details.
2. Confirm each selection survives back/forward navigation.
3. For a deposit-required service with verified tenant Stripe, confirm the final step is **Checkout**.
4. Confirm the button says **Pay deposit** and is enabled.
5. Confirm no MyTitan billing, provider-boundary, webhook, payment-intent, or setup wording appears.
6. Start payment and confirm the draft remains pending before provider success.
7. Complete payment using the tenant-connected provider.
8. Confirm exactly one booking and one deposit record exist.
9. Confirm booking status becomes confirmed only after verified success.
10. Confirm deposit paid, remaining balance, receipt/reference, customer portal entry, and confirmation email are correct.
11. Repeat with a failed and cancelled payment; confirm no booking is falsely confirmed and retry is available.

## 6. Generate And Send An Invoice

1. Complete a job and issue its invoice.
2. Confirm payment terms resolve global → customer/trade account → invoice override.
3. Change the invoice-level terms and confirm the due date recalculates.
4. Send the invoice.
5. Confirm one delivery/audit record exists and the invoice remains unpaid until a real payment is recorded.
6. Verify enabled business information appears and disabled information does not.

## 7. Generate And Send A Grouped Statement

1. Open **Finance → Statements**.
2. Choose a customer or trade account and date range.
3. Generate the statement.
4. Confirm paid, unpaid, and overdue invoices are grouped correctly.
5. Confirm the open balance and currency are correct.
6. Download the PDF and verify branding/business information controls.
7. Send the statement and verify the recipient, delivery result, timestamp, and audit event.
8. Repeat the send immediately and confirm duplicate-send protection applies.

## 8. Create A Trade Account And Portal

1. Open **Trade Accounts** and start the setup wizard.
2. Create the account, add a contact, choose trade services/locations, and set payment terms.
3. Save and refresh; confirm every value remains.
4. Send a secure portal invite.
5. Confirm delivery status is shown and the link expires.
6. Open the link privately and confirm only that tenant’s branding, trade services, locations, jobs, documents, and statements appear.
7. Revoke access and confirm the old link no longer works.

## 9. Submit And Review A Trade Application

1. Open **Trade Account Applications**.
2. Configure fields, enable the form, save, and refresh.
3. Open the public application link privately.
4. Submit a valid application and record the customer-safe status link.
5. Confirm the owner/admin review list contains the application.
6. Approve it and send portal access.
7. Confirm exactly one trade account is created and the invite is delivered.
8. Submit another application and reject it; confirm the public status page shows only customer-safe wording.

## 10. Sidebar And Language

1. Check expanded and collapsed sidebar states in light and dark modes.
2. Confirm all icons share one column, size, active state, and hover alignment.
3. Confirm Settings uses a clean cog and no item jumps during collapse.
4. Navigate by keyboard and mobile menu.
5. Check owner/admin pages for inappropriate `sub-user` or generic `technician` wording.
6. Confirm assignment remains optional and role-specific technician wording remains only where accurate.

## Acceptance Record

For each section record: `PASS`, `FAIL`, route, component, API response, persisted database state, refresh result, re-login result, public result, isolation result, and exact remediation.

Do not mark the release complete when an automated test passes but any visible interaction, persistence check, payment ownership check, or customer-facing result fails.
