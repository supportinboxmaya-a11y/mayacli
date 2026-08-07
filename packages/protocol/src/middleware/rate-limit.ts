import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { TooManyRequestsError } from "../errors"

/** In-memory rate limiting for sensitive endpoints (auth). */
export class RateLimit extends HttpApiMiddleware.Service<RateLimit>()("@opencode/HttpApiRateLimit", {
  error: TooManyRequestsError,
}) {}

export * as RateLimitMiddleware from "./rate-limit"
