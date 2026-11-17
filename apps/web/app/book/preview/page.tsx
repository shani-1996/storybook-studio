"use client";

import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import { getBlob, ref } from "firebase/storage";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useRequireUser } from "../../../components/auth";
import { Flipbook } from "../../../components/Flipbook";
import { ErrorText, Page } from "../../../components/ui";
import { db, previewStorage } from "../../../lib/firebase";
import { previewView } from "../../../lib/helpers";
import copy from "../../../lib/generated/copy.en.json";

const T = copy.preview;

interface BookView {
  status: string;
  previewBlocked?: string | null;
}

function Preview() {
  const { user, loading } = useRequireUser();
  const bookId = useSearchParams().get("book");
  const [book, setBook] = useState<BookView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<string[] | null>(null);

  // Live: the page moves from "working" to the book by itself when the job finishes.
  useEffect(() => {
    if (!user || !bookId) return;
    return onSnapshot(
      doc(db, "books", bookId),
      (s) => setBook(s.exists() ? { status: s.data().status as string, previewBlocked: (s.data().previewBlocked as string | null | undefined) ?? null } : null),
      () => setError("We could not open this book."),
    );
  }, [user, bookId]);

  const view = book ? previewView(book) : null;

  useEffect(() => {
    if (view !== "ready" || !bookId) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      try {
        const snap = await getDocs(collection(db, "books", bookId, "pages"));
        const list = snap.docs.map((d) => d.data() as { pageNo: number; webpPath: string }).sort((a, b) => a.pageNo - b.pageNo);
        for (const p of list) urls.push(URL.createObjectURL(await getBlob(ref(previewStorage, p.webpPath))));
        if (!cancelled) setPages([...urls]);
      } catch {
        if (!cancelled) setError(T.pagesError);
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [view, bookId]);

  if (!bookId) return <Page title={T.title}><ErrorText>We could not find your book. <Link href="/create/details" className="underline">Start again</Link>.</ErrorText></Page>;
  if (loading || !user || (book === null && !error)) return <Page title={T.title}><p role="status">Loading...</p></Page>;
  if (book === null) return <Page title={T.title}>{error && <ErrorText>{error}</ErrorText>}</Page>;

  return (
    <Page title={view === "ready" ? T.readyHeading : T.title} wide={view === "ready"}>
      {error && <ErrorText>{error}</ErrorText>}
      {view === "not_ready" && (
        <p>
          Please finish adding and checking your photos first. <Link href={`/create/photos?book=${bookId}`} className="underline">Back to photos</Link>
        </p>
      )}
      {view === "working" && (
        <div role="status" className="flex flex-col gap-4">
          <p>{T.working}</p>
          <ol className="list-inside list-decimal space-y-1 opacity-80">
            {T.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </div>
      )}
      {view === "failed" && <ErrorText>{T.failed}</ErrorText>}
      {view === "blocked" && <ErrorText>{T.blocked}</ErrorText>}
      {view === "not_invited" && <p role="status" className="rounded-lg bg-teal-100 px-4 py-3 text-teal-950">{T.notInvited}</p>}
      {view === "limit_user" && <p role="status">{T.limitUser}</p>}
      {view === "limit_daily" && <p role="status">{T.limitDaily}</p>}
      {view === "ready" && (
        <>
          <p>{T.readyHint}</p>
          {pages ? <Flipbook pages={pages} labels={{ prev: T.prev, next: T.next }} /> : !error && <p role="status">{T.loadingPages}</p>}
        </>
      )}
    </Page>
  );
}

export default function PreviewPage() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}
