"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-lg p-8">
        <span className="eyebrow">Error</span>
        <h1 className="mt-3 text-2xl font-extrabold">Algo salió mal</h1>
        <p className="mt-3 text-sm text-[#668078]">
          {error.message || "Error inesperado al cargar la página."}
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-xl bg-[#176b55] px-4 py-2 text-xs font-bold text-white"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
