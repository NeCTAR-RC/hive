/**
 * Puts keyboard focus back on the page after a batch removed what had it.
 * Deleting the row whose menu opened the confirmation removes the element
 * the dialog would return focus to, and focus falls to the body; this moves
 * it to the table in `region` (React Aria then focuses a row), or to the
 * page heading when there is no table. Focus that landed on a live element
 * is left alone.
 */
export function recoverFocus(region: HTMLElement | null): void {
  const active = document.activeElement;
  if (active && active !== document.body && active.isConnected) return;
  const table = region?.querySelector<HTMLElement>('[role="grid"]');
  const heading = document.querySelector<HTMLElement>("main h1");
  (table ?? heading)?.focus();
}
