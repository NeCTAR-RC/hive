// The request bodies the mocked session-wide endpoints accept.
import { z } from "zod";

export const switchProjectBody = z.object({ project_id: z.string().min(1) });
