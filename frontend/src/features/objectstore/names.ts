// The name rule every object store form shares: the object store refuses
// "." and ".." as a container name, an object name or a folder in a path.

/** What a form says about a name with a "." or ".." part. */
export const DOT_SEGMENT_MESSAGE = 'A name or folder cannot be "." or ".."';

/** Whether no slash-separated part of `name` is "." or "..". */
export function hasNoDotSegments(name: string): boolean {
  return !name.split("/").some((part) => part === "." || part === "..");
}
