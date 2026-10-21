import { handleHit } from "./hit";
import { handleLead, type Env as LeadEnv } from "./lead";
import { handleDashboard, type Env as DashEnv } from "./dashboard";
import { handleScheduled, type NotifyEnv } from "./notify";

type Env = DashEnv & NotifyEnv & LeadEnv;

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/dashboard") return handleDashboard(req, env, Date.now());
    if (req.method !== "POST" || (url.pathname !== "/hit" && url.pathname !== "/lead")) return new Response("not found", { status: 404 });
    try {
      const country = (req as Request & { cf?: { country?: string } }).cf?.country ?? "";
      if (url.pathname === "/lead") return await handleLead(req, env, country, Date.now());
      return await handleHit(req, env, country, Date.now(), ctx);
    } catch {
      return new Response(null, { status: 500 });
    }
  },
  // cron "0 */6 * * *" (wrangler.toml): riepilogo numeri su #metrics
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleScheduled(env, event.scheduledTime));
  },
};
