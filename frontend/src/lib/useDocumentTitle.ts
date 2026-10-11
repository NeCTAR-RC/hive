import { useEffect } from "react";

const SITE = "Nectar Dashboard";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} | ${SITE}` : SITE;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
