# Data handling

Brindle Recovery is a private beta. If your data is regulated, do not send it yet. We have not completed SOC 2, ISO 27001, HIPAA or GDPR certification or attestation, and we do not claim to.

## What we store

| Data                                           | Why                         | Where                                                                |
| ---------------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| Account: name, email, salted password hash     | Sign-in                     | PostgreSQL                                                           |
| Workspace, members, roles                      | Access control              | PostgreSQL                                                           |
| Decisions, truth revisions, incidents you send | The product itself          | PostgreSQL, scoped to your workspace                                 |
| API keys                                       | Authentication              | Only a SHA-256 hash and a short prefix                               |
| Beta requests                                  | Deciding who to invite      | Form fields and a salted hash of the network address                 |
| Product events                                 | Knowing if onboarding works | Event name, workspace id and time only. No content, no personal data |

## What we do not do

- No third-party analytics, advertising or session-recording tools.
- No model is sent your evidence in this version. Recovery decisions are deterministic.
- We never log API keys or passwords.

## Deletion

To delete your workspace and its data, or your account, contact the project owner. Self-serve deletion is not built yet. We will delete on request.

## Demo data

The demo workspace and tour use sample data from a sandbox business system. They never contain customer data.
