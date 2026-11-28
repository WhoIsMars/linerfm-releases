import { handleHit } from "./hit";
import { handleLead, type Env as LeadEnv } from "./lead";
import { handleDashboard } from "./dashboard";
import { handleDashOnline, type Env as DashEnv } from "./dash-online";
import { handleScheduled, type NotifyEnv } from "./notify";

type Env = DashEnv & NotifyEnv & LeadEnv;

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
      // la pagina nuova (dash-online.ts); le vecchie schede a /dashboard?tab=..., il link ?k= e il "Togli" restano lì
      const res = await handleDashOnline(req, env, Date.now());
      if (res) return res;
      if (req.method === "GET" || req.method === "POST") return handleDashboard(req, env, Date.now());
    }
    if (req.method !== "POST" || (url.pathname !== "/hit" && url.pathname !== "/lead")) return new Response("not found", { status: 404 });
    try {
      const country = (req as Request & { cf?: { country?: string } }).cf?.country ?? "";
      if (url.pathname === "/lead") return await handleLead(req, env, country, Date.now(), ctx);
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
