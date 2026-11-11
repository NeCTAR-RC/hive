/**
 * Orchestration (Heat): stacks, templates and resource types.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type Stack = Schemas["Stack"];
export type StackOutput = Schemas["StackOutput"];
export type StackDetail = Schemas["StackDetail"];
export type StackResource = Schemas["StackResource"];
export type StackEvent = Schemas["StackEvent"];
export type StackTemplate = Schemas["StackTemplate"];

/**
 * A template parameter. `type` is Heat's parameter type: string, number,
 * comma_delimited_list, json or boolean, kept open for types a newer Heat
 * adds.
 */
export type ParameterSpec = Schemas["ParameterSpec"];

export type TemplateValidation = Schemas["TemplateValidation"];
export type TemplateSource = Schemas["TemplateSource"];

/** The create body (the backend's `StackCreate`). */
export type StackCreateRequest = Schemas["StackCreate"];

/** The update body (the backend's `StackUpdate`). */
export type StackUpdateRequest = Schemas["StackUpdate"];

/** The body of `POST /api/orchestration/stacks/{id}/actions`. */
export type StackActionRequest = Schemas["StackAction"];
export type StackActionAccepted = Schemas["StackActionAccepted"];

/** The reply to a stack create or update, which Heat carries out later. */
export type StackAccepted = Schemas["StackAccepted"];

export type ResourceTypeSummary = Schemas["ResourceTypeSummary"];
export type ResourceTypeDetail = Schemas["ResourceTypeDetail"];
export type TemplateVersion = Schemas["TemplateVersion"];
export type TemplateFunction = Schemas["TemplateFunction"];
export type TemplateFunctionList = Schemas["TemplateFunctionList"];
