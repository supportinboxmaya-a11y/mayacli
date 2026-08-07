import { Data } from "effect"

/** Errors raised by the User service. Each carries a stable `_tag` for handler mapping. */
export class NotFound extends Data.TaggedError("User.NotFound") {}
export class UsernameTaken extends Data.TaggedError("User.UsernameTaken")<{ username: string }> {}
export class EmailTaken extends Data.TaggedError("User.EmailTaken")<{ email: string }> {}
export class InvalidCredentials extends Data.TaggedError("User.InvalidCredentials")<{ message?: string }> {}
export class InvalidResetToken extends Data.TaggedError("User.InvalidResetToken")<{ message?: string }> {}
