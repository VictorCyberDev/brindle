export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-4xl font-semibold tracking-tight">Brindle</h1>
      <p className="text-lg text-neutral-700">The Recovery Plane for AI Agents.</p>
      <p className="text-sm text-neutral-500">
        Foundation milestone (M0). Service status: <code>/api/health</code>.
      </p>
    </main>
  );
}
