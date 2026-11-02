import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./site/", import.meta.url));
const port = Number(process.env.STOOP_PORT || 8741);
const host = "127.0.0.1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const gone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>gone</title>
<link rel="stylesheet" href="/stoop.css">
</head>
<body>
<main>
<h1>Nothing on that shelf</h1>
<p><a href="/">Back inside</a></p>
</main>
</body>
</html>
`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${host}:${port}`);
  if (url.pathname === "/pantry") {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("the pantry is out\n");
    return;
  }
  if (url.pathname === "/bell") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("ding\n");
    return;
  }

  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    sendGone(res);
    return;
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const rel = pathname.replace(/^\/+/, "");
  const file = join(root, rel);
  const under = file === root || file.startsWith(root.endsWith(sep) ? root : root + sep);
  if (!under) {
    sendGone(res);
    return;
  }

  try {
    const body = await readFile(file);
    const type = types[extname(file)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch {
    sendGone(res);
  }
});

server.listen(port, host, () => {
  process.stdout.write(`stoop on http://${host}:${port}\n`);
});

function sendGone(res) {
  res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  res.end(gone);
}
