import Stripe from "stripe";

/**
 * Stripe configuration, the client accessor, and the boot-time check.
 *
 * IMPORTANT: nothing here reads process.env at MODULE SCOPE, and nothing here
 * constructs the Stripe client at module scope either. ES module imports are
 * fully evaluated before the importing module's body runs, so both would happen
 * before ./env.js has loaded the root .env - producing a client authenticated
 * with the literal string "undefined" that fails on its first call rather than
 * at boot. This is the same rule documented in config/auth.js.
 */

/**
 * The API version every request and every webhook payload is pinned to.
 *
 * ⚠ REPLACE THIS with the exact string from the Stripe dashboard under
 * Developers → API version. Leaving it unset would make the account's default
 * version apply instead, which Stripe can move under you - and a version bump
 * changes payload shapes, so the webhook handler would start reading fields
 * that had quietly been renamed. Pinning here means an upgrade is a deliberate
 * edit to this line.
 */
export const STRIPE_API_VERSION = "2026-08-26.dahlia";

/**
 * Prefix guards.
 *
 * These catch the two mistakes that actually happen, both of which otherwise
 * surface as an unrelated error much later: pasting the PUBLISHABLE key
 * (pk_...) where the secret key goes, and pasting the dashboard's webhook
 * secret while running `stripe listen`, which mints a different one.
 */
const SECRET_KEY_PREFIX = "sk_";
const WEBHOOK_SECRET_PREFIX = "whsec_";
const PRICE_ID_PREFIX = "price_";

/** Where Checkout sends the browser afterwards. Overridable, but not required. */
const DEFAULT_SUCCESS_URL = "http://localhost:8081/subscription/success";
const DEFAULT_CANCEL_URL = "http://localhost:8081/subscription/cancelled";

const requirePrefixed = (name, prefix, hint) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set. Add it to the repo-root .env - ${hint}`);
  }

  if (!value.startsWith(prefix)) {
    throw new Error(
      `${name} must start with "${prefix}" (got "${value.slice(0, 8)}..."). ${hint}`,
    );
  }

  return value;
};

/**
 * The secret API key. Read at call time, never at module scope.
 *
 * @returns {string}
 * @throws {Error} when unset or not an sk_ key
 */
export const getStripeSecretKey = () =>
  requirePrefixed(
    "STRIPE_SECRET_KEY",
    SECRET_KEY_PREFIX,
    "Copy the SECRET key from the Stripe dashboard under Developers → API keys.",
  );

/**
 * The signing secret the webhook verifies against.
 *
 * ⚠ THE LOCAL AND DEPLOYED VALUES ARE DIFFERENT SECRETS. `stripe listen` prints
 * its own, and the dashboard endpoint has another; using the dashboard's one
 * while forwarding through the CLI fails every signature check with an error
 * that says nothing about which secret is wrong.
 *
 * @returns {string}
 * @throws {Error} when unset or not a whsec_ secret
 */
export const getStripeWebhookSecret = () =>
  requirePrefixed(
    "STRIPE_WEBHOOK_SECRET",
    WEBHOOK_SECRET_PREFIX,
    "Locally this is printed by `stripe listen --forward-to ...`, NOT the dashboard.",
  );

/**
 * The single premium price a checkout session is created against.
 *
 * A price id (price_...), not a product id (prod_...): a product can carry
 * several prices and Checkout bills against one of them. There is exactly one
 * plan today, which is why this is config rather than a request field - see the
 * note on emptyBodySchema in validation/subscription.validation.js before
 * changing that.
 *
 * @returns {string}
 * @throws {Error} when unset or not a price_ id
 */
export const getStripePriceId = () =>
  requirePrefixed(
    "STRIPE_PRICE_ID",
    PRICE_ID_PREFIX,
    "Create a recurring price in the dashboard under Product catalogue.",
  );

export const getCheckoutSuccessUrl = () =>
  process.env.STRIPE_SUCCESS_URL || DEFAULT_SUCCESS_URL;

export const getCheckoutCancelUrl = () =>
  process.env.STRIPE_CANCEL_URL || DEFAULT_CANCEL_URL;

/**
 * The shared Stripe client, built on first use.
 *
 * One instance per process rather than one per request: the SDK holds a keep-
 * alive HTTP agent, and constructing a client per call throws that away and
 * opens a fresh TLS connection to Stripe every time.
 *
 * @type {Stripe | null}
 */
let client = null;

/** @returns {Stripe} */
export const getStripe = () => {
  if (!client) {
    client = new Stripe(getStripeSecretKey(), { apiVersion: STRIPE_API_VERSION });
  }

  return client;
};

/**
 * Fails fast at boot if Stripe is misconfigured.
 *
 * Called from index.js AFTER ./config/env.js has run, exactly as
 * assertAuthConfig is. Without it the app starts happily and the failure lands
 * on whichever user first tries to subscribe - or worse, on a webhook, where a
 * rejected delivery is retried for days against a server that will never accept
 * it.
 *
 * @returns {void}
 */
export const assertStripeConfig = () => {
  getStripeSecretKey();
  getStripeWebhookSecret();
  getStripePriceId();
};