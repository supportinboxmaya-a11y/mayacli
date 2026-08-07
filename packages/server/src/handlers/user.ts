import { User } from "@opencode-ai/core/user"
import {
  EmailTakenError,
  ForbiddenError,
  InvalidCredentialsError,
  InvalidResetTokenError,
  UnauthorizedError,
  UsernameTakenError,
} from "@opencode-ai/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { HttpServerRequest } from "effect/unstable/http"
import { Api } from "../api"

export const UserHandler = HttpApiBuilder.group(Api, "server.user", (handlers) =>
  Effect.gen(function* () {
    const users = yield* User.Service

    const requireUser = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? "")
      const token = match?.[1]
      if (!token) return yield* new UnauthorizedError({ message: "Authentication required" })
      const user = yield* users.fromToken(token)
      if (!user) return yield* new UnauthorizedError({ message: "Invalid or expired session" })
      return user
    })

    return handlers
      .handle(
        "user.signup",
        Effect.fn(function* (ctx) {
          return yield* users.signup(ctx.payload).pipe(
            Effect.mapError((error) =>
              error._tag === "User.UsernameTaken"
                ? new UsernameTakenError({ username: error.username })
                : new EmailTakenError({ email: error.email }),
            ),
          )
        }),
      )
      .handle(
        "user.login",
        Effect.fn(function* (ctx) {
          return yield* users.login(ctx.payload).pipe(
            Effect.mapError((error) => new InvalidCredentialsError({ message: error.message ?? "Invalid credentials" })),
          )
        }),
      )
      .handle(
        "user.logout",
        Effect.fn(function* (ctx) {
          const user = yield* requireUser
          void user
          yield* users.logout(ctx.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "")
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "user.reset.request",
        Effect.fn(function* (ctx) {
          const token = yield* users.requestReset(ctx.payload)
          return { token }
        }),
      )
      .handle(
        "user.reset.confirm",
        Effect.fn(function* (ctx) {
          yield* users.confirmReset(ctx.payload).pipe(
            Effect.mapError((error) => new InvalidResetTokenError({ message: error.message ?? "Invalid reset token" })),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle(
        "user.me",
        Effect.fn(function* () {
          const user = yield* requireUser
          return user
        }),
      )
      .handle(
        "user.profile",
        Effect.fn(function* (ctx) {
          const user = yield* requireUser
          return yield* users.updateProfile(user.id, ctx.payload)
        }),
      )
      .handle(
        "user.settings",
        Effect.fn(function* (ctx) {
          const user = yield* requireUser
          return yield* users.updateSettings(user.id, ctx.payload)
        }),
      )
      .handle(
        "user.password",
        Effect.fn(function* (ctx) {
          const user = yield* requireUser
          yield* users.changePassword(user.id, ctx.payload).pipe(
            Effect.mapError((error) =>
              error._tag === "User.InvalidCredentials"
                ? new ForbiddenError({ message: error.message ?? "Current password is incorrect" })
                : new UnauthorizedError({ message: "Authentication required" }),
            ),
          )
          return HttpApiSchema.NoContent.make()
        }),
      )
  }),
)
