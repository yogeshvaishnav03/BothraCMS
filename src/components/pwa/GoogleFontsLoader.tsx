"use client";

import { useEffect } from "react";

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap";

export function GoogleFontsLoader() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("bothra-google-fonts")) return;

    const link = document.createElement("link");
    link.id = "bothra-google-fonts";
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS_HREF;
    document.head.appendChild(link);
  }, []);

  return null;
}
