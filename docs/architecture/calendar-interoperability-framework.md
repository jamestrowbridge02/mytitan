# Calendar Interoperability Framework

Calendar integrations distinguish native sync from standards-based visibility.

## Available Now

- Google Calendar keeps its native personal integration path.
- Apple Calendar, generic ICS calendars, Outlook, Microsoft 365, Exchange and other calendar clients can use the existing tenant-scoped MyTitan ICS feed.
- Scheduling systems such as Calendly, Cal.com, Deputy, RotaCloud, When I Work, Sling, Humanity and custom schedulers can use scoped API tokens and signed webhooks for approved events.

## ICS Boundary

Outbound ICS is a calendar visibility standard. It is not two-way sync. It must use opaque tenant-scoped tokens and must not expose raw workspace IDs or provider secrets.

## CalDAV Boundary

CalDAV is shown separately from the working ICS route. It is not claimed as complete until HTTPS-only server validation, encrypted credentials, discovery, selected calendar handling, sync conflict rules, audit logging and disconnect controls are implemented and tested.
