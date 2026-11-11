import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker } from "@tanstack/react-router";
import { ConfirmDialog } from "../ConfirmDialog/ConfirmDialog";

/** A create page's guard against losing what the user entered. */
export interface LeaveGuard {
  /**
   * Lets the page go after its create succeeded: releases the guard, then
   * runs `go` (the navigation away) once the release has rendered, because
   * the router's blocker reads the guard from the render that made it.
   */
  leave: (go: () => void) => void;
  /** The "Leave without ...?" question, rendered while a leave is blocked. */
  dialog: ReactNode;
}

/**
 * Asks before the user leaves a create page with unsaved input: a router
 * navigation (a link, the back button) opens a confirm dialog titled
 * `title`, and closing or reloading the tab gets the browser's own prompt.
 * Nothing is asked while `isDirty` is false, or once `leave` has released
 * the guard after a successful create.
 */
export function useLeaveGuard({
  isDirty,
  title,
}: {
  isDirty: boolean;
  title: string;
}): LeaveGuard {
  const [released, setReleased] = useState(false);
  const afterRelease = useRef<(() => void) | null>(null);
  const guarded = isDirty && !released;
  const blocker = useBlocker({
    shouldBlockFn: () => guarded,
    enableBeforeUnload: () => guarded,
    withResolver: true,
  });

  useEffect(() => {
    if (!released) return;
    afterRelease.current?.();
    afterRelease.current = null;
  }, [released]);

  const leave = useCallback((go: () => void) => {
    afterRelease.current = go;
    setReleased(true);
  }, []);

  const dialog = (
    <ConfirmDialog
      isOpen={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
      title={title}
      confirmLabel="Leave"
      onConfirm={() => blocker.proceed?.()}
    >
      <p>Your choices on this page will be lost.</p>
    </ConfirmDialog>
  );

  return { leave, dialog };
}
