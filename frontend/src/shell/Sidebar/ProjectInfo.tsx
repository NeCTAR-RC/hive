import { useQuery } from "@tanstack/react-query";
import {
  InfoButton,
  Label,
  Meter,
  Text,
  Tooltip,
  TooltipTrigger,
} from "@ardc-ui/react";
import { Skeleton } from "../../components/Skeleton/Skeleton";
import type { Me } from "../../lib/api/types/session";
import type { AllocationSummary } from "../../lib/api/types/usage";
import { formatSu } from "../../lib/format";
import { allocationQuery } from "../../lib/queries";
import { LinkRow, LinkRowList } from "../LinkRows/LinkRows";
import styles from "./ProjectInfo.module.scss";

const TRIAL_HELP =
  "https://support.ehelp.edu.au/support/solutions/articles/6000171494-project-allocation-expiry-and-renewal#pt";
const ALLOCATION_HELP =
  "https://support.ehelp.edu.au/support/solutions/articles/6000171494-project-allocation-expiry-and-renewal";

const percent = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });

/**
 * The project's allocation at a glance, under the sidebar's project
 * switcher, in the order of Darcelle's 15 Oct 2026 mockup: the link to learn
 * about allocations, the resource bundle and the service units used of the
 * budget as labelled pairs, then the usage and limit summaries. Function
 * mirrored from Horizon's sidebar project info. A trial project has no
 * allocation, so it only links to the trial explanation. Renders the
 * block's children directly, so they take the block's own gap.
 */
export function ProjectInfo({ me }: { me: Me }) {
  const { data, isPending, isError } = useQuery({
    ...allocationQuery(me.project.id),
    enabled: !me.project.is_trial,
  });

  if (me.project.is_trial) {
    return (
      <LinkRowList>
        <LinkRow href={TRIAL_HELP}>Learn more about project trials</LinkRow>
      </LinkRowList>
    );
  }

  return (
    <>
      <LinkRowList>
        <LinkRow href={ALLOCATION_HELP}>Learn more about allocations</LinkRow>
      </LinkRowList>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.term}>
            Resource bundle
            <TooltipTrigger>
              <InfoButton aria-label="About the resource bundle" />
              <Tooltip>
                The current resource bundle for the project allocation.
              </Tooltip>
            </TooltipTrigger>
          </dt>
          <dd className={styles.value}>
            {isPending ? (
              <Skeleton width="60%" />
            ) : isError ? (
              "Unavailable"
            ) : (
              (data?.allocation?.bundle ??
              (data?.allocation ? "Custom" : "N/A"))
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.term}>
            Project usage
            <TooltipTrigger>
              <InfoButton aria-label="About project usage" />
              <Tooltip>
                Service Units (SU) used by the project to date, out of the SU
                budget for the allocation period.
              </Tooltip>
            </TooltipTrigger>
          </dt>
          <dd className={styles.value}>
            {isPending ? (
              <Skeleton width="80%" />
            ) : isError || !data || data.partial ? (
              "Allocation details unavailable"
            ) : (
              <Usage summary={data} />
            )}
          </dd>
        </div>
      </dl>
      <LinkRowList>
        <LinkRow href="/usage/allocation">Usage summary</LinkRow>
        <LinkRow href="/compute/overview">Limit summary</LinkRow>
      </LinkRowList>
    </>
  );
}

/**
 * Service units used against the budget. The library Meter draws one colour
 * at every level, so how close the project is to its budget is said in the
 * description ("82% used"). An unlimited budget has no bar to draw.
 */
function Usage({ summary }: { summary: AllocationSummary }) {
  const used = summary.su_used ?? 0;
  const budget = summary.su_budget;
  if (budget === null || budget < 0) {
    return <>{`${formatSu(used)} SU used of an unlimited budget`}</>;
  }
  const ratio = budget === 0 ? 1 : used / budget;
  return (
    <Meter
      value={Math.min(used, budget)}
      minValue={0}
      maxValue={budget}
      valueLabel={`${formatSu(used)} / ${formatSu(budget)}`}
    >
      <Label>SU used</Label>
      <Text slot="description">{`${percent.format(ratio * 100)}% used`}</Text>
    </Meter>
  );
}
