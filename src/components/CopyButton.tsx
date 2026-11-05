"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="shrink-0 rounded px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 border border-indigo-200"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
