// Pulse entry point — starts the HTTP server.

import { createPulseServer } from "./server";

const port = Number(process.env.PORT ?? 8080);

const server = createPulseServer();
server.listen(port, () => {
  console.log(`pulse-api listening on http://localhost:${port}`);
});
