import { OmniRouter } from "@opencode-ai/schema/omni-router"
import { Location } from "@opencode-ai/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

export const OmniRouterGroup = HttpApiGroup.make("server.omniRouter")
  .add(
    HttpApiEndpoint.get("omniRouter.config", "/api/omni-router/config", {
      query: LocationQuery,
      success: Location.response(OmniRouter.Config),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.omniRouter.config",
          summary: "Get OmniRouter config",
          description: "Return the runtime configuration for the OmniRouter gateway.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.patch("omniRouter.setConfig", "/api/omni-router/config", {
      query: LocationQuery,
      payload: Schema.Struct({
        enabled: Schema.optional(Schema.Boolean),
        baseURL: Schema.optional(Schema.String),
        strategy: Schema.optional(OmniRouter.RotationStrategy),
      }),
      success: HttpApiSchema.NoContent,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.omniRouter.setConfig",
          summary: "Update OmniRouter config",
          description: "Update the runtime configuration for the OmniRouter gateway.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("omniRouter.list", "/api/omni-router/key", {
      query: LocationQuery,
      success: Location.response(Schema.Array(OmniRouter.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.omniRouter.list",
          summary: "List OmniRouter keys",
          description: "List every stored OmniRouter API key with live usage and status.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("omniRouter.get", "/api/omni-router/key/:keyID", {
      params: { keyID: OmniRouter.ID },
      query: LocationQuery,
      success: Location.response(Schema.UndefinedOr(OmniRouter.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.omniRouter.get",
          summary: "Get OmniRouter key",
          description: "Return one OmniRouter API key by id.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("omniRouter.add", "/api/omni-router/key", {
      query: LocationQuery,
      payload: OmniRouter.CreateInput,
      success: Location.response(OmniRouter.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.omniRouter.add",
          summary: "Add OmniRouter key",
          description: "Add a new API key to the OmniRouter pool.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.patch("omniRouter.update", "/api/omni-router/key/:keyID", {
      params: { keyID: OmniRouter.ID },
      query: LocationQuery,
      payload: OmniRouter.UpdateInput,
      success: Location.response(Schema.UndefinedOr(OmniRouter.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.omniRouter.update",
          summary: "Update OmniRouter key",
          description: "Update a stored OmniRouter API key (label, enabled, limit).",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.delete("omniRouter.remove", "/api/omni-router/key/:keyID", {
      params: { keyID: OmniRouter.ID },
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.omniRouter.remove",
          summary: "Remove OmniRouter key",
          description: "Remove an API key from the OmniRouter pool.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("omniRouter.rotate", "/api/omni-router/rotate", {
      query: LocationQuery,
      payload: Schema.Struct({}),
      success: Location.response(Schema.UndefinedOr(OmniRouter.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.omniRouter.rotate",
          summary: "Rotate OmniRouter key",
          description: "Rotate to the next usable key and return the one to use.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("omniRouter.resetUsage", "/api/omni-router/key/:keyID/reset-usage", {
      params: { keyID: OmniRouter.ID },
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.omniRouter.resetUsage",
          summary: "Reset OmniRouter key usage",
          description: "Reset a key's usage counters (e.g. after a quota window reset).",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("omniRouter.stats", "/api/omni-router/stats", {
      query: LocationQuery,
      success: Location.response(OmniRouter.Stats),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.omniRouter.stats",
          summary: "OmniRouter stats",
          description: "Aggregate usage stats across the OmniRouter key pool.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "omni-router",
      description: "OmniRouter gateway key-pool management routes.",
    }),
  )
