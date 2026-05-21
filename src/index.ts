import { readEnv } from "./config/env.js";
import { buildServer } from "./server.js";

const env = readEnv();
const app = await buildServer(env);

await app.listen({ port: env.PORT, host: "0.0.0.0" });
