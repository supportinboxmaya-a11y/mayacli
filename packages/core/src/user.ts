export * as User from "./user"

import { UserTable, UserSessionTable, PasswordResetTable } from "./user/sql"
import { User } from "@opencode-ai/schema/user"
import { Database } from "./database/database"
import { Context, Effect, Layer, Schema } from "effect"
import { makeGlobalNode } from "./effect/app-node"
import { and, desc, eq } from "drizzle-orm"
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto"
import * as SessionError from "./user/errors"

export const ID = User.ID
export type ID = User.ID
export const SessionID = User.SessionID
export type SessionID = User.SessionID

export const Info = User.Info
export type Info = User.Info

export const SessionDurationMs = 30 * 24 * 60 * 60 * 1000 // 30 days
export const ResetDurationMs = 60 * 60 * 1000 // 1 hour

export type Error =
  | SessionError.NotFound
  | SessionError.UsernameTaken
  | SessionError.EmailTaken
  | SessionError.InvalidCredentials
  | SessionError.InvalidResetToken

export interface Interface {
  /** Returns the authenticated user's public profile. */
  readonly get: (id: ID) => Effect.Effect<Info | undefined>
  /** Updates profile fields (name, avatar). Fails with `User.NotFound`. */
  readonly updateProfile: (id: ID, input: User.ProfileInput) => Effect.Effect<Info, SessionError.NotFound>
  /** Replaces the user's settings object. Fails with `User.NotFound`. */
  readonly updateSettings: (id: ID, input: Record<string, unknown>) => Effect.Effect<Info, SessionError.NotFound>
  /** Changes the user's password after verifying the current one. */
  readonly changePassword: (
    id: ID,
    input: User.PasswordChangeInput,
  ) => Effect.Effect<Info, SessionError.NotFound | SessionError.InvalidCredentials>
  /** Creates a new user. Fails with `User.UsernameTaken` / `User.EmailTaken`. */
  readonly signup: (input: User.SignupInput) => Effect.Effect<User.AuthResult, SessionError.UsernameTaken | SessionError.EmailTaken>
  /** Logs a user in. Fails with `User.InvalidCredentials`. */
  readonly login: (input: User.LoginInput) => Effect.Effect<User.AuthResult, SessionError.InvalidCredentials>
  /** Logs out a session token. */
  readonly logout: (token: string) => Effect.Effect<void>
  /** Resolves a bearer token to a user, or `undefined` if invalid/expired. */
  readonly fromToken: (token: string) => Effect.Effect<Info | undefined>
  /** Starts a password reset. Returns the one-time reset token. */
  readonly requestReset: (input: User.ResetRequestInput) => Effect.Effect<string>
  /** Completes a password reset. Fails with `User.InvalidResetToken`. */
  readonly confirmReset: (input: User.ResetConfirmInput) => Effect.Effect<void, SessionError.InvalidResetToken>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/User") {}

const decodeUser = Schema.decodeUnknownSync(User.Info)

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `scrypt$${salt}$${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$")
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const [, salt, hash] = parts
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, "hex")
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

function makeToken(): string {
  return randomBytes(32).toString("base64url")
}

/** Deterministic hash for opaque session tokens (looked up by value). */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    const rowToInfo = (row: typeof UserTable.$inferSelect): Info =>
      decodeUser({
        id: row.id,
        username: row.username,
        email: row.email,
        name: row.name ?? undefined,
        avatar: row.avatar ?? undefined,
        settings: row.settings ?? {},
        time: { created: row.time_created, updated: row.time_updated },
      })

    const findByUsernameOrEmail = Effect.fn("User.findByUsernameOrEmail")(function* (identifier: string) {
      const byUsername = yield* db
        .select()
        .from(UserTable)
        .where(eq(UserTable.username, identifier))
        .get()
        .pipe(Effect.orDie)
      if (byUsername) return byUsername
      return yield* db
        .select()
        .from(UserTable)
        .where(eq(UserTable.email, identifier))
        .get()
        .pipe(Effect.orDie)
    })

    const createSession = Effect.fn("User.createSession")(function* (userID: ID) {
      const token = makeToken()
      const id = SessionID.create()
      yield* db
        .insert(UserSessionTable)
        .values({
          id,
          user_id: userID,
          token_hash: hashToken(token),
          expires: Date.now() + SessionDurationMs,
          created: Date.now(),
        })
        .run()
        .pipe(Effect.orDie)
      return token
    })

    const authResult = Effect.fn("User.authResult")(function* (user: typeof UserTable.$inferSelect, token: string) {
      return {
        token,
        user: rowToInfo(user),
      } satisfies User.AuthResult
    })

    return Service.of({
      get: Effect.fn("User.get")(function* (id) {
        const row = yield* db.select().from(UserTable).where(eq(UserTable.id, id)).get().pipe(Effect.orDie)
        return row ? rowToInfo(row) : undefined
      }),
      updateProfile: Effect.fn("User.updateProfile")(function* (id, input) {
        yield* db
          .update(UserTable)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
            time_updated: Date.now(),
          })
          .where(eq(UserTable.id, id))
          .run()
          .pipe(Effect.orDie)
        const row = yield* db.select().from(UserTable).where(eq(UserTable.id, id)).get().pipe(Effect.orDie)
        if (!row) return yield* new SessionError.NotFound()
        return rowToInfo(row)
      }),
      updateSettings: Effect.fn("User.updateSettings")(function* (id, input) {
        yield* db
          .update(UserTable)
          .set({ settings: input, time_updated: Date.now() })
          .where(eq(UserTable.id, id))
          .run()
          .pipe(Effect.orDie)
        const row = yield* db.select().from(UserTable).where(eq(UserTable.id, id)).get().pipe(Effect.orDie)
        if (!row) return yield* new SessionError.NotFound()
        return rowToInfo(row)
      }),
      changePassword: Effect.fn("User.changePassword")(function* (id, input) {
        const row = yield* db.select().from(UserTable).where(eq(UserTable.id, id)).get().pipe(Effect.orDie)
        if (!row) return yield* new SessionError.NotFound()
        if (!verifyPassword(input.current, row.password_hash)) {
          return yield* new SessionError.InvalidCredentials({ message: "Current password is incorrect" })
        }
        yield* db
          .update(UserTable)
          .set({ password_hash: hashPassword(input.next), time_updated: Date.now() })
          .where(eq(UserTable.id, id))
          .run()
          .pipe(Effect.orDie)
        return rowToInfo(row)
      }),
      signup: Effect.fn("User.signup")(function* (input) {
        const existing = yield* db
          .select()
          .from(UserTable)
          .where(eq(UserTable.username, input.username))
          .get()
          .pipe(Effect.orDie)
        if (existing) return yield* new SessionError.UsernameTaken({ username: input.username })
        const emailTaken = yield* db
          .select()
          .from(UserTable)
          .where(eq(UserTable.email, input.email))
          .get()
          .pipe(Effect.orDie)
        if (emailTaken) return yield* new SessionError.EmailTaken({ email: input.email })

        const id = ID.create()
        const now = Date.now()
        yield* db
          .insert(UserTable)
          .values({
            id,
            username: input.username,
            email: input.email,
            password_hash: hashPassword(input.password),
            name: input.name,
            settings: {},
            time_created: now,
            time_updated: now,
          })
          .run()
          .pipe(Effect.orDie)
        const token = yield* createSession(id)
        const row = yield* db.select().from(UserTable).where(eq(UserTable.id, id)).get().pipe(Effect.orDie)
        return yield* authResult(row!, token)
      }),
      login: Effect.fn("User.login")(function* (input) {
        const row = yield* findByUsernameOrEmail(input.identifier)
        if (!row || !verifyPassword(input.password, row.password_hash)) {
          return yield* new SessionError.InvalidCredentials({ message: "Invalid username or password" })
        }
        const token = yield* createSession(row.id)
        return yield* authResult(row, token)
      }),
      logout: Effect.fn("User.logout")(function* (token) {
        yield* db.delete(UserSessionTable).where(eq(UserSessionTable.token_hash, hashToken(token))).run().pipe(Effect.orDie)
      }),
      fromToken: Effect.fn("User.fromToken")(function* (token) {
        if (!token) return undefined
        const sessions = yield* db
          .select()
          .from(UserSessionTable)
          .where(eq(UserSessionTable.token_hash, hashToken(token)))
          .all()
          .pipe(Effect.orDie)
        const session = sessions.find((s) => s.expires > Date.now())
        if (!session) return undefined
        const row = yield* db.select().from(UserTable).where(eq(UserTable.id, session.user_id)).get().pipe(Effect.orDie)
        if (!row) return undefined
        yield* db
          .update(UserSessionTable)
          .set({ last_used: Date.now() })
          .where(eq(UserSessionTable.id, session.id))
          .run()
          .pipe(Effect.orDie)
        return rowToInfo(row)
      }),
      requestReset: Effect.fn("User.requestReset")(function* (input) {
        const row = yield* findByUsernameOrEmail(input.identifier)
        // Always succeed so we don't leak which identifiers exist.
        if (!row) return randomUUID()
        const token = makeToken()
        yield* db
          .insert(PasswordResetTable)
          .values({
            id: SessionID.create(),
            user_id: row.id,
            token_hash: hashToken(token),
            expires: Date.now() + ResetDurationMs,
            created: Date.now(),
          })
          .run()
          .pipe(Effect.orDie)
        return token
      }),
      confirmReset: Effect.fn("User.confirmReset")(function* (input) {
        const rows = yield* db
          .select()
          .from(PasswordResetTable)
          .where(eq(PasswordResetTable.token_hash, hashToken(input.token)))
          .all()
          .pipe(Effect.orDie)
        const reset = rows.find((r) => r.expires > Date.now())
        if (!reset) return yield* new SessionError.InvalidResetToken({ message: "Invalid or expired reset token" })
        yield* db
          .update(UserTable)
          .set({ password_hash: hashPassword(input.password), time_updated: Date.now() })
          .where(eq(UserTable.id, reset.user_id))
          .run()
          .pipe(Effect.orDie)
        yield* db.delete(PasswordResetTable).where(eq(PasswordResetTable.id, reset.id)).run().pipe(Effect.orDie)
        // Invalidate all existing sessions for the account.
        yield* db.delete(UserSessionTable).where(eq(UserSessionTable.user_id, reset.user_id)).run().pipe(Effect.orDie)
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })

export * as SessionError from "./user/errors"
