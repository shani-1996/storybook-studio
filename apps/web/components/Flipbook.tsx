"use client";

import { useEffect, useRef, useState } from "react";
import type { PageFlip } from "page-flip";
import { SecondaryButton } from "./ui";

/** Trim size 11 x 8.5 in (landscape): every page has this shape. */
const PAGE_W = 1100;
const PAGE_H = 850;

/**
 * A book you can flip: the cover alone, then two pages side by side. Drag a corner, press the arrow keys or use the buttons.
 * On a narrow phone it shows one page at a time.
 */
export function Flipbook({ pages, labels }: { pages: string[]; labels: { prev: string; next: string } }) {
  const host = useRef<HTMLDivElement>(null);
  const flip = useRef<PageFlip | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el || pages.length === 0) return;
    let disposed = false;
    void import("page-flip").then(({ PageFlip }) => {
      if (disposed) return;
      const book = new PageFlip(el, {
        width: PAGE_W,
        height: PAGE_H,
        size: "stretch",
        minWidth: 280,
        maxWidth: 1100,
        minHeight: 217,
        maxHeight: 850,
        showCover: true,
        usePortrait: true,
        mobileScrollSupport: true,
        drawShadow: true,
        maxShadowOpacity: 0.35,
        flippingTime: 700,
      });
      book.loadFromImages(pages);
      book.on("flip", (e) => setIndex(Number(e.data)));
      flip.current = book;
    });
    return () => {
      disposed = true;
      flip.current?.destroy();
      flip.current = null;
    };
  }, [pages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") flip.current?.flipNext();
      if (e.key === "ArrowLeft") flip.current?.flipPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={host} className="w-full" style={{ aspectRatio: "22 / 8.5", maxWidth: 1100 }} aria-label="Your book preview" />
      <div className="flex items-center gap-4">
        <SecondaryButton type="button" onClick={() => flip.current?.flipPrev()} aria-label={labels.prev} disabled={index === 0}>
          ←
        </SecondaryButton>
        <span className="text-sm opacity-75" aria-live="polite">
          {index + 1} / {pages.length}
        </span>
        <SecondaryButton type="button" onClick={() => flip.current?.flipNext()} aria-label={labels.next} disabled={index >= pages.length - 1}>
          →
        </SecondaryButton>
      </div>
    </div>
  );
}
