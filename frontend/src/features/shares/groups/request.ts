// Pure rules of the share group dialogs: the create share group request.

/** The create share group form's values, as its schema parses them. */
export interface CreateShareGroupValues {
  name: string;
  description: string;
  snapshot_id: string;
  share_group_type_id: string;
  share_types: string[];
  availability_zone: string;
}

/**
 * The create share group request. A group made from a snapshot sends the
 * snapshot and no type (the form hides the type fields then); an empty
 * group sends its group type and the share types ticked, if any. The
 * description and zone go only when filled in.
 */
export function createShareGroupBody(values: CreateShareGroupValues) {
  return {
    name: values.name,
    ...(values.description ? { description: values.description } : {}),
    ...(values.snapshot_id
      ? { snapshot_id: values.snapshot_id }
      : {
          share_group_type_id: values.share_group_type_id,
          ...(values.share_types.length
            ? { share_types: values.share_types }
            : {}),
        }),
    ...(values.availability_zone
      ? { availability_zone: values.availability_zone }
      : {}),
  };
}
