/**
 * Kubernetes (Magnum): clusters, templates and node groups.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type ClusterTemplate = Schemas["ClusterTemplate"];
export type ClusterAction = Schemas["ClusterAction"];
export type Cluster = Schemas["Cluster"];
export type ClusterQuota = Schemas["ClusterQuota"];
export type ClustersResponse = Schemas["ClustersResponse"];
export type TemplateCombination = Schemas["TemplateCombination"];
export type ClusterFlavor = Schemas["ClusterFlavor"];
export type ClusterOptions = Schemas["ClusterOptions"];

/** The create body (the backend's `ClusterCreate`). */
export type ClusterCreateRequest = Schemas["ClusterCreate"];

export type UpgradeTarget = Schemas["UpgradeTarget"];
export type UpgradeOptions = Schemas["UpgradeOptions"];
export type NodeTaint = Schemas["NodeTaint"];
export type NodeGroup = Schemas["NodeGroup"];
export type NodeGroupsResponse = Schemas["NodeGroupsResponse"];

/** The node group create body (the backend's `NodeGroupCreate`). */
export type NodeGroupCreateRequest = Schemas["NodeGroupCreate"];

export type ClusterConfig = Schemas["ClusterConfig"];
export type ClusterCreated = Schemas["ClusterCreated"];
export type ClusterUpgrading = Schemas["ClusterUpgrading"];

/** A signed client certificate, as PEM. */
export type ClusterCertificate = Schemas["ClusterCertificate"];

export type NodeGroupResized = Schemas["NodeGroupResized"];
