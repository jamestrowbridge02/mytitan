# Reports Functionality Preservation Matrix

| Signal/action | Source | Permission | Previous location | New location | Status | Coverage |
| --- | --- | --- | --- | --- | --- | --- |
| Window filter | Analytics page state | Intelligence view | Permanent section | Controls | Preserved | E2E analytics |
| Location filter | Shared location context | Intelligence view | Location note | Controls | Preserved | E2E multi-location |
| Executive snapshot | `/analytics/executive`, related loaded data | Intelligence view | Header/cards | Header snapshot | Preserved/merged | E2E analytics |
| Revenue metrics | `/analytics/revenue` | Billing manage | Long page | Revenue tab | Preserved/moved | E2E analytics |
| Work metrics | `/analytics/operations` | Intelligence view | Long page | Work tab | Preserved/moved | E2E analytics |
| Customer signals | `/analytics/customers` | Intelligence view | Long page | Customers tab | Preserved/moved | E2E analytics |
| Capacity metrics | `/analytics/capacity` | Intelligence view | Long page | Capacity tab | Preserved/moved | E2E analytics |
| Forecast signals | Existing forecast derivation | Intelligence view | Repeated cards | Forecasts table/evidence drawer | Preserved/collapsed | E2E phase 6 |
| Customise layout | `/tenant/settings` | Settings manage | Permanent copy | Customise action | Preserved/moved | E2E settings |
| Export | Loaded report snapshot | Intelligence view | N/A | Header action | Added functional CSV | Type/E2E smoke |
