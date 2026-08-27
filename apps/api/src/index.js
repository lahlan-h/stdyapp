import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import routes from "./routes/index.js";

// runs both .env files from "api" and "core".
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [
    path.resolve(here, "../.env"),
    path.resolve(here, "../../../packages/core/.env"),
  ],
});

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/api", routes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`stdyapp api listening on port ${PORT}`);
});