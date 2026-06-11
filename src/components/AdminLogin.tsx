"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      setError((await response.json()).error ?? "No se pudo iniciar sesión");
      setLoading(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form onSubmit={submit} className="card w-full max-w-md p-7 sm:p-9">
        <span className="eyebrow">Acceso restringido</span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-.06em]">Consola meteorológica</h1>
        <p className="mt-3 text-sm leading-6 text-[#668078]">
          Acceso a fuentes, algoritmos, métricas, perfiles geográficos y cálculos internos.
        </p>
        <label className="mt-7 block text-xs font-extrabold uppercase tracking-wider">
          Contraseña administrativa
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-[#176b55]/20 bg-white px-4 py-3 text-sm outline-none focus:border-[#176b55]"
          />
        </label>
        {error && <p className="mt-3 rounded-xl bg-[#fff1ef] p-3 text-xs font-bold text-[#a9423b]">{error}</p>}
        <button disabled={loading} className="mt-5 w-full rounded-xl bg-[#176b55] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-60">
          {loading ? "Comprobando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
