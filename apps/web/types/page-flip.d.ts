// The page-flip package ships without type declarations: only the parts we use.
declare module "page-flip" {
  export interface PageFlipSettings {
    width: number;
    height: number;
    size?: "fixed" | "stretch";
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    showCover?: boolean;
    usePortrait?: boolean;
    mobileScrollSupport?: boolean;
    drawShadow?: boolean;
    maxShadowOpacity?: number;
    flippingTime?: number;
  }
  export class PageFlip {
    constructor(element: HTMLElement, settings: PageFlipSettings);
    loadFromImages(urls: string[]): void;
    on(event: "flip", handler: (e: { data: number | string }) => void): this;
    flipNext(): void;
    flipPrev(): void;
    destroy(): void;
  }
}
