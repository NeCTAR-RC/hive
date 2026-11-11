import { Copy, CopyCheck } from "@ardc-ui/react";
import { Button } from "react-aria-components";
import styles from "./CopyIconButton.module.scss";
import { useCopy } from "./useCopy";

/**
 * The "Cite this resource" block's copy control: a bare 24px copy glyph
 * that turns to its copied form for two seconds after a copy. Its name
 * stays `label` throughout; a polite live region beside it announces
 * "Copied to clipboard". The library draws this control only inside its
 * citation block, so Hive draws it to the same tokens.
 */
export function CopyIconButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const { copied, copy } = useCopy(text);
  const Glyph = copied ? CopyCheck : Copy;

  return (
    <>
      <Button
        aria-label={label}
        className={styles.copy}
        isDisabled={text === ""}
        onPress={() => void copy()}
        data-copied={copied || undefined}
      >
        <Glyph aria-hidden="true" className={styles.icon} />
      </Button>
      <span role="status" className="visually-hidden">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
