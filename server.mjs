// Render host: runs the Pit Boss agent + Telegram bot as one web service.
// A tiny HTTP server satisfies Render's port requirement and doubles as an
// uptime-ping target so the free instance does not spin down.
import http from "node:http";
import { spawn } from "node:child_process";

const PORT = process.env.PORT || 3000;
const procs = {};

function run(name, cwd, args) {
  const child = spawn("./node_modules/.bin/tsx", args, { cwd, env: process.env, stdio: "inherit" });
  procs[name] = { up: true, since: Date.now() };
  child.on("exit", (code) => {
    procs[name] = { up: false, code };
    console.log(`[host] ${name} exited (${code}); restarting in 3s`);
    setTimeout(() => run(name, cwd, args), 3000);
  });
  child.on("error", (err) => console.log(`[host] ${name} error: ${err.message}`));
}

run("agent", "agent", ["src/index.ts"]);
run("bot", "bot", ["src/bot.ts"]);

http
  .createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "the-pit-keeper", procs }));
  })
  .listen(PORT, () => console.log(`[host] keepalive http on :${PORT}`));
