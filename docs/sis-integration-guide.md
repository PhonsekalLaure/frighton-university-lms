# SIS integration

Library v1 private service APIs, allocated-copy reservations, replacement-charge staff controls, and durable debt synchronization are implemented. Live migration application and deployment remain separate operations.

- SIS API defaults to http://localhost:5000; configure SIS_API_URL.
- LMS API defaults to http://localhost:5001.
- LMS → SIS: SIS_API_KEY, sent as X-LMS-API-KEY.
- SIS → LMS: SIS_SERVICE_API_KEY, received as X-SIS-API-KEY.
- Credentials must differ and remain server-only; no built-in secret is supplied.
- All new staff reservations/checkouts require reachable SIS eligibility; returns, cancellation, and offline charge settlement remain independent.
- Updated staff payloads and responses use studentNumber rather than frightonId. Deploy the matching staff client with the API.

See [OpenAPI](library-self-service.openapi.json) and [operations](library-self-service-operations.md) for endpoint shapes, migration prerequisites, the supervised maintenance worker, feature gating, verification, and recovery.
