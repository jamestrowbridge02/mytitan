# Report Visualisation Design System

Reports use the existing lightweight `OperatorChartCard` instead of a large charting dependency.

## Principles

- Use authoritative rows already returned by analytics APIs.
- Render a compact SVG trend only when at least one value is greater than zero.
- Keep bar rows and text values as the accessible table-like alternative.
- Preserve source-record links, export, tabs, filters, and tables.
- Use semantic colours for status and chart accents.
- Respect reduced-motion by avoiding continuous animation.

## Empty states

- No rows: `No authoritative data is available yet.`
- Rows with all zero values: `No activity in this period.`

## Palette

Chart axis, line and point colours come from app-shell semantic tokens so light and dark themes stay readable.
