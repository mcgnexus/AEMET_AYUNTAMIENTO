export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center">
        <div className="loading-dot mx-auto mb-4 h-4 w-4 rounded-full bg-[#176b55]" />
        <p className="eyebrow">Cargando...</p>
      </div>
    </main>
  );
}
