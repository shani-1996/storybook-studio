"use client";

import { GoogleAuthProvider, sendSignInLinkToEmail, signInWithPopup } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../components/auth";
import { Button, ErrorText, inputClass, Page, SecondaryButton } from "../../components/ui";
import { auth } from "../../lib/firebase";
import { safeNext } from "../../lib/helpers";

function SignIn() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendSignInLinkToEmail(auth, email.trim(), {
        url: `${window.location.origin}/sign-in/finish?next=${encodeURIComponent(next)}`,
        handleCodeInApp: true,
      });
      try {
        window.localStorage.setItem("emailForSignIn", email.trim());
      } catch {
        /* private mode: we will ask for the email again on the next page */
      }
      setSent(true);
    } catch {
      setError("We could not send the link. Please check the email address and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setError("Google sign-in did not complete. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Sign in">
      <p>Only adults can create a book. Sign in with your email, or with Google.</p>
      {error && <ErrorText>{error}</ErrorText>}
      {sent ? (
        <p role="status" className="rounded-lg bg-teal-100 px-3 py-3 text-teal-950">
          We sent a sign-in link to {email.trim()}. Open it on this device to continue.
        </p>
      ) : (
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          <label htmlFor="email" className="font-semibold">
            Your email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <Button type="submit" disabled={busy || !email}>
            Email me a sign-in link
          </Button>
        </form>
      )}
      <SecondaryButton type="button" onClick={google} disabled={busy}>
        Continue with Google
      </SecondaryButton>
    </Page>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
