"use client";

import { useState } from "react";

export default function CopyLinkButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded border border-border-strong bg-bg px-2.5 py-1 font-mono text-xs text-text-muted hover:bg-bg-subtle hover:text-text"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

