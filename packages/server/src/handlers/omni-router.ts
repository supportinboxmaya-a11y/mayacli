import { OmniRouter } from "@opencode-ai/core/omni-router"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const OmniRouterHandler = HttpApiBuilder.group(Api, "server.omniRouter", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "omniRouter.config",
        Effect.fn(function* () {
          const service = yield* OmniRouter.Service
          return yield* response(service.config())
        }),
      )
      .handle(
        "omniRouter.setConfig",
        Effect.fn(function* (ctx) {
          const service = yield* OmniRouter.Service
          yield* service.setConfig(ctx.payload)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "omniRouter.list",
        Effect.fn(function* () {
          const service = yield* OmniRouter.Service
          return yield* response(service.list())
        }),
      )
      .handle(
        "omniRouter.get",
        Effect.fn(function* (ctx) {
          const service = yield* OmniRouter.Service
          return yield* response(service.get(ctx.params.keyID))
        }),
      )
      .handle(
        "omniRouter.add",
        Effect.fn(function* (ctx) {
          const service = yield* OmniRouter.Service
          return yield* response(service.add(ctx.payload))
        }),
      )
      .handle(
        "omniRouter.update",
        Effect.fn(function* (ctx) {
          const service = yield* OmniRouter.Service
          return yield* response(service.update(ctx.params.keyID, ctx.payload))
        }),
      )
      .handle(
        "omniRouter.remove",
        Effect.fn(function* (ctx) {
          const service = yield* OmniRouter.Service
          yield* service.remove(ctx.params.keyID)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "omniRouter.rotate",
        Effect.fn(function* (ctx) {
          const service = yield* OmniRouter.Service
          return yield* response(service.rotate(ctx.payload))
        }),
      )
      .handle(
        "omniRouter.resetUsage",
        Effect.fn(function* (ctx) {
          const service = yield* OmniRouter.Service
          yield* service.resetUsage(ctx.params.keyID)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "omniRouter.stats",
        Effect.fn(function* () {
          const service = yield* OmniRouter.Service
          return yield* response(service.stats())
        }),
      )
  }),
)
