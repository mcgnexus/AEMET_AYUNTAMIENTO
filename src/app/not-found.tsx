import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="card max-w-lg p-8 text-center">
        <span className="eyebrow">404</span>
        <h1 className="mt-3 text-2xl font-extrabold">Página no encontrada</h1>
        <p className="mt-3 text-sm text-[#668078]">
          La ruta solicitada no existe en Meteo Huéscar.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-xl bg-[#176b55] px-4 py-2 text-xs font-bold text-white"
        >
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
