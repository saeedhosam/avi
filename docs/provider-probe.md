# Provider probe notes

Data-provider contract tests captured so the analysis isn't repeated.

## AeroDataBox direct API (2026-11-06, Starter plan key)

- Direct API `/flights/number/{number}` **does not** accept comma-separated
  numbers: a live probe against
  `api.aerodatabox.com` returned **HTTP 404** for
  `/flights/number/BA117,BA178` and for
  `/flights/number/BA117,BA178/2026-11-07`.
- Consequence: there is no batched-flight-number lookup to adopt, so the
  engine's unit-efficiency levers are the FIDS-by-airport consolidation and
  cache TTL tuning. Revisit if AeroDataBox adds a multi-number endpoint.
