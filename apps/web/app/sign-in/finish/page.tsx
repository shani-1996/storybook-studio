"use client";

import { isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, ErrorText, inputClass, Page } from "../../../components/ui";
import { auth } from "../../../lib/firebase";
import { safeNext } from "../../../lib/helpers";

function Finish() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function complete(address: string) {
    try {
      await signInWithEmailLink(auth, address, window.location.href);
      try {
        window.localStorage.removeItem("emailForSignIn");
      } catch {
        /* nothing to clear */
      }
      router.replace(next);
    } catch {
      setError("This sign-in link has expired or was already used. Please request a new one.");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!isSignInWithEmailLink(auth, window.location.href)) {
      setError("This is not a valid sign-in link. Please request a new one.");
      return;
    }
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("emailForSignIn");
    } catch {
      /* private mode */
    }
    // Opened on another device or browser: ask for the email again (protects against link forwarding).
    if (saved) void complete(saved);
    else setNeedEmail(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    setNeedEmail(false);
    void complete(email.trim());
  }

  return (
    <Page title="Signing you in">
      {error && (
        <>
          <ErrorText>{error}</ErrorText>
          <a href="/sign-in" className="underline">
            Back to sign in
          </a>
        </>
      )}
      {needEmail && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="email" className="font-semibold">
            Please confirm your email address
          </label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          <Button type="submit" disabled={!email}>
            Continue
          </Button>
        </form>
      )}
      {!error && !needEmail && <p role="status">One moment...</p>}
    </Page>
  );
}

export default function FinishPage() {
  return (
    <Suspense>
      <Finish />
    </Suspense>
  );
}
