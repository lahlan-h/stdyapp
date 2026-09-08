import { ConvexReactClient } from "convex/react";

export const createConvexClient = (url: string) => new ConvexReactClient(url);
