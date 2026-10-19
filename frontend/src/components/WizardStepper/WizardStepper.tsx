// A stepper for a wizard whose steps can be visited in any order and which
// marks the steps still needing attention. The design system's Stepper
// (designer ruling 61) is linear: an upcoming step is never pressable and
// a step has no status of its own. This carries the same props and
// behaviour (data-carrier StepItem, positional state, only the active
// panel mounted, aria-current on the current step, compact titles below
// 480px) plus two additive ones, `allowsJumping="any"` and `StepItem.status`
// with `statusLabels`, proposed for the design system. Once that lands the
// launch wizard swaps the import and this file goes.
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { CSSProperties, Key, ReactNode } from "react";
import styles from "./WizardStepper.module.scss";

/** Width below which only the current step keeps its title. */
export const STEPPER_COMPACT_BELOW = 480;

export type StepState = "complete" | "current" | "upcoming";

/** A step still needs attention: answers not given yet, or rejected. */
export type StepStatus = "pending" | "invalid";

export interface StepItemProps {
  /** Identifies the step in `activeStep` and `onActiveStepChange`. */
  id: Key;
  /** The step's title, drawn under its marker and naming the panel. */
  title: ReactNode;
  /** An optional second line under the title. */
  description?: ReactNode;
  /** Marks the step as needing attention; `statusLabels` names it. */
  status?: StepStatus;
  /** The step's panel content, rendered while this is the active step. */
  children?: ReactNode;
}

/**
 * One step: a data carrier that `Stepper` reads and renders as a marker in
 * the indicator and as the panel below it; it never renders itself.
 */
export function StepItem(props: StepItemProps): ReactNode {
  void props;
  throw new Error(
    "<StepItem> is a data carrier for <Stepper> and does not render on its " +
      "own. Place it as a direct child of <Stepper>.",
  );
}

export interface StepperProps {
  /** `StepItem` elements only; arrays and fragments of them are flattened. */
  children: ReactNode;
  /** The step being worked on (controlled). */
  activeStep?: Key;
  /** The step to start on (uncontrolled). The first step by default. */
  defaultActiveStep?: Key;
  /** Called with the step's id whenever the active step changes. */
  onActiveStepChange?: (key: Key) => void;
  /**
   * `true` turns completed steps into buttons; `"any"` makes every step but
   * the current one pressable, for a flow whose steps can be answered in
   * any order.
   * @default false
   */
  allowsJumping?: boolean | "any";
  /**
   * Words appended, visually hidden, to the title of a step with a status,
   * so its name tells a screen reader the same thing the marker shows. The
   * component bakes in no English.
   */
  statusLabels?: Partial<Record<StepStatus, ReactNode>>;
  /**
   * Width in pixels below which only the current step's title stays,
   * measured on the component's own box. `false` keeps every title.
   */
  compactBelow?: number | false;
  className?: string;
  style?: CSSProperties;
  id?: string;
  /** Names the indicator's list of steps. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

function extractItems(children: ReactNode): StepItemProps[] {
  const items: StepItemProps[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === StepItem) {
      items.push(child.props as StepItemProps);
    } else if (child.type === Fragment) {
      items.push(
        ...extractItems((child.props as { children?: ReactNode }).children),
      );
    } else {
      throw new Error(
        "<Stepper> accepts only <StepItem> children (arrays and fragments " +
          "of them are flattened).",
      );
    }
  });
  return items;
}

function TickIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 8.5l3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Stepper({
  children,
  activeStep,
  defaultActiveStep,
  onActiveStepChange,
  allowsJumping = false,
  statusLabels,
  compactBelow = STEPPER_COMPACT_BELOW,
  className,
  style,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: StepperProps) {
  const [compact, setCompact] = useState(false);
  const [internalStep, setInternalStep] = useState(defaultActiveStep);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const titleIdPrefix = useId();

  const items = extractItems(children);
  const threshold = compactBelow === false ? null : compactBelow;
  const thresholdRef = useRef(threshold);

  // Compacting only ever takes titles away, so the decision cannot
  // oscillate: the compact indicator never needs more room than the full.
  const measure = useCallback(() => {
    const element = rootRef.current;
    const limit = thresholdRef.current;
    if (!element || limit === null) {
      setCompact(false);
      return;
    }
    const { width } = element.getBoundingClientRect();
    setCompact(width > 0 && width < limit);
  }, []);

  useEffect(() => {
    thresholdRef.current = threshold;
    measure();
  }, [threshold, measure]);

  const attachRoot = useCallback(
    (element: HTMLDivElement | null) => {
      rootRef.current = element;
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!element) return;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      observerRef.current = observer;
      measure();
    },
    [measure],
  );

  if (items.length === 0) return null;

  const requested = activeStep !== undefined ? activeStep : internalStep;
  const requestedIndex = items.findIndex((item) => item.id === requested);
  const activeIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const activeItem = items[activeIndex]!;

  const goTo = (key: Key) => {
    setInternalStep(key);
    onActiveStepChange?.(key);
  };

  return (
    <div
      ref={attachRoot}
      id={id}
      className={[styles.stepper, className].filter(Boolean).join(" ")}
      style={style}
      data-compact={compact || undefined}
    >
      <ol
        className={styles.list}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
      >
        {items.map((item, index) => {
          const state: StepState =
            index < activeIndex
              ? "complete"
              : index === activeIndex
                ? "current"
                : "upcoming";
          const isPressable =
            allowsJumping === "any"
              ? state !== "current"
              : allowsJumping && state === "complete";
          const titleId = `${titleIdPrefix}-title-${index}`;
          const statusLabel = item.status
            ? statusLabels?.[item.status]
            : undefined;
          const content = (
            <>
              <span className={styles.markerRow}>
                <span className={styles.marker} aria-hidden="true">
                  {state === "complete" ? <TickIcon /> : index + 1}
                  {item.status && (
                    <span
                      className={styles.statusDot}
                      data-status={item.status}
                    />
                  )}
                </span>
              </span>
              <span className={styles.titleBlock}>
                <span className={styles.title} id={titleId}>
                  {item.title}
                </span>
                {/* Outside the title's id, so the panel keeps the bare
                    title as its name while the button says the status. */}
                {statusLabel !== undefined && (
                  <span className={styles.statusLabel}>{statusLabel}</span>
                )}
                {item.description !== undefined && (
                  <span className={styles.description}>{item.description}</span>
                )}
              </span>
            </>
          );
          return (
            <li
              key={String(item.id)}
              className={styles.step}
              data-state={state}
              data-status={item.status}
              aria-current={state === "current" ? "step" : undefined}
            >
              {isPressable ? (
                <button
                  type="button"
                  className={`${styles.stepContent} ${styles.stepButton}`}
                  onClick={() => goTo(item.id)}
                >
                  {content}
                </button>
              ) : (
                <span className={styles.stepContent}>{content}</span>
              )}
            </li>
          );
        })}
      </ol>
      {activeItem.children != null && (
        <div
          className={styles.panel}
          role="group"
          aria-labelledby={`${titleIdPrefix}-title-${activeIndex}`}
        >
          {activeItem.children}
        </div>
      )}
    </div>
  );
}
