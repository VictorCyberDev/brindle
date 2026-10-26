# Troubleshooting

**My decision was accepted but no incident appeared.** An incident opens only when a truth revision changes a fact that a recorded decision relied on. Check that `subjectType`, `subjectId` and `factKey` are identical in both.

**I get `409 conflict`.** You sent a different body with an id you already used. Ids are idempotency keys. Use a new id for new content.

**Everything says "Needs human review".** Brindle cannot replay your agent to learn what it would have done with the corrected fact, so it will not guess. A person decides. That is intentional.

**Brindle did not fix anything in my systems.** No recovery connector for customer systems is shipped yet. See [Recovery modes](/docs/modes).

**I lost my API key.** Keys are shown once and cannot be recovered. Revoke it and create another.

**I cannot approve a recovery.** Approval needs the Owner, Admin or Operator role, a mode other than Shadow, and a registered capability for the system.
