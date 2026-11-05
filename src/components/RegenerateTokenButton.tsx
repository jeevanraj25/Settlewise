"use client";

import { useTransition } from "react";
import { regenerateMcpToken } from "@/app/actions/settings";

export default function RegenerateTokenButton() {
  const [isPending, startTransition] = useTransition();

  const handleRegenerate = () => {
    const confirmed = window.confirm(
      "Are you sure you want to rotate your MCP token?\n\nYour current MCP URL will stop working immediately, and you will need to update the URL in Claude's settings."
    );
    if (!confirmed) return;

    startTransition(async () => {
      await regenerateMcpToken();
    });
  };

  return (
    <button
      type="button"
      onClick={handleRegenerate}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-white text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors shadow-xs"
    >
      <svg
        className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      {isPending ? "Revoking & generating…" : "Rotate MCP Token"}
    </button>
  );
}
