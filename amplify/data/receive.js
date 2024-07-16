import { util, extensions } from "@aws-appsync/utils"

// Subscription handlers must return a `null` payload on the request
export function request() { return { payload: null } }

/**
 * @param {import('@aws-appsync/utils').Context} ctx
 */
export function response(ctx) {
  const filter = {
    videoId: {
      eq: ctx.args.videoId
    }
  }

  extensions.setSubscriptionFilter(util.transform.toSubscriptionFilter(filter))

  return null
}