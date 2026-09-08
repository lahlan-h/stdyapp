#!/usr/bin/env node

// Deprecated but may be useful ...

import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import { config } from "dotenv";

config({ path: "../../.env.local" }); // adjust path to wherever .env.local actually lives relative to this script

const client = new ConvexHttpClient(process.env.CONVEX_URL);
const names = ["lahan1", "Wheenos", "Kayley22"];

for (const username of names) {
  await client.mutation(api.users.addUser, {
    username,
    displayName: username,
  });
}
