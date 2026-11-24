// Local test server: node dev-server.js  (then open http://localhost:8787)
import http from "node:http";
import { handle } from "./src/handler.js";
import { nodeHandler } from "./src/node-adapter.js";

const port = +(process.env.PORT || 8787);
http.createServer(nodeHandler(handle, process.env)).listen(port, () => console.log(`Happy Home connector on http://localhost:${port}`));
