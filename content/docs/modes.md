# Recovery modes

| Mode                   | What Brindle does                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **Shadow** (default)   | Reports impact and proposes a plan. Changes nothing. Ever.                           |
| **Approval**           | Executes a plan only after a person with the right role approves it.                 |
| **Bounded Autonomous** | Acts without a person, only through registered capabilities and within fixed limits. |

## What you should know today

- **Shadow Mode never executes**, even if a capability is registered and someone approves.
- Execution needs a **registered recovery capability** for the system involved. No capability for customer systems is shipped yet, so in your own workspace Brindle observes and proposes.
- The **Demo Workspace** runs against a sandbox business system with registered capabilities, so you can see Approval and Bounded Autonomous behave end to end.
- Only owners and admins can change the mode. Auditors are read-only.

## Roles

| Role         | Can                                                           |
| ------------ | ------------------------------------------------------------- |
| Owner, Admin | Everything, including members, API keys and mode              |
| Operator     | Review incidents and approve recovery within the current mode |
| Auditor      | Read incidents, proofs and memory                             |
