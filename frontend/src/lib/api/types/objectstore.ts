/**
 * Object store (Swift): containers, objects and upload plans.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type StorePolicy = Schemas["StorePolicy"];
export type StoreInfo = Schemas["StoreInfo"];
export type Container = Schemas["Container"];
export type ContainerList = Schemas["ContainerList"];
export type ContainerDetail = Schemas["ContainerDetail"];
export type StoreObject = Schemas["StoreObject"];
export type ObjectListing = Schemas["ObjectListing"];
export type ObjectDetail = Schemas["ObjectDetail"];
export type UploadSegment = Schemas["UploadSegment"];
export type UploadPlanObject = Schemas["UploadPlanObject"];

/**
 * How to upload: straight to Swift through temporary URLs, or through the
 * backend's proxy. The backend's `TempUrlUploadPlan | ProxyUploadPlan`,
 * told apart by `mode`.
 */
export type UploadPlan =
  Schemas["TempUrlUploadPlan"] | Schemas["ProxyUploadPlan"];

/** The create body (the backend's `ContainerCreate`). */
export type ContainerCreateRequest = Schemas["ContainerCreate"];

/** The copy body (the backend's `CopyRequest`). */
export type CopyObjectRequest = Schemas["CopyRequest"];

export type DeleteObjectsResult = Schemas["DeleteObjectsResult"];
export type FolderCreated = Schemas["FolderCreated"];
export type ObjectCopied = Schemas["ObjectCopied"];

/** A segmented upload joined into one object (a static large object). */
export type UploadCompleted = Schemas["UploadCompleted"];
