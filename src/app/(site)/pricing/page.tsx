import Link from "next/link";
import { buttonClass } from "../../../components/ui/button";
import { Check } from "../../../components/ui/icons";

export const metadata = {
  title: "Pricing",
  description: "Brindle Recovery is a free pilot during the private beta.",
};

const INCLUDED = [
  "Workspaces, roles and API keys",
  "Impact tracing and counterfactual materiality for your own evidence",
  "Shadow Mode and Approval Mode",
  "Recovery Memory, Recovery Proof and receipts",
  "The demo workspace and guided tour",
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <p className="eyebrow mb-3">Pricing</p>
      <h1 className="display text-5xl md:text-6xl">Free while we learn with you.</h1>
      <p className="mt-5 max-w-[56ch] text-lg text-muted">
        Brindle Recovery is in private beta. The pilot is free. There is no checkout, no card form
        and no billing anywhere in this product, because we would rather earn a price than invent
        one.
      </p>
      <div className="mt-10 rounded-lg bg-surface p-8 shadow-raise">
        <h2 className="text-2xl font-semibold">Private beta pilot</h2>
        <p className="mt-1 text-muted">Free. By request.</p>
        <ul className="mt-6 space-y-2">
          {INCLUDED.map((i) => (
            <li key={i} className="flex gap-2">
              <Check size={18} className="mt-1 shrink-0 text-recovery-text" aria-hidden />
              {i}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/beta" className={buttonClass("primary", "lg")}>
            Request access
          </Link>
          <Link href="/demo" className={buttonClass("secondary", "lg")}>
            See the tour first
          </Link>
        </div>
      </div>
      <h2 className="mt-14 text-xl font-semibold">What is not included yet</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
        <li>Connectors that execute recovery inside your own systems.</li>
        <li>Single sign-on, audit export and service-level agreements.</li>
        <li>Invoices or paid plans. If that changes you will hear it from us first.</li>
      </ul>
    </div>
  );
}
