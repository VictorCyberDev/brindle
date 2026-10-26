import Link from "next/link";

export const metadata = {
  title: "Security and trust",
  description: "How Brindle Recovery protects your data and limits what it can do.",
};

const BLOCKS: [string, string[]][] = [
  [
    "Workspace isolation",
    [
      "Every record belongs to one workspace. Every read and write is filtered by the workspace of the signed-in member or API key. Tests prove that one workspace cannot read another's incidents, agents or keys.",
    ],
  ],
  [
    "Authentication",
    [
      "Sign-in uses Better Auth with salted password hashing and database-backed rate limiting. We do not write our own cryptography. Sessions are HTTP-only, same-site cookies.",
    ],
  ],
  [
    "Roles and approval",
    [
      "Owner, Admin, Operator and Auditor. Auditors are read-only. Approving a recovery needs a role that allows it, and Shadow Mode never executes anything regardless of role.",
    ],
  ],
  [
    "API keys",
    [
      "Keys are 256-bit random values. We store only a SHA-256 hash and a short prefix. The full key is shown once at creation, never logged and never shown again. Revoking a key takes effect immediately.",
    ],
  ],
  [
    "Evidence in, never actions out",
    [
      "The API accepts decisions and facts. It has no endpoint to run a command, a query or an action. Recovery acts only through a fixed registry of capabilities, and every step is re-validated at execution.",
    ],
  ],
  [
    "Data handling",
    [
      "We store the evidence you send, the incidents we derive and a first-party log of event names without content. We do not use third-party analytics or advertising trackers. See what we store and how to ask for deletion in the data handling note.",
    ],
  ],
  [
    "What we do not claim",
    [
      "Brindle Recovery has not completed SOC 2, ISO 27001 or any other certification, and makes no HIPAA or GDPR compliance claim. It is a private beta. If your data is regulated, do not send it yet.",
    ],
  ],
];

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="eyebrow mb-3">Security and trust</p>
      <h1 className="display text-5xl">What protects you, and what does not exist yet.</h1>
      <div className="mt-12 space-y-10">
        {BLOCKS.map(([title, paras]) => (
          <section key={title}>
            <h2 className="text-xl font-semibold">{title}</h2>
            {paras.map((p) => (
              <p key={p} className="mt-2 text-muted">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-12 text-muted">
        More:{" "}
        <Link className="underline underline-offset-4" href="/docs/data-handling">
          data handling
        </Link>
        {" · "}
        <Link className="underline underline-offset-4" href="/docs/api">
          API reference
        </Link>
        . To report a vulnerability, open a private security advisory on the project&apos;s GitHub
        repository.
      </p>
    </div>
  );
}
