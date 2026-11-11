/**
 * Compute (Nova and Glance): instances, flavors, images, key pairs,
 * server groups and the launch flow.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components, paths } from "../generated/openapi";

type Schemas = components["schemas"];

/** A flavor from the catalogue. */
export type Flavor = Schemas["Flavor"];

/** A flavor class the launch wizard groups flavors by, with its count. */
export type FlavorClass = Schemas["FlavorClass"];

/**
 * The flavor embedded in an instance. Nova 2.47+ embeds the flavor's
 * values, not its id, so `id` is null unless the backend could match it.
 */
export type ServerFlavor = Schemas["ServerFlavor"];

export type Address = Schemas["Address"];
export type InstanceFault = Schemas["InstanceFault"];
export type Instance = Schemas["Instance"];
export type InstanceDetail = Schemas["InstanceDetail"];
export type InstanceVolume = Schemas["InstanceVolume"];
export type InstancePort = Schemas["InstancePort"];
export type InstanceAction = Schemas["InstanceAction"];
export type ConsoleOutput = Schemas["ConsoleOutput"];
export type RemoteConsole = Schemas["RemoteConsole"];
export type AvailabilityZone = Schemas["AvailabilityZone"];
export type Image = Schemas["Image"];

/**
 * The image create body (the backend's `ImageCreate`); `source_url` has
 * the image service import the image, left out when a file is uploaded.
 */
export type ImageCreateRequest = Schemas["ImageCreate"];

/** The image edit body (the backend's `ImageUpdate`); null clears a property. */
export type ImageUpdateRequest = Schemas["ImageUpdate"];

/** A launch option image: other projects' community images start hidden. */
export type LaunchImage = Schemas["LaunchImage"];

/** A key pair as the list and the launch options show it. */
export type KeyPair = Schemas["KeyPair"];

/** One key pair with its creation time. */
export type KeyPairDetail = Schemas["KeyPairDetail"];

/** The create reply; a generated key's private half is sent this once only. */
export type KeyPairCreated = Schemas["KeyPairCreated"];

export type ServerGroup = Schemas["ServerGroup"];
export type ServerGroupPolicy = ServerGroup["policy"];

/** Nova absolute limits (`maxTotalInstances`, `totalCoresUsed`, ...). */
export type ComputeLimits = Schemas["ComputeLimits"];

export type LaunchVolume = Schemas["LaunchVolume"];
export type LaunchVolumeSnapshot = Schemas["LaunchVolumeSnapshot"];
export type LaunchOptions = Schemas["LaunchOptions"];
export type LaunchSourceType = Schemas["LaunchSource"]["type"];
export type LaunchRequest = Schemas["LaunchRequest"];
export type LaunchResult = Schemas["LaunchResult"];
export type ActionResult = Schemas["ActionResult"];

/**
 * The body of `POST /api/compute/instances/{id}/actions`: one object per
 * action, told apart by `action`. The backend declares the union inline on
 * the route, so it has no schema name of its own.
 */
export type InstanceActionRequest =
  paths["/api/compute/instances/{server_id}/actions"]["post"]["requestBody"]["content"]["application/json"];

/** The action names the instance actions route accepts. */
export type InstanceActionName = InstanceActionRequest["action"];

/** The body of one instance action, such as `InstanceActionBody<"resize">`. */
export type InstanceActionBody<Action extends InstanceActionName> = Extract<
  InstanceActionRequest,
  { action: Action }
>;
