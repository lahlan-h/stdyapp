import { ConvexReactClient } from "convex/react";

/**
 * Builds the Convex client, tolerating a trailing slash on the URL.
 *
 * The client appends its own path to this base, so a trailing slash produces a
 * DOUBLE slash - `https://host//api/1.29.0/sync` - which the server answers with
 * a 404 rather than an upgrade. The visible symptom is the websocket retry loop:
 *
 *   WebSocket closed with code 1006: Received bad response code from server: 404
 *
 * Nothing in that message points at the URL, and a browser address bar adds the
 * slash for you when you copy from the Convex dashboard, so this is worth
 * absorbing here rather than leaving for each person to rediscover.
 */
export const createConvexClient = (url: string) =>
  new ConvexReactClient(url.trim().replace(/\/+$/, ""));
