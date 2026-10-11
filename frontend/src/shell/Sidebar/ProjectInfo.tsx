import { useQuery } from "@tanstack/react-query";
import { InfoButton, Tooltip, TooltipTrigger } from "@ardc-ui/react";
import { QuotaMeter } from "../../components/QuotaMeter/QuotaMeter";
import { Skeleton } from "../../components/Skeleton/Skeleton";
import type { Me } from "../../lib/api/types";
import { formatSu } from "../../lib/format";
import { allocationQuery } from "../../lib/queries";
import styles from "./ProjectInfo.module.scss";

const TRIAL_HELP =
  "https://support.ehelp.edu.au/support/solutions/articles/6000171494-project-allocation-expiry-and-renewal#pt";
const ALLOCATION_HELP =
  "https://support.ehelp.edu.au/support/solutions/articles/6000171494-project-allocation-expiry-and-renewal";

/** Horizon's sidebar "project info" box: bundle and SU used of budget. */
export function ProjectInfo({ me }: { me: Me }) {
  const { data, isPending, isError } = useQuery({
    ...allocationQuery(me.project.id),
    enabled: !me.project.is_trial,
  });

  if (me.project.is_trial) {
    return (
      <div className={styles.box}>
        <p className={styles.small}>
          <a href={TRIAL_HELP}>Learn more about project trials</a>
        </p>
      </div>
    );
  }

  const budget = data?.su_budget ?? null;
  const used = data?.su_used ?? null;
  const budgetText = budget === null ? "Unlimited" : formatSu(budget);

  return (
    <div className={styles.box}>
      <p className={styles.small}>
        <a href={ALLOCATION_HELP}>Learn more about allocations</a>
      </p>
      <h2 className={styles.heading}>
        Resource bundle
        <TooltipTrigger>
          <InfoButton aria-label="About the resource bundle" />
          <Tooltip>
            The current resource bundle for the project allocation.
          </Tooltip>
        </TooltipTrigger>
      </h2>
      {isPending ? (
        <Skeleton width="60%" />
      ) : (
        <p className={styles.value}>
          {isError
            ? "Unavailable"
            : (data?.allocation?.bundle ??
              (data?.allocation ? "Custom" : "N/A"))}
        </p>
      )}
      <h2 className={styles.heading}>
        Project usage
        <TooltipTrigger>
          <InfoButton aria-label="About project usage" />
          <Tooltip>
            Service Units (SU) used by the project to date, out of the SU budget
            for the allocation period.
          </Tooltip>
        </TooltipTrigger>
      </h2>
      {isPending ? (
        <Skeleton width="80%" />
      ) : isError || data?.partial ? (
        <p className={styles.value}>Allocation details unavailable</p>
      ) : (
        <QuotaMeter
          label="SU used"
          value={used ?? 0}
          max={budget}
          valueText={`${formatSu(used ?? 0)} / ${budgetText} SU`}
        />
      )}
      <p className={styles.small}>
        <a href="/usage/allocation">Usage summary</a>
        {" | "}
        <a href="/compute/overview">Limit summary</a>
      </p>
    </div>
  );
}
