import { User } from "@opencode-ai/schema/user"
import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { UnauthorizedError } from "../errors"

// The `CurrentUser` context key lives in the schema package so both core
// services and protocol/server middleware can read it without a core→protocol
// dependency. Re-export here for callers that already import from protocol.
export { CurrentUser } from "@opencode-ai/schema/user"

/**
 * Authenticates a request via `Authorization: Bearer <token>` and resolves
 * the current user. The server layer attaches the user's ID to the request
 * context via `CurrentUser`; handlers read it to scope data.
 */
export class UserAuth extends HttpApiMiddleware.Service<UserAuth>()("@opencode/HttpApiUserAuth", {
  error: UnauthorizedError,
}) {}

export * as UserAuthMiddleware from "./user-auth"
