import { Effect, Layer, Option, Ref } from "effect"
import { RateLimit } from "@opencode-ai/protocol/middleware/rate-limit"
import { HttpServerRequest } from "effect/unstable/http"
import { TooManyRequestsError } from "@opencode-ai/protocol/errors"

interface Bucket {
  readonly count: number
  readonly resetAt: number
}

export const rateLimitLayer = (limit = 20, windowMs = 60_000) =>
  Layer.effect(
    RateLimit,
    Effect.gen(function* () {
      const buckets = yield* Ref.make(new Map<string, Bucket>())
      return RateLimit.of((effect) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const key = request.remoteAddress.pipe(Option.getOrElse(() => "unknown"))
          const now = Date.now()
          yield* Ref.update(buckets, (map) => {
            const next = new Map(map)
            const bucket = next.get(key)
            if (!bucket || bucket.resetAt <= now) {
              next.set(key, { count: 1, resetAt: now + windowMs })
            } else {
              next.set(key, { count: bucket.count + 1, resetAt: bucket.resetAt })
            }
            return next
          })
          const bucket = (yield* Ref.get(buckets)).get(key)!
          if (bucket.count > limit) {
            return yield* new TooManyRequestsError({ message: "Too many requests. Try again shortly." })
          }
          return yield* effect
        }),
      )
    }),
  )
