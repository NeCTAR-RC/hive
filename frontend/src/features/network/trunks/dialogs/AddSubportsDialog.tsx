// Add subports to an existing trunk.
import { useQuery } from "@tanstack/react-query";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Trunk } from "../../../../lib/api/types/network";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { trunkOptionsQuery, useAddSubports } from "../../api";
import { subportsBody } from "./request";
import { addSubportsSchema } from "./schema";
import { SubportRows } from "./SubportRows";

/** The add subports dialog: the subport rows, starting with one empty row. */
export function AddSubportsDialog({
  trunk,
  onClose,
}: {
  trunk: Trunk;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const options = useQuery(trunkOptionsQuery(projectId));
  const { dialog } = useMutationForm({
    schema: addSubportsSchema,
    defaultValues: {
      sub_ports: [
        { port_id: "", segmentation_type: "vlan", segmentation_id: null },
      ],
    },
    mutation: useAddSubports(),
    toVariables: (values) => ({
      trunkId: trunk.id,
      subports: subportsBody(values.sub_ports),
    }),
    successMessage: (_trunk, values) =>
      `Added ${values.sub_ports.length} subport${values.sub_ports.length === 1 ? "" : "s"} to ${trunk.name || trunk.id}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      error={dialog.error ?? options.error}
      title={`Add subports to ${trunk.name || trunk.id}`}
      submitLabel="Add subports"
      size="lg"
    >
      <SubportRows
        candidates={options.data?.subports ?? []}
        isLoading={options.isPending}
      />
    </FormDialog>
  );
}
