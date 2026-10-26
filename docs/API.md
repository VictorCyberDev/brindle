# API reference

> Same content as the in-product docs at `/docs/api`. Machine-readable spec: `GET /api/v1/openapi.json`.

The Evidence API receives decisions and facts. It has **no endpoint that runs an action or grants authority.** Machine-readable spec: [`/api/v1/openapi.json`](/api/v1/openapi.json).

## Authentication

Create a key in **Developer**. Send it on every request:

```
Authorization: Bearer brk_…
```

A key belongs to one workspace and can only read and write that workspace. The full key is shown once. Revoke it any time in Developer.

## Limits

- JSON bodies up to 64 KiB. Larger bodies get `413`.
- 120 requests per minute per key. Excess requests get `429`.

## `POST /api/v1/decisions`

Record a decision your agent made and the facts it relied on. Idempotent on `decisionId`: sending the same body again returns `200`. A different body with the same `decisionId` returns `409`.

```json
{
  "agent": { "name": "Procurement agent", "owner": "Ops", "connectedSystems": ["ERP"] },
  "decisionId": "po-1042-approve",
  "decidedAt": "2026-03-02T09:15:00Z",
  "summary": "Approved PO-1042 with Acme Metals",
  "action": { "type": "approve_purchase_order", "target": "PO-1042" },
  "truthInputs": [
    {
      "subjectType": "supplier",
      "subjectId": "SUP-ACME",
      "factKey": "certification.status",
      "value": "VALID"
    }
  ],
  "consequences": [
    {
      "objectType": "purchase_order",
      "objectId": "PO-1042",
      "description": "Purchase order approved",
      "reversibility": "REVERSIBLE"
    }
  ]
}
```

`reversibility` is `REVERSIBLE`, `COMPENSABLE` or `IRREVERSIBLE`. Brindle shows it as you declared it.

## `POST /api/v1/truth-revisions`

Report that a fact changed. Idempotent on `revisionId`.

```json
{
  "revisionId": "acme-cert-revoked",
  "subjectType": "supplier",
  "subjectId": "SUP-ACME",
  "factKey": "certification.status",
  "previousValue": "VALID",
  "newValue": "REVOKED",
  "effectiveFrom": "2026-03-01T00:00:00Z",
  "observedAt": "2026-03-09T08:00:00Z"
}
```

The response includes `incidentId` when any recorded decision relied on the old value.

## `GET /api/v1/incidents` and `GET /api/v1/incidents/{id}`

List incidents, or fetch one with its impact analysis.

## `GET /api/v1/receipts/{id}`

Returns a Recovery Receipt. Returns `404` unless Brindle actually recovered and verified that incident. In a workspace without registered recovery capabilities there are none.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "invalid_request", "message": "…", "details": [] } }
```

| Status | Code                                 | Meaning                       |
| ------ | ------------------------------------ | ----------------------------- |
| 401    | `missing_api_key`, `invalid_api_key` | Missing, wrong or revoked key |
| 404    | `not_found`, `no_receipt`            | Not in this workspace         |
| 409    | `conflict`                           | Same id, different content    |
| 413    | `body_too_large`                     | Over 64 KiB                   |
| 415    | `unsupported_media_type`             | Send `application/json`       |
| 422    | `invalid_request`                    | Body failed validation        |
| 429    | `rate_limited`                       | Slow down                     |
