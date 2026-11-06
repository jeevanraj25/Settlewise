"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/app/actions/auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const params = useSearchParams();
  const registered = params.get("registered");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const fillDemoCredentials = () => {
    setEmail("demo@collectly.test");
    setPassword("demo1234");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
        <p className="text-sm text-gray-500 mb-5">Log in to your Settlewise account</p>

        {/* Demo Credentials Box */}
        <div className="mb-5 rounded-lg border border-indigo-100 bg-indigo-50/70 p-3.5 text-xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-indigo-950 flex items-center gap-1.5">
              <span>💡</span> Demo Account
            </span>
            <button
              type="button"
              onClick={fillDemoCredentials}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              Auto-fill demo
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            For testing and evaluation, you can use these pre-loaded demo credentials:
          </p>
          <div className="space-y-1 font-mono text-[11px] text-gray-600 bg-white/80 p-2 rounded border border-indigo-100/60">
            <div>
              Email: <strong className="text-gray-900 select-all">demo@collectly.test</strong>
            </div>
            <div>
              Password: <strong className="text-gray-900 select-all">demo1234</strong>
            </div>
          </div>
        </div>

        {registered && (
          <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
            Account created! You can now log in.
          </div>
        )}

        {state?.message && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {state.message}
          </div>
        )}

        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ color: "#111827", backgroundColor: "#ffffff" }}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ color: "#111827", backgroundColor: "#ffffff" }}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {pending ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-indigo-600 hover:underline font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
