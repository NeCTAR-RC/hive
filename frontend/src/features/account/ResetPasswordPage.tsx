// Reset Password: one button that sets a fresh API password and shows it
// once (nectar_dashboard/reset_password).
import { useState } from "react";
import { Alert, Button } from "@ardc-ui/react";
import { CodeBlock } from "../../components/CodeBlock/CodeBlock";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { Panel } from "../../components/Panel/Panel";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { useResetPassword } from "./api";
import styles from "./ResetPasswordPage.module.scss";
import { loadingProps } from "../../components/buttonState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";

export function ResetPasswordPage() {
  const reset = useResetPassword();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <PageHeader title="Reset Password" crumbs={[{ label: "Account" }]} />
      <div className={styles.stack}>
        <Panel title="Password credentials">
          <p>
            To access the Nectar Cloud using the OpenStack API you need a
            password. Generating one here forgets{" "}
            <strong>any existing password</strong>. Use it with the username and
            files on the API Access page.
          </p>
          {reset.isError && (
            <ErrorState
              error={reset.error}
              title="Could not reset the password"
            />
          )}
          {reset.data ? (
            <div className={styles.result}>
              <Alert tone="success" role="status">
                Your password has been reset. Copy it now: it is not shown
                again.
              </Alert>
              <KeyValueList
                items={[
                  {
                    label: "Username",
                    value: <code>{reset.data.username}</code>,
                  },
                  {
                    label: "New password",
                    value: (
                      <CodeBlock
                        text={reset.data.password}
                        label="New password"
                      />
                    ),
                  },
                ]}
              />
            </div>
          ) : null}
          <div className={styles.actions}>
            <Button
              isPending={reset.isPending}
              {...loadingProps(reset.isPending, "Resetting...")}
              onPress={() => setConfirming(true)}
            >
              Reset password
            </Button>
          </div>
        </Panel>
      </div>
      <ConfirmDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title="Reset your API password?"
        confirmLabel="Reset password"
        tone="danger"
        onConfirm={() => {
          setConfirming(false);
          reset.mutate();
        }}
      >
        <p>
          Any existing password stops working straight away, including in
          scripts and tools that use it. Application credentials are not
          affected.
        </p>
      </ConfirmDialog>
    </>
  );
}
