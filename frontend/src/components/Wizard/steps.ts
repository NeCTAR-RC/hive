import type { ComponentType } from "react";

/**
 * One step of a wizard: the title the library `Stepper` shows (and the
 * step's heading), the form fields Next validates before moving on, and the
 * component that renders the step's fields. The component reads the form
 * from context and takes the props the page hands every step (`TProps`,
 * typically the loaded options).
 */
export interface WizardStep<TField extends string, TProps extends object> {
  title: string;
  fields: readonly TField[];
  Component: ComponentType<TProps>;
}

/**
 * A wizard's steps as a typed record, in the order they run: the record's
 * key order (string keys keep the order they are written in).
 */
export type WizardSteps<
  TId extends string,
  TField extends string,
  TProps extends object,
> = Record<TId, WizardStep<TField, TProps>>;

/** The step ids in the order the record declares them. */
export function stepOrder<TId extends string>(
  steps: Record<TId, unknown>,
): TId[] {
  return Object.keys(steps) as TId[];
}

/** The step after `current`; the last step stays where it is. */
export function stepAfter<TId extends string>(
  order: readonly TId[],
  current: TId,
): TId {
  return order[Math.min(order.indexOf(current) + 1, order.length - 1)]!;
}

/** The step before `current`; the first step stays where it is. */
export function stepBefore<TId extends string>(
  order: readonly TId[],
  current: TId,
): TId {
  return order[Math.max(order.indexOf(current) - 1, 0)]!;
}

/** Whether `target` comes before `current`, so a completed step to go back to. */
export function isBefore<TId extends string>(
  order: readonly TId[],
  target: TId,
  current: TId,
): boolean {
  const index = order.indexOf(target);
  return index >= 0 && index < order.indexOf(current);
}

/**
 * The first step holding a field with an error, so a failed submit can show
 * it. An error on a nested field (`members.0.address`) counts for the step
 * that lists its root (`members`). `undefined` when no step lists any.
 */
export function firstStepWithError<TId extends string>(
  order: readonly TId[],
  steps: Record<TId, { fields: readonly string[] }>,
  errors: object,
): TId | undefined {
  return order.find((id) =>
    steps[id].fields.some((field) => field.split(".")[0]! in errors),
  );
}
