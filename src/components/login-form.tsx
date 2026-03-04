"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, secret })
    });

    const data = await response.json().catch(() => ({}));
    setIsSubmitting(false);

    if (!response.ok) {
      setError(data.error ?? "Login failed");
      return;
    }

    if (data.role === "ADMIN") {
      router.push("/admin");
    } else {
      router.push("/scorecard");
    }

    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel mx-auto mt-10 flex w-full max-w-md flex-col gap-4">
      <p className="pill w-fit">Golf Weekend</p>
      <h1 className="text-4xl font-semibold leading-tight">Sign In</h1>
      <p className="text-sm text-slate-600">Use your username and password or 6-digit PIN.</p>
      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Username</label>
      <input
        className="bg-white/90 px-4 py-3"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        required
      />
      <label className="text-sm font-semibold uppercase tracking-wide text-slate-600">Password / PIN</label>
      <input
        className="bg-white/90 px-4 py-3"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        type="password"
        autoComplete="current-password"
        required
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary mt-2" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-xs text-slate-500">Players: PIN login. Admin: password login.</p>
    </form>
  );
}
