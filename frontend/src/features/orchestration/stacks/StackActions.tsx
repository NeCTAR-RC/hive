// Every stack action in the stack menu behind one hook, shared by the stacks
// list and the stack page: `run(action, stacks)` suspends, resumes,
// checks or cancels the update of the batch at once, as heat-dashboard
// runs its actions, or deletes it after asking. The hook returns the
// dialogs to render.
import type { Verb } from "../../../components/BulkAction/messages";
import { DELETE } from "../../../components/BulkAction/messages";
import {
  useBulkAction,
  type BulkActionSpec,
} from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { Stack } from "../../../lib/api/types/orchestration";
import {
  deleteStack,
  orchestrationWriteKeys,
  requestStackAction,
} from "../api";
import { availableStackActions, type StackActionId } from "../status";

/** The spec of an action Heat runs at once, without asking first. */
function immediateSpec(
  id: Exclude<StackActionId, "delete">,
  verb: Verb,
): BulkActionSpec<Stack> {
  return {
    verb,
    tone: "primary",
    immediate: true,
    eligible: (stack) => allows(availableStackActions(stack), id),
    request: (stack) => requestStackAction(stack.id, id),
  };
}

const getId = (stack: Stack) => stack.id;
const getName = (stack: Stack) => stack.name;

/**
 * The stack actions. `onDeleted` runs once a delete has removed at least
 * one stack, so the stack page can go back to the list.
 */
export function useStackActions(onDeleted?: () => void) {
  const bulk = useBulkAction<Stack, StackActionId>({
    noun: { one: "stack", many: "stacks" },
    name: getName,
    getId,
    invalidates: orchestrationWriteKeys,
    actions: {
      suspend: immediateSpec("suspend", {
        label: "Suspend",
        done: "Suspending",
        failed: "suspend",
      }),
      resume: immediateSpec("resume", {
        label: "Resume",
        done: "Resuming",
        failed: "resume",
      }),
      check: immediateSpec("check", {
        label: "Check",
        done: "Checking",
        failed: "check",
      }),
      cancel_update: immediateSpec("cancel_update", {
        label: "Cancel the update of",
        done: "Cancelling the update of",
        failed: "cancel the update of",
      }),
      delete: {
        verb: DELETE,
        request: (stack) => deleteStack(stack.id),
        body: (
          <p>
            Every resource the stack created is deleted with it. This cannot be
            undone.
          </p>
        ),
        eligible: (stack) => allows(availableStackActions(stack), "delete"),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  return { run: bulk.run, dialogs: bulk.dialog, tableProps: bulk.tableProps };
}
