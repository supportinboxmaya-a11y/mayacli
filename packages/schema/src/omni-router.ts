export * as OmniRouter from "./omni-router"

import { define, inventory } from "./event"
import { Schema } from "effect"
import { optional } from "./schema"
import { Credential } from "./credential"
import { NonNegativeInt } from "./schema"

// OmniRouter keys are stored as credentials, so a key's identity is the
// credential row id. Alias `Credential.ID` rather than defining a separate
// brand so key ids and credential ids stay interchangeable.
export const ID = Credential.ID
export type ID = Credential.ID

export interface Usage extends Schema.Schema.Type<typeof Usage> {}
export const Usage = Schema.Struct({
  requests: NonNegativeInt,
  inputTokens: NonNegativeInt,
  outputTokens: NonNegativeInt,
}).annotate({ identifier: "OmniRouter.Usage" })

export interface Limit extends Schema.Schema.Type<typeof Limit> {}
export const Limit = Schema.Struct({
  /** Maximum number of requests allowed per window. `null` = unlimited. */
  requests: optional(Schema.NullOr(Schema.Number)),
  /** Maximum number of tokens (input + output) allowed per window. `null` = unlimited. */
  tokens: optional(Schema.NullOr(Schema.Number)),
}).annotate({ identifier: "OmniRouter.Limit" })

export interface Status extends Schema.Schema.Type<typeof Status> {}
export const Status = Schema.Struct({
  phase: Schema.Literals(["active", "exhausted", "disabled", "error"]),
  message: optional(Schema.String),
}).annotate({ identifier: "OmniRouter.Status" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  /** User-facing label, e.g. "team-prod" or "sk-…1234". */
  label: Schema.String,
  /** Created-at timestamp (ms). */
  created: Schema.Number,
  /** Last time the key was used (ms), if any. */
  lastUsed: Schema.Number.pipe(optional),
  enabled: Schema.Boolean,
  /** Live usage counters for the current window. */
  usage: Usage,
  /** Per-key limit for the current window, if configured. */
  limit: optional(Limit),
  status: Status,
}).annotate({ identifier: "OmniRouter.Key.Info" })
export interface Key extends Schema.Schema.Type<typeof Info> {}
export const Key = Info

export const RotationStrategy = Schema.Literals(["round-robin", "lowest-usage"]).annotate({
  identifier: "OmniRouter.RotationStrategy",
})
export type RotationStrategy = typeof RotationStrategy.Type

export interface Config extends Schema.Schema.Type<typeof Config> {}
export const Config = Schema.Struct({
  enabled: Schema.Boolean,
  /** Base URL of the OmniRouter gateway. */
  baseURL: Schema.String,
  strategy: RotationStrategy,
}).annotate({ identifier: "OmniRouter.Config" })

export interface Stats extends Schema.Schema.Type<typeof Stats> {}
export const Stats = Schema.Struct({
  keys: Schema.Array(Info),
  total: Usage,
  activeKeys: Schema.Number,
  exhaustedKeys: Schema.Number,
  totalLimit: optional(Limit),
  currentKeyID: ID.pipe(optional),
  strategy: RotationStrategy,
  updated: Schema.Number,
}).annotate({ identifier: "OmniRouter.Stats" })

export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}
export const CreateInput = Schema.Struct({
  /** The actual API key. Stored in the credential value, never returned. */
  key: Schema.String,
  label: Schema.optional(Schema.String),
  /** Optional per-key windowed limit. */
  limit: optional(Limit),
}).annotate({ identifier: "OmniRouter.CreateInput" })

export interface UpdateInput extends Schema.Schema.Type<typeof UpdateInput> {}
export const UpdateInput = Schema.Struct({
  label: Schema.optional(Schema.String),
  enabled: Schema.optional(Schema.Boolean),
  limit: optional(Limit),
}).annotate({ identifier: "OmniRouter.UpdateInput" })

export interface RotateInput extends Schema.Schema.Type<typeof RotateInput> {}
export const RotateInput = Schema.Struct({
  /** Reset the key's usage counters immediately (e.g. after a quota reset). */
  resetUsage: Schema.Boolean.pipe(Schema.optional),
  /** Mark the key as primary for the next rotation pass. */
  prioritize: Schema.Boolean.pipe(Schema.optional),
}).annotate({ identifier: "OmniRouter.RotateInput" })

export const EventUpdated = define({
  type: "omni-router.updated",
  schema: {
    keyID: ID.pipe(optional),
  },
})

export type EventUpdated = typeof EventUpdated.Type

export const Event = {
  Updated: EventUpdated,
} as const

export const EventDefinitions = inventory(EventUpdated)
