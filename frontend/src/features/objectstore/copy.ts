// The name a copy of an object starts with: the same folder, the name
// marked as a copy, and free in the folder as far as its listing shows.

/**
 * A free name for a copy of `name` beside it: "notes/todo.txt" becomes
 * "notes/todo (copy).txt", then "notes/todo (copy 2).txt" and so on while
 * `taken` (the full names already in the folder) holds the candidate. The
 * extension stays at the end; a name that starts with its only dot, such
 * as ".env", has none.
 */
export function copyName(name: string, taken: ReadonlySet<string>): string {
  const slash = name.lastIndexOf("/");
  const folder = name.slice(0, slash + 1);
  const basename = name.slice(slash + 1);
  const dot = basename.lastIndexOf(".");
  const stem = dot > 0 ? basename.slice(0, dot) : basename;
  const extension = dot > 0 ? basename.slice(dot) : "";
  for (let n = 1; ; n += 1) {
    const mark = n === 1 ? "copy" : `copy ${n}`;
    const candidate = `${folder}${stem} (${mark})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}
