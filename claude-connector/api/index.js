// Vercel entry point (Node.js runtime, web-standard fetch handler). vercel.json sends every
// path here and the original path is kept in request.url; src/handler.js does the routing.
import { handle } from "../src/handler.js";

export default {
  fetch(request) {
    return handle(request, process.env);
  },
};
