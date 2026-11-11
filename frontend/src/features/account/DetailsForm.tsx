// The contact details form on My Details.
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ardc-ui/react";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { Form } from "../../components/Form/Form";
import { fieldsFor } from "../../components/Form/fields";
import { Panel } from "../../components/Panel/Panel";
import { loadingProps } from "../../components/buttonState";
import type { Profile } from "../../lib/api/types/account";
import { notify } from "../../lib/notify";
import { useUpdateProfile } from "./api";
import {
  detailsRequest,
  detailsSchema,
  detailsValues,
  type DetailsValues,
} from "./details";
import styles from "./MyDetailsPage.module.scss";

/**
 * The three fields the user may edit in manuka: affiliation, phone and
 * mobile number, saved in place with a toast.
 */
export function DetailsForm({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const { SelectInput, TextInput } = fieldsFor<DetailsValues>();
  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    values: detailsValues(profile),
  });
  const submit = (values: DetailsValues) => {
    update.mutate(detailsRequest(values), {
      onSuccess: () => notify.success("Your details have been updated."),
    });
  };
  const options = profile.affiliations.map((a) => ({
    id: a.id,
    label: a.label,
  }));
  return (
    <Panel title="Contact details">
      <Form form={form} onValid={submit} className={styles.form}>
        <div className={styles.fields}>
          {update.isError && (
            <ErrorState error={update.error} title="Could not save" />
          )}
          <SelectInput
            name="affiliation"
            label="Affiliation"
            description="Your affiliation to your organisation."
            options={options}
            isRequired
          />
          <TextInput
            name="phone_number"
            label="Phone number"
            autoComplete="tel"
            maxLength={64}
          />
          <TextInput
            name="mobile_number"
            label="Mobile number"
            autoComplete="tel"
            maxLength={64}
          />
        </div>
        <div>
          <Button
            type="submit"
            {...loadingProps(update.isPending, "Saving...")}
          >
            Save
          </Button>
        </div>
      </Form>
    </Panel>
  );
}
