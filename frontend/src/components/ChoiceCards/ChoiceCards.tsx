import { Radio, RadioGroup } from "react-aria-components";
import styles from "./ChoiceCards.module.scss";

/**
 * The library radio's glyph, drawn to its geometry (a 16px ring, or a disc
 * with a white centre half its size when chosen): the library draws it
 * inside `RadioGroupItem` and does not export it.
 */
function RadioGlyph({ isSelected }: { isSelected: boolean }) {
  return (
    <svg
      className={styles.indicator}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      {isSelected ? (
        <>
          <circle cx="8" cy="8" r="8" fill="currentColor" />
          <circle cx="8" cy="8" r="4" className={styles.indicatorDot} />
        </>
      ) : (
        <circle
          cx="8"
          cy="8"
          r="7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      )}
    </svg>
  );
}

/** One card of a `ChoiceCards` group. */
export interface ChoiceCard {
  id: string;
  title: string;
  /** A short line under the title, such as a count or a price. */
  meta?: string;
  /** A sentence or two about the option. */
  description?: string | null;
}

/**
 * One choice from a few options that each need a line or two of
 * explanation, shown as a grid of cards so every option is on screen at
 * once. Each card is a React Aria `Radio` in a `RadioGroup`, so the group
 * keeps radio semantics and arrow-key movement; the card carries the
 * library's radio glyph, so the choice does not rest on colour alone. The
 * library `RadioGroupItem` is a list row and has no card form (gap "Card
 * radios").
 */
export function ChoiceCards({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  options: ChoiceCard[];
  /** The chosen option's id; "" or null for none. */
  value: string | null;
  onChange: (id: string) => void;
  "aria-label": string;
}) {
  return (
    <RadioGroup
      aria-label={ariaLabel}
      value={value || null}
      onChange={onChange}
      className={styles.grid}
    >
      {options.map((option) => (
        <Radio key={option.id} value={option.id} className={styles.card}>
          {({ isSelected }) => (
            <>
              <span className={styles.head}>
                <RadioGlyph isSelected={isSelected} />
                <span className={styles.title}>{option.title}</span>
              </span>
              {option.meta && (
                <span className={styles.meta}>{option.meta}</span>
              )}
              {option.description && (
                <span className={styles.description}>{option.description}</span>
              )}
            </>
          )}
        </Radio>
      ))}
    </RadioGroup>
  );
}
