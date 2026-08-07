import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260806000000_multi_user",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`user\` (
          \`id\` text PRIMARY KEY,
          \`username\` text NOT NULL,
          \`email\` text NOT NULL,
          \`password_hash\` text NOT NULL,
          \`name\` text,
          \`avatar\` text,
          \`settings\` text NOT NULL DEFAULT '{}',
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE UNIQUE INDEX \`user_username_unique_idx\` ON \`user\` (\`username\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`user_email_unique_idx\` ON \`user\` (\`email\`);`)

      yield* tx.run(`
        CREATE TABLE \`user_session\` (
          \`id\` text PRIMARY KEY,
          \`user_id\` text NOT NULL,
          \`token_hash\` text NOT NULL,
          \`expires\` integer NOT NULL,
          \`created\` integer NOT NULL,
          \`last_used\` integer,
          CONSTRAINT \`fk_user_session_user_id_user_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`user_session_user_id_idx\` ON \`user_session\` (\`user_id\`);`)

      yield* tx.run(`
        CREATE TABLE \`password_reset\` (
          \`id\` text PRIMARY KEY,
          \`user_id\` text NOT NULL,
          \`token_hash\` text NOT NULL,
          \`expires\` integer NOT NULL,
          \`created\` integer NOT NULL,
          CONSTRAINT \`fk_password_reset_user_id_user_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`password_reset_user_id_idx\` ON \`password_reset\` (\`user_id\`);`)

      yield* tx.run(`ALTER TABLE \`project\` ADD COLUMN \`user_id\` text;`)
      yield* tx.run(`CREATE INDEX \`project_user_id_idx\` ON \`project\` (\`user_id\`);`)

      yield* tx.run(`ALTER TABLE \`credential\` ADD COLUMN \`user_id\` text;`)
      yield* tx.run(`CREATE INDEX \`credential_user_id_idx\` ON \`credential\` (\`user_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
