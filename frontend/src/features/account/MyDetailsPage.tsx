// My Details: the manuka account record, the three fields the user may
// edit, and the ORCID link and unlink round trips through manuka
// (nectar_dashboard/user_info/update).
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button, Link } from "@ardc-ui/react";
import { loadingProps } from "../../components/buttonState";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { ExternalLink } from "../../components/ExternalLink/ExternalLink";
import { SelectInput, TextInput } from "../../components/Form/fields";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { AFFILIATION_IDS, type Profile } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { meQuery, profileQuery } from "../../lib/queries";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { useUpdateProfile } from "./api";
import styles from "./MyDetailsPage.module.scss";

const schema = z.object({
  // Any string in (the stored value may be blank), one of manuka's
  // affiliations out, so the request carries an AffiliationId.
  affiliation: z
    .string()
    .min(1, "Choose your affiliation")
    .pipe(z.enum(AFFILIATION_IDS, { message: "Choose a listed affiliation" })),
  phone_number: z.string().trim().max(64, "At most 64 characters"),
  mobile_number: z.string().trim().max(64, "At most 64 characters"),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

function dash(value: string | null | undefined) {
  return value ? value : "-";
}

export function MyDetailsPage() {
  const { data: me } = useQuery(meQuery);
  const profile = useQuery(profileQuery);

  return (
    <>
      <PageHeader title="My Details" crumbs={[{ label: "Account" }]} />
      <div className={styles.grid}>
        <div className={styles.stack}>
          <Panel title="Account">
            {profile.isPending ? (
              <SkeletonLines lines={5} />
            ) : profile.isError ? (
              <ErrorState
                error={profile.error}
                onRetry={() => profile.refetch()}
              />
            ) : profile.data.partial ? (
              <Alert tone="warning" role="status">
                Your account details are unavailable at the moment
                {profile.data.message ? `: ${profile.data.message}` : "."}
              </Alert>
            ) : (
              <>
                <p className={styles.note}>
                  Your name and email come from your institution&apos;s identity
                  provider. To correct them, contact your institution&apos;s IT
                  support and log in again.
                </p>
                <KeyValueList
                  items={[
                    {
                      label: "Full name",
                      value: dash(profile.data.displayname),
                    },
                    {
                      label: "First name",
                      value: dash(profile.data.first_name),
                    },
                    { label: "Family name", value: dash(profile.data.surname) },
                    { label: "Email", value: dash(profile.data.email) },
                    { label: "Username", value: dash(me?.user.name) },
                    {
                      label: "Organisation",
                      value: dash(profile.data.organisation),
                    },
                  ]}
                />
              </>
            )}
          </Panel>
          {profile.data && !profile.data.partial && (
            <DetailsForm profile={profile.data} />
          )}
        </div>
        <OrcidPanel profile={profile.data} isPending={profile.isPending} />
      </div>
    </>
  );
}

function DetailsForm({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    values: {
      affiliation: profile.affiliation ?? "",
      phone_number: profile.phone_number ?? "",
      mobile_number: profile.mobile_number ?? "",
    },
  });
  const submit = form.handleSubmit((values) => {
    update.mutate(
      {
        affiliation: values.affiliation,
        phone_number: values.phone_number || null,
        mobile_number: values.mobile_number || null,
      },
      {
        onSuccess: () => notify.success("Your details have been updated."),
      },
    );
  });
  const options = (profile.affiliations ?? []).map((a) => ({
    id: a.id,
    label: a.label,
  }));
  return (
    <Panel title="Contact details">
      <form onSubmit={submit} noValidate className={styles.form}>
        {update.isError && (
          <ErrorState error={update.error} title="Could not save" />
        )}
        <SelectInput
          control={form.control}
          name="affiliation"
          label="Affiliation"
          description="Your affiliation to your organisation."
          options={options}
          isRequired
        />
        <TextInput
          control={form.control}
          name="phone_number"
          label="Phone number"
          autoComplete="tel"
          maxLength={64}
        />
        <TextInput
          control={form.control}
          name="mobile_number"
          label="Mobile number"
          autoComplete="tel"
          maxLength={64}
        />
        <div>
          <Button
            type="submit"
            isPending={update.isPending}
            {...loadingProps(update.isPending, "Saving...")}
          >
            Save
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function OrcidPanel({
  profile,
  isPending,
}: {
  profile: Profile | undefined;
  isPending: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const orcidUrl = profile?.orcid_url ?? "https://orcid.org";
  return (
    <Panel title="ORCID">
      <p className={styles.note}>
        Linking your ORCID iD lets Nectar attribute cloud usage to your research
        outputs.
      </p>
      {isPending || !profile ? (
        <SkeletonLines lines={2} />
      ) : profile.orcid ? (
        <>
          <p>
            <strong>Connected</strong> to{" "}
            <ExternalLink href={`${orcidUrl}/${profile.orcid}`} wrap>
              {orcidUrl}/{profile.orcid}
            </ExternalLink>
            .
          </p>
          {profile.orcid_unlink_url ? (
            <>
              <form
                ref={formRef}
                method="post"
                action={profile.orcid_unlink_url}
                className={styles.hiddenForm}
              >
                <input
                  type="hidden"
                  name="next"
                  value={profile.orcid_return_url ?? ""}
                />
              </form>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() => setConfirming(true)}
              >
                Disconnect ORCID
              </Button>
              <ConfirmDialog
                isOpen={confirming}
                onOpenChange={setConfirming}
                title="Disconnect this ORCID iD?"
                confirmLabel="Disconnect"
                tone="danger"
                onConfirm={() => formRef.current?.submit()}
              >
                <p>
                  You will be taken to the Nectar accounts service to
                  disconnect, then returned here.
                </p>
              </ConfirmDialog>
            </>
          ) : null}
        </>
      ) : (
        <>
          <p>No ORCID iD is connected to this account.</p>
          {profile.orcid_link_url ? (
            <Link variant="primary" size="sm" href={profile.orcid_link_url}>
              Connect to ORCID
            </Link>
          ) : (
            <p className={styles.note}>
              ORCID linking is not configured on this dashboard.
            </p>
          )}
          <p className={styles.note}>
            Don&apos;t have an ORCID iD?{" "}
            <ExternalLink href={`${orcidUrl}/signin`}>
              Register or sign in at ORCID
            </ExternalLink>
            .
          </p>
        </>
      )}
    </Panel>
  );
}
