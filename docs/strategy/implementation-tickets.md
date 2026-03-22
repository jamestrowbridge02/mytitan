# Implementation Tickets

## Ticket 1: Team Invitations And Default Role Model
Problem it solves:
New customers need a simple way to invite real team members and give them the right starting access without admin help.

User outcome:
An owner can invite staff, assign a sensible default role, and get the team working in the product quickly.

Scope:
- invite user flow from settings
- resend and cancel pending invites
- default roles for owner, manager, dispatcher, finance, technician, and viewer
- acceptance and first-login path for invited users

What is not included:
- custom role builder
- SSO
- external identity provider sync

Dependencies:
- existing auth and tenant membership model
- current role and permission checks in operator surfaces

Acceptance criteria:
- owner can invite a user by email and assign one default role
- invited user can accept the invite and join the correct tenant
- pending invites are visible and can be resent or cancelled
- role selection changes the visible navigation and blocked actions as expected

## Ticket 2: Branch-Scoped Access And Membership Audit History
Problem it solves:
Growing teams need cleaner control over which users can see which locations, customers, and jobs.

User outcome:
Managers can limit access by branch or location and keep an audit trail of membership changes.

Scope:
- branch or location scope on membership records
- edit membership scope after invite acceptance
- membership change history for role and scope updates
- clear UI for suspended versus active members

What is not included:
- field-level permissions
- temporary session elevation
- approval workflows for role changes

Dependencies:
- Ticket 1
- existing tenant and location models

Acceptance criteria:
- owner can assign a user to one or more locations
- scoped user only sees jobs, customers, and schedules within assigned scope
- membership history records role, scope, suspend, and reactivate events
- suspended users cannot access protected tenant routes

## Ticket 3: Customer Timeline And Follow-Up Tasks
Problem it solves:
Customer history is spread across jobs and billing events, making it hard to understand what happened and what needs follow-up next.

User outcome:
Staff can open a customer and see a clear timeline of work, approvals, payments, and follow-up tasks in one place.

Scope:
- customer timeline view
- timeline events for jobs, quotes, approvals, invoices, payments, and key status changes
- manual follow-up tasks tied to a customer or quote
- task due date, owner, and status

What is not included:
- full email campaign tooling
- two-way inbox sync
- automated lead scoring

Dependencies:
- stable job, quote, invoice, and payment event sources
- customer account page structure

Acceptance criteria:
- customer page shows a timeline ordered by event time
- staff can create, complete, and reopen a follow-up task
- timeline includes direct links back to source job, quote, or invoice records
- timeline respects tenant and role access controls

## Ticket 4: Contact Records, Tags, And Saved Customer Views
Problem it solves:
Teams cannot quickly segment customers for follow-up, repeat work planning, or admin review.

User outcome:
Office staff can organise customers with tags and saved views, then come back to the same filtered list later.

Scope:
- customer tags
- saved customer list filters
- list filters for service status, payment state, tag, and assigned location
- quick actions from filtered customer views

What is not included:
- mass email sending
- advanced marketing automation
- external CRM sync

Dependencies:
- Ticket 3
- existing customer list and filter patterns

Acceptance criteria:
- user can create and assign tags to customers
- user can save a filtered customer view and reopen it later
- saved views are tenant-specific
- customer list loads the same results for the same saved view across sessions

## Ticket 5: Service Templates And Job Sheet Builder
Problem it solves:
Different service businesses need different job structures, but the setup is too rigid for broader rollout.

User outcome:
Admins can define service templates and job sheet fields that match the way their teams actually work.

Scope:
- reusable service templates
- configurable job sheet sections and required fields
- service-type-specific defaults for completion steps
- admin preview of how a template appears on a job

What is not included:
- drag-and-drop PDF designer
- scriptable form logic
- public marketplace of templates

Dependencies:
- current job model and custom field support
- operator job execution surfaces

Acceptance criteria:
- admin can create a service template and assign required fields
- new jobs created from the template inherit the configured structure
- required fields block completion until filled
- template changes do not retroactively corrupt completed historical jobs

## Ticket 6: Payment Operations Hardening And Second-Provider Seam
Problem it solves:
Billing follow-through improves when payment state is clearer and the billing layer is ready for more than one provider over time.

User outcome:
Finance teams can see payment status clearly and the product is ready for a second provider without rewriting billing flows later.

Scope:
- clearer payment status and error messaging inside billing flows
- payment link state tracking and receipt visibility
- internal provider abstraction seam for future provider expansion
- operational reporting on payment success, pending, failed, and refunded states

What is not included:
- launching a second payment provider in the same ticket
- subscription billing redesign
- payouts or treasury tooling

Dependencies:
- current Stripe billing implementation
- invoice and payment status models

Acceptance criteria:
- billing surfaces show current payment state clearly
- staff can distinguish pending, paid, failed, refunded, and partially paid states
- payment links and receipts are visible from the relevant billing record
- billing code path uses a provider abstraction that supports adding a second provider later

## Ticket 7: Setup Wizard Refresh For Faster Time To Value
Problem it solves:
The current product breadth can slow down first-time setup and make trials harder to complete.

User outcome:
New tenants can finish the important setup steps faster and understand what to do next.

Scope:
- role-aware setup wizard
- business-type starter presets
- progress tracking for jobs, billing, customer workspace, and repeat work
- finish-state checklist with direct links into the next recommended actions

What is not included:
- white-glove onboarding service workflows
- bulk data migration tooling
- in-product training academy

Dependencies:
- current setup wizard flow
- Tickets 1 and 5 where role and service defaults affect onboarding

Acceptance criteria:
- new tenant sees a setup flow matched to business type or role
- setup progress is saved and can be resumed later
- wizard completion links directly into the next operational steps
- users can finish core setup without touching hidden admin pages
