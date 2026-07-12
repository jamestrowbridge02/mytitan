# Global Page Title Ownership Audit

Date: 2026-07-12

## Root Cause

Tenant pages already owned their semantic page title through the page component, but the dashboard shell rendered a workflow pulse above page content and used the current route label as its eyebrow. On routes such as Dashboard and Customers this created a second visible page-name string before the page-owned `h1`.

## Canonical Rule

- The tenant shell owns navigation, recent destinations and optional workflow recommendations.
- The page component owns the single visible semantic `h1`.
- Shell workflow recommendations must use neutral labels and must not repeat the current page title.
- Dashboard and Customers suppress the shell workflow pulse because their redesigned top areas contain their own primary action and contextual content.

## Route Findings

| Route | Shell title source | Page title source | Before | After | Correct owner |
| --- | --- | --- | --- | --- | --- |
| `/dashboard` | Workflow pulse eyebrow `Dashboard` | `dashboard-premium-title` h1 | Duplicate visible title | One visible title, one h1 | Page |
| `/dashboard/calendar` | None in normal content | Calendar h1 | One title | One visible title, one h1 | Page |
| `/dashboard/bookings` | None in normal content | Bookings h1 | One title | One visible title, one h1 | Page |
| `/dashboard/customers` | Workflow pulse eyebrow `Customers` | Customers header h1 plus repeated guidance | Multiple visible title-like elements | One visible title, one h1 | Page |
| `/dashboard/work` | Neutral workflow pulse eyebrow | Live Work h1 | No duplicate page-name shell label | One h1, pulse remains available | Page |
| `/dashboard/jobs` | None in normal content | Jobs h1 | One title | Compatible | Page |
| `/dashboard/finance` | Neutral workflow pulse eyebrow | Finance h1 | No page-name shell label | Compatible | Page |
| `/dashboard/users` | None in normal content | Team/users h1 | One title | Compatible | Page |
| `/dashboard/settings` | Neutral workflow pulse eyebrow | Settings h1 | No page-name shell label | Compatible | Page |

## Compatibility Impact

Quick options remain available on routes where the shell pulse is intentional, including Live Work and finance/settings routes. Dashboard and Customers retain access to Create job, Add customer, Bookings and navigation through their page header, sidebar and global search.

## Test Coverage

- `dashboard-workflows.spec.ts` asserts Dashboard has one visible title in main content and no shell workflow pulse.
- `dashboard-workflows.spec.ts` asserts Dashboard, Calendar, Bookings and Customers each render one `h1`.
- `shell-polish.spec.ts` keeps the shell quick-options keyboard regression on `/dashboard/work`.
