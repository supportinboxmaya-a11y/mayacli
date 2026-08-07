export * as OmniRouter from "./omni-router"

import { Context, Effect, Layer, Schema, SynchronizedRef } from "effect"
import { OmniRouter } from "@opencode-ai/schema/omni-router"
import { Integration } from "@opencode-ai/schema/integration"
import { User } from "@opencode-ai/schema/user"
import { Credential } from "./credential"
import { EventV2 } from "./event"
import { makeGlobalNode } from "./effect/app-node"

const DEFAULT_BASE_URL = "https://api.omnirouter.ai/v1"

/**
 * OmniRouter gateway service.
 *
 * Manages a pool of OmniRouter API keys with:
 *  - persistence through the shared Credential table (key-type values,
 *    metadata carries usage/limit bookkeeping)
 *  - automatic rotation (round-robin or lowest-usage)
 *  - per-key windowed usage tracking (requests + tokens) and limit
 *    enforcement
 *  - live `omni-router.updated` events so connected UIs stay in sync
 *
 * The service is process-global: the key pool is shared across locations,
 * matching how gateway credentials are naturally scoped.
 */
export interface Interface {
  /** Returns the runtime configuration (enabled, base URL, rotation strategy). */
  readonly config: () => Effect.Effect<OmniRouter.Config, never, User.CurrentUser>
  /** Updates the runtime configuration. */
  readonly setConfig: (
    input: Partial<Pick<OmniRouter.Config, "enabled" | "baseURL" | "strategy">>,
  ) => Effect.Effect<void, never, User.CurrentUser>
  /** Lists every stored key with live usage and status. */
  readonly list: () => Effect.Effect<OmniRouter.Info[], never, User.CurrentUser>
  /** Returns one key by id. */
  readonly get: (id: OmniRouter.ID) => Effect.Effect<OmniRouter.Info | undefined, never, User.CurrentUser>
  /** Adds a new key to the pool. */
  readonly add: (input: OmniRouter.CreateInput) => Effect.Effect<OmniRouter.Info, never, User.CurrentUser>
  /** Updates a key (label, enabled, limit). */
  readonly update: (
    id: OmniRouter.ID,
    input: OmniRouter.UpdateInput,
  ) => Effect.Effect<OmniRouter.Info | undefined, never, User.CurrentUser>
  /** Removes a key from the pool. */
  readonly remove: (id: OmniRouter.ID) => Effect.Effect<void, never, User.CurrentUser>
  /** Rotates to the next key and returns the one to use. */
  readonly rotate: (input?: OmniRouter.RotateInput) => Effect.Effect<OmniRouter.Info | undefined, never, User.CurrentUser>
  /** Resolves the next usable key for an outgoing request. */
  readonly next: () => Effect.Effect<OmniRouter.Info | undefined, never, User.CurrentUser>
  /** Records usage against a key (used by the runner after a request completes). */
  readonly recordUsage: (id: OmniRouter.ID, usage: OmniRouter.Usage) => Effect.Effect<void, never, User.CurrentUser>
  /** Resets a key's usage counters (e.g. after a quota window reset). */
  readonly resetUsage: (id: OmniRouter.ID) => Effect.Effect<void, never, User.CurrentUser>
  /** Aggregate stats across the pool. */
  readonly stats: () => Effect.Effect<OmniRouter.Stats, never, User.CurrentUser>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/OmniRouter") {}

const integrationIDValue = Integration.ID.make("omni-router")

const emptyUsage = (): OmniRouter.Usage => ({ requests: 0, inputTokens: 0, outputTokens: 0 })

const emptyLimit = (): OmniRouter.Limit => ({ requests: undefined, tokens: undefined })

const statusOf = (info: { enabled: boolean; usage: OmniRouter.Usage; limit?: OmniRouter.Limit }): OmniRouter.Status => {
  if (!info.enabled) return { phase: "disabled" }
  const limit = info.limit
  if (!limit) return { phase: "active" }
  const tokenUsage = info.usage.inputTokens + info.usage.outputTokens
  if (limit.requests != null && info.usage.requests >= limit.requests) {
    return { phase: "exhausted", message: "Request limit reached" }
  }
  if (limit.tokens != null && tokenUsage >= limit.tokens) {
    return { phase: "exhausted", message: "Token limit reached" }
  }
  return { phase: "active" }
}

const toInfo = (credential: Credential.Info): OmniRouter.Info | undefined => {
  if (credential.value.type !== "key") return undefined
  const meta = credential.value.metadata as
    | {
        created?: number
        lastUsed?: number
        usage?: OmniRouter.Usage
        limit?: OmniRouter.Limit
        enabled?: boolean
      }
    | undefined
  const usage = meta?.usage ?? emptyUsage()
  const limit = meta?.limit
  return OmniRouter.Info.make({
    id: credential.id,
    label: credential.label,
    created: meta?.created ?? 0,
    lastUsed: meta?.lastUsed,
    enabled: meta?.enabled ?? true,
    usage,
    limit: limit && (limit.requests !== undefined || limit.tokens !== undefined) ? limit : undefined,
    status: statusOf({ enabled: meta?.enabled ?? true, usage, limit }),
  })
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const credentials = yield* Credential.Service
    const events = yield* EventV2.Service

    const state = yield* SynchronizedRef.make({
      enabled: true,
      baseURL: DEFAULT_BASE_URL,
      strategy: "round-robin" as OmniRouter.RotationStrategy,
      cursor: 0,
    })

    // Per-user config overrides. Kept in-memory; the base `state` above is
    // the fallback for unauthenticated/legacy callers.
    const userConfigs = new Map<string, { enabled: boolean; baseURL: string; strategy: OmniRouter.RotationStrategy }>()

    const publish = (keyID?: OmniRouter.ID) => events.publish(OmniRouter.Event.Updated, { keyID }).pipe(Effect.asVoid)

    const list = Effect.fn("OmniRouter.list")(function* () {
      const user = yield* User.CurrentUser
      const rows = yield* credentials.list(integrationIDValue, user?.id)
      return rows.flatMap((row) => {
        const info = toInfo(row)
        return info ? [info] : []
      })
    })

    const configFor = Effect.fn("OmniRouter.configFor")(function* () {
      const user = yield* User.CurrentUser
      return user?.id ? userConfigs.get(user.id) ?? (yield* SynchronizedRef.get(state)) : yield* SynchronizedRef.get(state)
    })

    const next = Effect.fn("OmniRouter.next")(function* () {
      const keys = (yield* list()).filter((key) => key.enabled && key.status.phase === "active")
      if (keys.length === 0) return undefined
      const config = yield* configFor()
      if (config.strategy === "lowest-usage") {
        return keys.toSorted(
          (a, b) =>
            a.usage.inputTokens + a.usage.outputTokens - (b.usage.inputTokens + b.usage.outputTokens),
        )[0]
      }
      const selected = yield* SynchronizedRef.modify(state, (current) => {
        const index = current.cursor % keys.length
        return [keys[index], { ...current, cursor: current.cursor + 1 }] as const
      })
      return selected
    })

    const get = Effect.fn("OmniRouter.get")(function* (id) {
      const user = yield* User.CurrentUser
      const credential = yield* credentials.get(id)
      if (!credential || credential.value.type !== "key") return undefined
      // Enforce ownership: legacy/global rows (no owner) are only visible to
      // authenticated users when they are the assigned owner, and never to
      // unauthenticated callers when an owner is set.
      const ownerID = (credential.value.metadata as { userID?: string } | undefined)?.userID
      if (user?.id) {
        if (ownerID && ownerID !== user.id) return undefined
      } else {
        if (ownerID) return undefined
      }
      return toInfo(credential)
    })

    return Service.of({
      config: Effect.fn("OmniRouter.config")(function* () {
        const user = yield* User.CurrentUser
        const current = user?.id
          ? userConfigs.get(user.id) ?? (yield* SynchronizedRef.get(state))
          : yield* SynchronizedRef.get(state)
        return OmniRouter.Config.make({
          enabled: current.enabled,
          baseURL: current.baseURL,
          strategy: current.strategy,
        })
      }),
      setConfig: Effect.fn("OmniRouter.setConfig")(function* (input) {
        const user = yield* User.CurrentUser
        if (user?.id) {
          const base = userConfigs.get(user.id) ?? (yield* SynchronizedRef.get(state))
          userConfigs.set(user.id, {
            ...base,
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.baseURL !== undefined ? { baseURL: input.baseURL } : {}),
            ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
          })
        } else {
          yield* SynchronizedRef.update(state, (current) => ({
            ...current,
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.baseURL !== undefined ? { baseURL: input.baseURL } : {}),
            ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
          }))
        }
        yield* publish()
      }),
      list,
      get,
      add: Effect.fn("OmniRouter.add")(function* (input) {
        const now = Date.now()
        const user = yield* User.CurrentUser
        const credential = yield* credentials.create({
          integrationID: integrationIDValue,
          label: input.label ?? `key-${now}`,
          userID: user?.id,
          value: Credential.Key.make({
            type: "key",
            key: input.key,
            metadata: {
              created: now,
              enabled: true,
              usage: emptyUsage(),
              ...(user?.id ? { userID: user.id } : {}),
              ...(input.limit !== undefined ? { limit: input.limit } : {}),
            },
          }),
        })
        yield* publish(credential.id)
        return toInfo(credential) ?? (yield* get(credential.id))!
      }),
      update: Effect.fn("OmniRouter.update")(function* (id, input) {
        const owned = yield* get(id)
        if (!owned) return undefined
        const credential = yield* credentials.get(id)
        if (!credential || credential.value.type !== "key") return undefined
        const meta = credential.value.metadata as Record<string, unknown> | undefined
        yield* credentials.update(id, {
          label: input.label ?? credential.label,
          value: Credential.Key.make({
            type: "key",
            key: credential.value.key,
            metadata: {
              ...(meta ?? {}),
              ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
              ...(input.limit !== undefined ? { limit: input.limit } : {}),
            },
          }),
        })
        const updated = yield* get(id)
        yield* publish(id)
        return updated
      }),
      remove: Effect.fn("OmniRouter.remove")(function* (id) {
        const owned = yield* get(id)
        if (!owned) return
        yield* credentials.remove(id)
        yield* publish(id)
      }),
      rotate: Effect.fn("OmniRouter.rotate")(function* (input) {
        if (input?.prioritize) {
          // Move the cursor so the next `next()` starts at index 0.
          yield* SynchronizedRef.update(state, (current) => ({ ...current, cursor: 0 }))
        }
        const selected = yield* next()
        yield* publish(selected?.id)
        return selected
      }),
      next,
      recordUsage: Effect.fn("OmniRouter.recordUsage")(function* (id, usage) {
        const owned = yield* get(id)
        if (!owned) return
        const credential = yield* credentials.get(id)
        if (!credential || credential.value.type !== "key") return
        const meta = credential.value.metadata as
          | { usage?: OmniRouter.Usage; enabled?: boolean; limit?: OmniRouter.Limit }
          | undefined
        const current = meta?.usage ?? emptyUsage()
        yield* credentials.update(id, {
          value: Credential.Key.make({
            type: "key",
            key: credential.value.key,
            metadata: {
              ...(meta ?? {}),
              lastUsed: Date.now(),
              usage: {
                requests: current.requests + (usage.requests ?? 0),
                inputTokens: current.inputTokens + (usage.inputTokens ?? 0),
                outputTokens: current.outputTokens + (usage.outputTokens ?? 0),
              },
            },
          }),
        })
        yield* publish(id)
      }),
      resetUsage: Effect.fn("OmniRouter.resetUsage")(function* (id) {
        const owned = yield* get(id)
        if (!owned) return
        const credential = yield* credentials.get(id)
        if (!credential || credential.value.type !== "key") return
        yield* credentials.update(id, {
          value: Credential.Key.make({
            type: "key",
            key: credential.value.key,
            metadata: { ...(credential.value.metadata ?? {}), usage: emptyUsage() },
          }),
        })
        yield* publish(id)
      }),
      stats: Effect.fn("OmniRouter.stats")(function* () {
        const keys = yield* list()
        const total = keys.reduce<OmniRouter.Usage>(
          (acc, key) => ({
            requests: acc.requests + key.usage.requests,
            inputTokens: acc.inputTokens + key.usage.inputTokens,
            outputTokens: acc.outputTokens + key.usage.outputTokens,
          }),
          emptyUsage(),
        )
        const config = yield* configFor()
        const currentKey = yield* SynchronizedRef.get(state)
        return OmniRouter.Stats.make({
          keys,
          total,
          activeKeys: keys.filter((key) => key.status.phase === "active").length,
          exhaustedKeys: keys.filter((key) => key.status.phase === "exhausted").length,
          totalLimit: undefined,
          currentKeyID: keys.length > 0 ? keys[currentKey.cursor % keys.length]?.id : undefined,
          strategy: config.strategy,
          updated: Date.now(),
        })
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Credential.node, EventV2.node] })
