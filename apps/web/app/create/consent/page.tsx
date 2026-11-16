"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useRequireUser } from "../../../components/auth";
import { Button, ErrorText, Page } from "../../../components/ui";
import { db, functions } from "../../../lib/firebase";
import copy from "../../../lib/generated/copy.en.json";
import { CONSENT_VERSION } from "../../../lib/generated";

interface BookView {
  status: string;
  consentVersion?: string;
}

function Consent() {
  const { user, loading } = useRequireUser();
  const bookId = useSearchParams().get("book");
  const [book, setBook] = useState<BookView | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !bookId) return;
    return onSnapshot(
      doc(db, "books", bookId),
      (s) => setBook(s.exists() ? { status: s.data().status as string, consentVersion: (s.data().consent as { version?: string } | undefined)?.version } : null),
      () => setError("We could not open this book."),
    );
  }, [user, bookId]);

  async function submit() {
    if (!bookId) return;
    setBusy(true);
    setError(null);
    try {
      await httpsCallable(functions, "submitConsent")({ bookId, version: CONSENT_VERSION });
    } catch (e) {
      const message = e instanceof Error && "code" in e ? (e as { message: string }).message : "";
      setError(message || "We could not save your consent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!bookId) return <Page title="Before we start"><ErrorText>We could not find your book. <Link href="/create/details" className="underline">Start again</Link>.</ErrorText></Page>;
  if (loading || !user || (book === null && !error)) return <Page title="Before we start"><p role="status">Loading...</p></Page>;

  const done = book?.consentVersion === CONSENT_VERSION;
  const photosReady = book?.status === "photos_ready";

  return (
    <Page title="Before we start">
      {error && <ErrorText>{error}</ErrorText>}
      {done ? (
        <p role="status" className="rounded-lg bg-teal-100 px-4 py-3 text-teal-950">
          Thank you. Your consent is saved. Creating your free preview is the next step, and it is coming soon.
        </p>
      ) : !photosReady ? (
        <p>
          Please finish adding and checking your photos first. <Link href={`/create/photos?book=${bookId}`} className="underline">Back to photos</Link>
        </p>
      ) : (
        <>
          <blockquote className="rounded-lg bg-white/60 px-4 py-3 leading-relaxed dark:bg-white/10">{copy.consent.text}</blockquote>
          <p className="text-sm opacity-75">Consent text version {CONSENT_VERSION}</p>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>I have read and agree to the above.</span>
          </label>
          <Button type="button" disabled={!accepted || busy} onClick={submit}>Confirm and continue</Button>
        </>
      )}
    </Page>
  );
}

export default function ConsentPage() {
  return (
    <Suspense>
      <Consent />
    </Suspense>
  );
}
