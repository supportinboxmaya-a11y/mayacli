import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import type { User } from "../user"

export const UserTable = sqliteTable("user", {
  id: text().$type<User.ID>().primaryKey(),
  username: text().notNull(),
  email: text().notNull(),
  password_hash: text().notNull(),
  name: text(),
  avatar: text(),
  settings: text({ mode: "json" }).$type<Record<string, unknown>>().notNull().$default(() => ({})),
  ...Timestamps,
})

export const UserSessionTable = sqliteTable("user_session", {
  id: text().$type<User.SessionID>().primaryKey(),
  user_id: text()
    .$type<User.ID>()
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  token_hash: text().notNull(),
  expires: integer().notNull(),
  created: integer().notNull(),
  last_used: integer(),
})

export const PasswordResetTable = sqliteTable("password_reset", {
  id: text().$type<User.SessionID>().primaryKey(),
  user_id: text()
    .$type<User.ID>()
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  token_hash: text().notNull(),
  expires: integer().notNull(),
  created: integer().notNull(),
})
