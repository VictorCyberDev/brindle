import { BetaForm } from "./beta-form";

export const metadata = {
  title: "Request private beta access",
  description: "Brindle Recovery is in private beta. Tell us about your agents.",
};

export default function BetaPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-5 py-16 md:grid-cols-[1fr_1.1fr]">
      <div>
        <p className="eyebrow mb-3">Private beta</p>
        <h1 className="display text-5xl">Tell us what your agents do.</h1>
        <p className="mt-5 max-w-[46ch] text-lg text-muted">
          The beta is a free pilot for teams whose AI agents act on business facts that can change
          after the fact. We read every request.
        </p>
        <ul className="mt-6 space-y-2 text-muted">
          <li>Free during the beta. No billing exists in this product.</li>
          <li>We store this form and a salted hash of your network address to limit abuse.</li>
          <li>We never sell or share it.</li>
        </ul>
      </div>
      <BetaForm />
    </div>
  );
}
