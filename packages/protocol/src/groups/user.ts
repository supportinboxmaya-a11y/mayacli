import { User } from "@opencode-ai/schema/user"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import {
  EmailTakenError,
  ForbiddenError,
  InvalidCredentialsError,
  InvalidResetTokenError,
  TooManyRequestsError,
  UnauthorizedError,
  UsernameTakenError,
} from "../errors"
import { RateLimit } from "../middleware/rate-limit"

export const UserGroup = HttpApiGroup.make("server.user")
  .add(
    HttpApiEndpoint.post("user.signup", "/api/auth/signup", {
      payload: User.SignupInput,
      success: User.AuthResult,
      error: Schema.Union([UsernameTakenError, EmailTakenError, TooManyRequestsError]),
    })
      .middleware(RateLimit)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.user.signup",
          summary: "Sign up",
          description: "Create a new account and start a session.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("user.login", "/api/auth/login", {
      payload: User.LoginInput,
      success: User.AuthResult,
      error: Schema.Union([InvalidCredentialsError, TooManyRequestsError]),
    })
      .middleware(RateLimit)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.user.login",
          summary: "Log in",
          description: "Authenticate with username or email and password.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("user.logout", "/api/auth/logout", {
      payload: Schema.Struct({}),
      success: HttpApiSchema.NoContent,
    })
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.user.logout",
          summary: "Log out",
          description: "Invalidate the current session token.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("user.reset.request", "/api/auth/reset-password/request", {
      payload: User.ResetRequestInput,
      success: Schema.Struct({ token: Schema.String }),
      error: TooManyRequestsError,
    })
      .middleware(RateLimit)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.user.reset.request",
          summary: "Request password reset",
          description: "Begin a password reset. Always succeeds; tokens are only returned for known accounts.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("user.reset.confirm", "/api/auth/reset-password/confirm", {
      payload: User.ResetConfirmInput,
      success: HttpApiSchema.NoContent,
      error: Schema.Union([InvalidResetTokenError, TooManyRequestsError]),
    })
      .middleware(RateLimit)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.user.reset.confirm",
          summary: "Confirm password reset",
          description: "Complete a password reset with the token from the reset request.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("user.me", "/api/user", {
      success: User.Info,
      error: UnauthorizedError,
    })
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.user.me",
          summary: "Get profile",
          description: "Return the authenticated user's profile.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.patch("user.profile", "/api/user", {
      payload: User.ProfileInput,
      success: User.Info,
      error: UnauthorizedError,
    })
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.user.profile",
          summary: "Update profile",
          description: "Update name or avatar.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("user.settings", "/api/user/settings", {
      payload: User.SettingsInput,
      success: User.Info,
      error: UnauthorizedError,
    })
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.user.settings",
          summary: "Update settings",
          description: "Replace the user's settings object.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("user.password", "/api/user/password", {
      payload: User.PasswordChangeInput,
      success: HttpApiSchema.NoContent,
      error: Schema.Union([UnauthorizedError, ForbiddenError]),
    })
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.user.password",
          summary: "Change password",
          description: "Change the password after verifying the current one.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "user",
      description: "Multi-user authentication and profile routes.",
    }),
  )
