export * as User from "./user"

import { Context, Schema } from "effect"
import { optional, statics } from "./schema"
import { ascending } from "./identifier"

export const ID = Schema.String.pipe(
  Schema.brand("User.ID"),
  statics((schema) => ({ create: () => schema.make("usr_" + ascending()) })),
)
export type ID = typeof ID.Type

export const SessionID = Schema.String.pipe(
  Schema.brand("User.Session.ID"),
  statics((schema) => ({ create: () => schema.make("ses_" + ascending()) })),
)
export type SessionID = typeof SessionID.Type

/** Public user profile. Never contains the password hash or session material. */
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  username: Schema.String,
  email: Schema.String,
  name: Schema.optional(Schema.String),
  avatar: Schema.optional(Schema.String),
  /** Free-form per-user preferences (JSON). */
  settings: Schema.Record(Schema.String, Schema.Unknown),
  time: Schema.Struct({
    created: Schema.Number,
    updated: Schema.Number,
  }),
}).annotate({ identifier: "User.Info" })

export interface ProfileInput extends Schema.Schema.Type<typeof ProfileInput> {}
export const ProfileInput = Schema.Struct({
  name: Schema.optional(Schema.String),
  avatar: Schema.optional(Schema.String),
}).annotate({ identifier: "User.ProfileInput" })

export interface SettingsInput extends Schema.Schema.Type<typeof SettingsInput> {}
export const SettingsInput = Schema.Record(Schema.String, Schema.Unknown).annotate({
  identifier: "User.SettingsInput",
})

export interface PasswordChangeInput extends Schema.Schema.Type<typeof PasswordChangeInput> {}
export const PasswordChangeInput = Schema.Struct({
  /** Current password, required when the user is authenticated. */
  current: Schema.String,
  next: Schema.String.pipe(Schema.check(Schema.isMinLength(8))),
}).annotate({ identifier: "User.PasswordChangeInput" })

/* ------------------------------------------------------------------ */
/* Auth (signup / login / reset)                                       */
/* ------------------------------------------------------------------ */

export interface SignupInput extends Schema.Schema.Type<typeof SignupInput> {}
export const SignupInput = Schema.Struct({
  username: Schema.String.pipe(Schema.check(Schema.isMinLength(3)), Schema.check(Schema.isMaxLength(32))),
  email: Schema.String.pipe(Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))),
  password: Schema.String.pipe(Schema.check(Schema.isMinLength(8))),
  name: Schema.optional(Schema.String),
}).annotate({ identifier: "User.SignupInput" })

export interface LoginInput extends Schema.Schema.Type<typeof LoginInput> {}
export const LoginInput = Schema.Struct({
  /** Username or email. */
  identifier: Schema.String,
  password: Schema.String,
}).annotate({ identifier: "User.LoginInput" })

export interface AuthResult extends Schema.Schema.Type<typeof AuthResult> {}
export const AuthResult = Schema.Struct({
  token: Schema.String,
  user: Info,
}).annotate({ identifier: "User.AuthResult" })

export interface ResetRequestInput extends Schema.Schema.Type<typeof ResetRequestInput> {}
export const ResetRequestInput = Schema.Struct({
  /** Username or email of the account to reset. */
  identifier: Schema.String,
}).annotate({ identifier: "User.ResetRequestInput" })

export interface ResetConfirmInput extends Schema.Schema.Type<typeof ResetConfirmInput> {}
export const ResetConfirmInput = Schema.Struct({
  /** One-time reset token from the reset-request response. */
  token: Schema.String,
  /** New password. */
  password: Schema.String.pipe(Schema.check(Schema.isMinLength(8))),
}).annotate({ identifier: "User.ResetConfirmInput" })

export const Settings = {
  Info,
  ProfileInput,
  SettingsInput,
  PasswordChangeInput,
  SignupInput,
  LoginInput,
  AuthResult,
  ResetRequestInput,
  ResetConfirmInput,
} as const

/**
 * The authenticated user for the current request. Absent when the request is
 * not authenticated (public routes only) or the token is invalid. Provided by
 * the server's auth middleware; read by core services to scope data.
 */
export class CurrentUser extends Context.Service<CurrentUser, Info | undefined>()("@opencode/HttpApiCurrentUser") {}
