import { createApp } from "./app.mjs";
if (
  process.env.NODE_ENV === "production" &&
  !/^https:\/\/[^/]+$/.test(process.env.APP_ORIGIN || "")
) {
  throw new Error(
    "生产环境必须设置 APP_ORIGIN=https://你的域名（不带末尾斜线）",
  );
}
const { app, db } = createApp();
const port = Number(process.env.PORT) || 3001;
const server = app.listen(port, process.env.HOST || "0.0.0.0", () =>
  console.log(`fanMade GoGo!：http://localhost:${port}`),
);
function stop() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
