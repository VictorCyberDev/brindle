# Concepts

## Truth revision

A fact changed. It has two times: when it became true in the world (**effective**) and when you learned of it (**observed**). If the first is earlier than the second, the change is **retroactive**, and agents may have acted on the old value in between.

## Incident

A truth revision that at least one recorded decision relied on.

## Impact

The decisions that used the changed fact, and the consequences that followed from them: orders, payments, messages.

## Treatments

- **Needs recovery**: the corrected fact would have changed this decision.
- **Preserved**: the corrected fact would not have changed it. It stays.
- **Needs human review**: Brindle cannot tell without replaying the agent.
- **Not affected**: it never relied on the changed fact.

## Cannot be undone

Some effects cannot be reversed by software, such as a sent email or a confirmed shipment. Brindle never rolls these back. It marks them, opens a corrective case for a person and states them in the proof.

## Recovery Proof

After recovery, Brindle reads the real state again from scratch and re-checks six invariants. The proof lists what changed, what was preserved, what could not be undone and the result of each check. It is evidence of what Brindle checked. It is not a compliance certification.

## Recovery Memory

After a recovery is verified, Brindle remembers the pattern. Later incidents show what was recalled before planning. Memory advises. It never authorizes an action, and a recovery that fails verification is never remembered.
