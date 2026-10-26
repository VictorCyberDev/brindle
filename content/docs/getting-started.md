# Getting started

Brindle Recovery watches the facts your AI agents relied on. When one turns out to be wrong, it shows what that touched, what would have been decided differently, and what to do about it.

## Try it in two minutes

1. Open the [product tour](/demo) and press **Run the recovery story**. No account needed.
2. Create an account and open the **Demo Workspace** to explore the same story as a real product, with roles, modes and a Recovery Proof.

## Connect your own agent

1. Create an account and a workspace. Leave the recovery mode on **Shadow**.
2. In **Developer**, create an API key. Copy it. It is shown once.
3. Send one decision your agent made, with the facts it relied on:

```bash
curl -sS -X POST https://YOUR_HOST/api/v1/decisions \
  -H "Authorization: Bearer $BRINDLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d @decision.json
```

4. When a fact changes, report it with `POST /api/v1/truth-revisions`. If any recorded decision relied on the old value, Brindle opens an incident.

The [API reference](/docs/api) has every field.

## What to expect in your own workspace

Brindle can trace impact and tell you which decisions relied on the old fact. It cannot replay your agent, so it marks those decisions **Needs human review** instead of guessing. It does not change your systems, because no recovery connector for your systems exists yet. See [Recovery modes](/docs/modes).
