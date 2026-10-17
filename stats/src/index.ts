import { handleHit } from "./hit";
import { handleDashboard, type Env } from "./dashboard";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/dashboard") return handleDashboard(req, env, Date.now());
    if (req.method !== "POST" || url.pathname !== "/hit") return new Response("not found", { status: 404 });
    try {
      const country = (req as Request & { cf?: { country?: string } }).cf?.country ?? "";
      return await handleHit(req, env, country, Date.now());
    } catch {
      return new Response(null, { status: 500 });
    }
  },
};
