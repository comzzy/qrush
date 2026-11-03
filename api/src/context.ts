import type { Address, PublicClient } from "viem";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { PaymentBus } from "./events.js";
import type { FileStore } from "./services/files.js";

export type Deps = {
  config: Config;
  db: Db;
  client: PublicClient;
  bus: PaymentBus;
  fetch: typeof fetch;
  files?: FileStore;
};

export type AppEnv = {
  Variables: { deps: Deps; seller: Address };
};
