/** A run of the featured banner's info text: plain words, or a link. */
export interface BannerInfoPart {
  text: string;
  href?: string;
}

/**
 * Splits the banner's `info` string, which Horizon inserts as raw HTML, into
 * text and links. Only anchors with an http(s) address stay links; every
 * other tag is reduced to its text, so nothing from the feed reaches the
 * page as markup. The parsed document is inert: no script runs and no
 * resource loads while it is read.
 */
export function parseBannerInfo(html: string): BannerInfoPart[] {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const parts: BannerInfoPart[] = [];

  const addText = (text: string) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last && last.href === undefined) {
      last.text += text;
    } else {
      parts.push({ text });
    }
  };

  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        addText(child.textContent ?? "");
      } else if (child instanceof Element) {
        // Code is not words: a script's or style sheet's source is dropped.
        if (child.localName === "script" || child.localName === "style") {
          continue;
        }
        const href = child.getAttribute("href") ?? "";
        const text = child.textContent ?? "";
        if (child.localName === "a" && /^https?:\/\//i.test(href) && text) {
          parts.push({ text, href });
        } else {
          walk(child);
        }
      }
    }
  };

  walk(body);
  return parts;
}

/**
 * Whether a banner link leads to another site, which opens in a new tab.
 * Paths on this site (an old Horizon path such as "/project/reservations/")
 * stay in the dashboard, where the router redirects them.
 */
export function isOtherSite(link: string, origin: string): boolean {
  try {
    return new URL(link, origin).origin !== origin;
  } catch {
    return true;
  }
}

/**
 * The library link variant for a banner button's colour, as Horizon maps
 * it: the brand colours are the primary button, anything else (Horizon's
 * "grey") the secondary.
 */
export function bannerButtonVariant(
  color: string | undefined,
): "primary" | "secondary" {
  return color && ["blue", "pink", "orange", "purple"].includes(color)
    ? "primary"
    : "secondary";
}
