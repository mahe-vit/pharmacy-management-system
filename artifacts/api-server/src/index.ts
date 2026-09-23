import app from "./app";
import { logger } from "./lib/logger";
import { ensureSeeded } from "./seed";

const rawPort = process.env.PORT ?? "4000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  try {
    await ensureSeeded();
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  } catch (error) {
    logger.error({ error }, "Unable to start API server");
    process.exit(1);
  }
}

void start();