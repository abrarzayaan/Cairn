"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Github } from "lucide-react";
import { fetchMe } from "@/lib/api";
import { Button } from "@/components/ui/Button";

function readCsrfCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * Initiates GitHub OAuth strictly via CSRF-protected POST form (blocks OAuth Login CSRF).
 */
export default function GitHubLoginButton() {
  const formRef = useRef<HTMLFormElement>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchMe().then((res) => {
      if (res.authenticated && res.user) {
        window.location.href = "/";
        return;
      }
      setCsrfToken(readCsrfCookie());
    });
  }, []);

  const handleContinue = async () => {
    if (submitting) return;
    setSubmitting(true);

    let token = csrfToken || readCsrfCookie();
    if (!token) {
      await fetchMe();
      token = readCsrfCookie();
      setCsrfToken(token);
    }

    if (formRef.current) {
      const input = formRef.current.querySelector<HTMLInputElement>(
        'input[name="csrfmiddlewaretoken"]',
      );
      if (input) input.value = token;
      formRef.current.submit();
    } else {
      setSubmitting(false);
    }
  };

  return (
    <form
      ref={formRef}
      method="POST"
      action="/accounts/github/login/"
      className="w-full"
    >
      <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
      <Button
        type="button"
        variant="primary"
        size="lg"
        loading={submitting}
        onClick={handleContinue}
        className="w-full"
      >
        <Github className="h-4 w-4" />
        <span>Continue with GitHub</span>
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}
