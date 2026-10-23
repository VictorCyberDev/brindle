import { getConfig, providerModeOf, summarizeConfig } from "../../config/env";
import { getSharedRuntime } from "../../demo/runtime";
import { readDemoState, type DemoState } from "../../demo/store";
import { MaterialityPanel } from "./materiality-panel";
import { readMateriality } from "../../services/materiality";
import { ATLAS_REVISION_ID } from "../../demo/temporal";
import { TemporalPanel } from "./temporal-panel";
import { readTemporalDemo } from "../../demo/temporal";
import { DemoControls } from "./controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brindle — Successful Agent World" };

function Row({
  label,
  value,
  testId,
  tone,
}: {
  label: string;
  value: string;
  testId: string;
  tone?: "ok" | "muted";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-neutral-200 py-2">
      <dt className="text-sm text-neutral-600">{label}</dt>
      <dd
        className={`text-sm font-medium ${tone === "muted" ? "text-neutral-500" : "text-neutral-900"}`}
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

function truthSummary(state: DemoState) {
  const atlas = state.truth
    .map((t) => t.assertion)
    .filter((a) => a.subject.entityId === "SUP-ATLAS");
  const get = (k: string) => atlas.find((a) => a.factKey === k);
  const cert = get("certification.ISO-9001");
  const certValue = cert?.value as { status?: string } | undefined;
  return {
    name: (get("supplier.legal_name")?.value as string | undefined) ?? "not observed",
    enabled: get("supplier.enabled")?.value === true,
    certStatus: certValue?.status ?? "not observed",
    interval: cert
      ? `${cert.validFrom.slice(0, 10)} → ${cert.validTo?.slice(0, 10) ?? "open"}`
      : "—",
    sourceId: cert?.sourceId ?? "—",
  };
}

export default async function DemoPage() {
  let materiality: Awaited<ReturnType<typeof readMateriality>> | null = null;
  let temporal: Awaited<ReturnType<typeof readTemporalDemo>> = null;
  let state: DemoState | null = null;
  let error: string | null = null;
  let mode: "LIVE" | "MOCK" = "MOCK";
  let reasoning: { provider: string; runtimeRoute: string } | null = null;
  try {
    const config = getConfig();
    mode = providerModeOf(config);
    reasoning = summarizeConfig(config).reasoning;
    const db = (await getSharedRuntime(config)).deps.db;
    state = await readDemoState(db);
    temporal = await readTemporalDemo(db);
    if (temporal) materiality = await readMateriality(db, ATLAS_REVISION_ID);
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : "unknown error";
  }

  const atlasPo = state?.purchaseOrders.find((p) => p.po.poId === "PO-827");
  const controlPo = state?.purchaseOrders.find((p) => p.po.poId === "PO-901");
  const truth = state ? truthSummary(state) : null;
  const run = state?.latestRun ?? null;
  // Show what actually produced the world on screen, not just what is configured now.
  const shownMode = run?.mode ?? mode;
  const shownModel = run?.modelId ?? (mode === "MOCK" ? "MOCK:deterministic-reasoner" : "—");
  const shownRoute = run?.runtimeRoute ?? reasoning?.runtimeRoute ?? "—";
  // A route is never shown as a model: unproven stays unproven.
  const shownUnderlying = run
    ? (run.underlyingModel ?? (run.mode === "MOCK" ? "n/a (MOCK)" : "UNPROVEN"))
    : "—";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <p className="text-xs font-semibold tracking-widest text-neutral-500">BRINDLE</p>
        <h1 className="text-3xl font-semibold tracking-tight">Successful Agent World</h1>
        <p className="mt-1 text-sm text-neutral-600">The world before anything goes wrong.</p>
      </header>

      <div
        data-testid="provider-banner"
        data-mode={shownMode}
        className={`mb-3 rounded border-2 px-4 py-3 text-sm font-semibold ${
          shownMode === "LIVE"
            ? "border-emerald-700 bg-emerald-50 text-emerald-900"
            : "border-amber-600 bg-amber-50 text-amber-900"
        }`}
      >
        {shownMode === "LIVE"
          ? "PROVIDER MODE: LIVE — truth read from Zetaris, reasoning by a real model."
          : "PROVIDER MODE: MOCK — no sponsor was contacted. Truth is a local fixture and reasoning is a deterministic stand-in."}
      </div>
      <div
        data-testid="sandbox-banner"
        className="mb-6 rounded border border-neutral-400 bg-neutral-100 px-4 py-2 text-xs font-semibold tracking-wide text-neutral-800"
      >
        SANDBOX BUSINESS SYSTEM — purchase orders, approvals, receiving and notifications below are
        records in Brindle&apos;s own database. No money moves and no email is sent.
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded border border-red-600 bg-red-50 p-4 text-sm text-red-900"
          data-testid="demo-error"
        >
          {error}
        </div>
      ) : (
        <>
          <section className="mb-6">
            <DemoControls />
          </section>

          <section className="mb-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Truth
            </h2>
            <dl>
              <Row label="Supplier" value={truth!.name} testId="truth-supplier" />
              <Row label="Enabled" value={truth!.enabled ? "YES" : "—"} testId="truth-enabled" />
              <Row label="Certification (ISO-9001)" value={truth!.certStatus} testId="truth-cert" />
              <Row label="Valid interval" value={truth!.interval} testId="truth-interval" />
              <Row
                label="Truth source"
                value={truth!.sourceId}
                testId="truth-source"
                tone="muted"
              />
            </dl>
          </section>

          <section className="mb-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              PO-827 · Atlas Components
            </h2>
            <dl>
              <Row label="Procurement" value={atlasPo ? "SELECTED" : "—"} testId="procurement" />
              <Row label="PO-827" value={atlasPo ? "CREATED" : "—"} testId="po-created" />
              <Row label="Finance" value={atlasPo?.approval ? "APPROVED" : "—"} testId="finance" />
              <Row
                label="Operations"
                value={atlasPo?.allocation ? "RECEIVING SCHEDULED" : "—"}
                testId="operations"
              />
              <Row
                label="Supplier notification"
                value={atlasPo?.notification ? "RECORDED — SANDBOX" : "—"}
                testId="notification"
              />
              <Row
                label="Decision Receipts"
                value={String(atlasPo?.decisionReceiptCount ?? 0)}
                testId="receipts-827"
              />
            </dl>
          </section>

          <section className="mb-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              PO-901 · Control (unrelated to Atlas)
            </h2>
            <dl>
              <Row
                label="PO-901"
                value={
                  controlPo ? `${controlPo.po.status.replace("_", " ")} — CONTROL / UNRELATED` : "—"
                }
                testId="control"
              />
              <Row
                label="Supplier"
                value={controlPo?.po.supplierName ?? "—"}
                testId="control-supplier"
              />
              <Row
                label="Decision Receipts"
                value={String(controlPo?.decisionReceiptCount ?? 0)}
                testId="receipts-901"
              />
            </dl>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Provenance
            </h2>
            <dl>
              <Row label="Provider mode" value={shownMode} testId="provider-mode" />
              <Row label="Model recorded on receipts" value={shownModel} testId="model-id" />
              <Row label="Runtime route" value={shownRoute} testId="runtime-route" />
              <Row label="Underlying model" value={shownUnderlying} testId="underlying-model" />
              <Row
                label="Last run"
                value={run ? `${run.status} · ${run.startedAt}` : "none"}
                testId="last-run"
                tone="muted"
              />
            </dl>
          </section>
        </>
      )}
      <TemporalPanel data={temporal} />
      <MaterialityPanel data={materiality} />
    </main>
  );
}
