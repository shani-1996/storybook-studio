"use client";

import { collection, doc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRequireUser } from "../../../components/auth";
import { ErrorText, Page, SecondaryButton, Button } from "../../../components/ui";
import { db, storage } from "../../../lib/firebase";
import { PHOTO_SLOTS, precheckPhoto, uploadContentType, type PhotoSlot } from "../../../lib/helpers";
import copy from "../../../lib/generated/copy.en.json";

type Reasons = Record<string, string>;
const REASONS = copy.photoCheck.reasons as Reasons;

interface PhotoDoc {
  checkStatus: "pending" | "pass" | "fail";
  failReason?: string;
}

const PRECHECK_MESSAGES = {
  TOO_LARGE: "This photo is larger than 15 MB. Please choose a smaller one.",
  NOT_AN_IMAGE: REASONS["UNREADABLE"] as string,
  EMPTY: "This file is empty. Please choose another photo.",
} as const;

function Photos() {
  const { user, loading } = useRequireUser();
  const router = useRouter();
  const bookId = useSearchParams().get("book");
  const [status, setStatus] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, PhotoDoc>>>({});
  const [uploading, setUploading] = useState<Partial<Record<PhotoSlot, boolean>>>({});
  const [localError, setLocalError] = useState<Partial<Record<PhotoSlot, string>>>({});
  const [previews, setPreviews] = useState<Partial<Record<PhotoSlot, string>>>({});
  const [loadError, setLoadError] = useState(false);

  // One listener for the book, one for its three photo results.
  useEffect(() => {
    if (!user || !bookId) return;
    const stopBook = onSnapshot(doc(db, "books", bookId), (s) => setStatus(s.exists() ? (s.data().status as string) : null), () => setLoadError(true));
    const stopPhotos = onSnapshot(collection(db, "books", bookId, "photos"), (s) => {
      const next: Partial<Record<PhotoSlot, PhotoDoc>> = {};
      s.forEach((d) => {
        next[d.id as PhotoSlot] = d.data() as PhotoDoc;
      });
      setPhotos(next);
    });
    return () => {
      stopBook();
      stopPhotos();
    };
  }, [user, bookId]);

  useEffect(() => () => Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  async function choose(slot: PhotoSlot, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again after a failure
    if (!file || !bookId) return;

    const problem = precheckPhoto(file);
    if (problem) {
      setLocalError((p) => ({ ...p, [slot]: PRECHECK_MESSAGES[problem] }));
      return;
    }
    setLocalError((p) => ({ ...p, [slot]: undefined }));
    setUploading((p) => ({ ...p, [slot]: true }));
    setPreviews((p) => ({ ...p, [slot]: URL.createObjectURL(file) }));
    try {
      await uploadBytes(ref(storage, `books/${bookId}/photos/${slot}`), file, { contentType: uploadContentType(file) });
    } catch {
      setLocalError((p) => ({ ...p, [slot]: "The upload did not work. Please try again." }));
    } finally {
      setUploading((p) => ({ ...p, [slot]: false }));
    }
  }

  if (!bookId) return <Page title="Add three photos"><ErrorText>We could not find your book. <Link href="/create/details" className="underline">Start again</Link>.</ErrorText></Page>;
  if (loading || !user) return <Page title="Add three photos"><p role="status">Loading...</p></Page>;
  if (loadError || status === null) return <Page title="Add three photos"><p role="status">{loadError ? "We could not open this book." : "Loading..."}</p></Page>;

  const ready = status === "photos_ready";
  return (
    <Page title="Add three photos">
      <p>
        Choose three clear photos of your child, one child only, face visible, looking toward the camera, no hat or sunglasses.
        We check each photo in a few seconds.
      </p>
      <ul className="flex flex-col gap-4">
        {PHOTO_SLOTS.map((slot, i) => (
          <PhotoRow key={slot} index={i + 1} slot={slot} doc={photos[slot]} busy={!!uploading[slot]} error={localError[slot]} preview={previews[slot]} onChoose={choose} />
        ))}
      </ul>
      {status === "photos_failed" && <ErrorText>Please replace the photo marked above, then we will check it again.</ErrorText>}
      <Button type="button" disabled={!ready} onClick={() => router.push(`/create/consent?book=${bookId}`)}>
        {ready ? "Next: confirm and continue" : "Waiting for three good photos"}
      </Button>
    </Page>
  );
}

function PhotoRow(props: {
  index: number;
  slot: PhotoSlot;
  doc?: PhotoDoc;
  busy: boolean;
  error?: string;
  preview?: string;
  onChoose: (slot: PhotoSlot, e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const { index, slot, doc: d, busy, error, preview, onChoose } = props;
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  let chip = "No photo yet";
  let tone = "bg-neutral-200 text-neutral-900";
  if (busy) { chip = "Uploading..."; tone = "bg-blue-100 text-blue-950"; }
  else if (d?.checkStatus === "pending") { chip = copy.photoCheck.status.pending; tone = "bg-blue-100 text-blue-950"; }
  else if (d?.checkStatus === "pass") { chip = copy.photoCheck.status.pass; tone = "bg-green-100 text-green-950"; }
  else if (d?.checkStatus === "fail") { chip = copy.photoCheck.status.fail; tone = "bg-red-100 text-red-950"; }

  const reason = error ?? (d?.checkStatus === "fail" ? REASONS[d.failReason ?? "CHECK_FAILED"] ?? REASONS["CHECK_FAILED"] : undefined);
  const chooseLabel = d?.checkStatus === "pass" ? "Replace" : "Choose photo";

  return (
    <li className="flex flex-col gap-2 rounded-lg bg-white/60 p-3 dark:bg-white/10">
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`Photo ${index} you chose`} className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-neutral-300 text-neutral-700" aria-hidden="true">{index}</div>
        )}
        <div className="flex flex-1 flex-col gap-1">
          <span className="font-semibold">Photo {index}</span>
          <span role="status" aria-live="polite" className={`self-start rounded-full px-3 py-1 text-sm ${tone}`}>{chip}</span>
        </div>
      </div>
      {reason && <p role="alert" className="text-red-800">{reason}</p>}
      <div className="flex flex-wrap gap-2">
        <SecondaryButton type="button" disabled={busy} onClick={() => gallery.current?.click()}>{chooseLabel}</SecondaryButton>
        <SecondaryButton type="button" disabled={busy} onClick={() => camera.current?.click()}>Take photo</SecondaryButton>
      </div>
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" className="sr-only" tabIndex={-1} aria-label={`Choose photo ${index}`} onChange={(e) => onChoose(slot, e)} />
      <input ref={camera} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-label={`Take photo ${index}`} onChange={(e) => onChoose(slot, e)} />
    </li>
  );
}

export default function PhotosPage() {
  return (
    <Suspense>
      <Photos />
    </Suspense>
  );
}
