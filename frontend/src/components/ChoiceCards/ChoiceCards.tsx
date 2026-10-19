// A single choice shown as a grid of cards, every option visible at once,
// for choices whose options each need a line or two of explanation. The
// cards are React Aria radios composed directly (the design system's own
// RadioGroupItem is a list row and cannot be drawn as a card under its
// no-override policy), so the group keeps radio semantics and arrow-key
// movement while looking like a set of tiles.
import { Radio, RadioGroup } from "react-aria-components";
import styles from "./ChoiceCards.module.scss";

export interface ChoiceCard {
  id: string;
  title: string;
  /** A short line under the title, such as a count or a price. */
  meta?: string;
  description?: string | null;
  isDisabled?: boolean;
}

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
        <Radio
          key={option.id}
          value={option.id}
          isDisabled={option.isDisabled ?? false}
          className={styles.card}
        >
          <span className={styles.title}>{option.title}</span>
          {option.meta && <span className={styles.meta}>{option.meta}</span>}
          {option.description && (
            <span className={styles.description}>{option.description}</span>
          )}
        </Radio>
      ))}
    </RadioGroup>
  );
}
