/** Hand the browser a text file to save (private keys, openrc files). */
export function downloadText(
  filename: string,
  text: string,
  type = "text/plain",
): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Hand the browser a same-origin URL to save (calendar files). */
export function downloadUrl(url: string, filename?: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
