import { createApp } from "../server/app.mjs";
const { app, db } = createApp({ dataDir: process.env.TEST_DATA_DIR });
const server = app.listen(0, "127.0.0.1", () =>
  process.send({ port: server.address().port }),
);
process.on("message", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
