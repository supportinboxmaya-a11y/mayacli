import { User } from "@opencode-ai/core/user"
import { CurrentUser, UserAuth } from "@opencode-ai/protocol/middleware/user-auth"
import { UnauthorizedError } from "@opencode-ai/protocol/errors"
import { Effect, Layer } from "effect"
import { HttpServerRequest } from "effect/unstable/http"

export { CurrentUser } from "@opencode-ai/protocol/middleware/user-auth"

/** Extracts the bearer token from a request, if present. */
export function bearerToken(request: HttpServerRequest.HttpServerRequest): string | undefined {
  const header = request.headers.authorization ?? ""
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (match) return match[1]
  const url = new URL(request.url, "http://localhost")
  return url.searchParams.get("auth_token") ?? undefined
}

/**
 * Requires a valid bearer token. Resolves the user and provides it as
 * `CurrentUser`; fails with 401 when missing or invalid.
 */
export const userAuthLayer = Layer.effect(
  UserAuth,
  Effect.gen(function* () {
    const users = yield* User.Service
    return UserAuth.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const token = bearerToken(request)
        if (!token) return yield* new UnauthorizedError({ message: "Authentication required" })
        const user = yield* users.fromToken(token)
        if (!user) return yield* new UnauthorizedError({ message: "Invalid or expired session" })
        return yield* effect.pipe(Effect.provideService(CurrentUser, user))
      }),
    )
  }),
)

/**
 * Attaches `CurrentUser` when a valid token is present, but never rejects.
 * Used on public endpoints that may optionally personalize a response.
 */
export const userAuthOptionalLayer = Layer.effect(
  UserAuth,
  Effect.gen(function* () {
    const users = yield* User.Service
    return UserAuth.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const token = bearerToken(request)
        if (!token) return yield* effect.pipe(Effect.provideService(CurrentUser, undefined))
        const user = yield* users.fromToken(token)
        return yield* effect.pipe(Effect.provideService(CurrentUser, user))
      }),
    )
  }),
)
