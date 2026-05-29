// Supabase Edge Function: notify-nearby-hazard
// Triggered by a Database Webhook on INSERT into public.hazards.
// Sends an Expo Push notification to every user with a recent shared location
// within 2 miles, who has notifications_enabled = true.
//
// Deploy:  supabase functions deploy notify-nearby-hazard
// Webhook: Supabase Dashboard → Database → Webhooks → Create a new webhook
//          Table: hazards · Event: INSERT
//          URL:   https://<project-ref>.functions.supabase.co/notify-nearby-hazard
//          Headers: Authorization: Bearer <service role key>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const TWO_MILES_METERS = 3218;

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const hazard = payload?.record;
    if (!hazard?.lat || !hazard?.lng || hazard?.type !== "police") {
      return new Response("ignored", { status: 200 });
    }

    const { data: nearby, error } = await supabase.rpc("users_within_radius", {
      p_lat: hazard.lat,
      p_lng: hazard.lng,
      p_radius_meters: TWO_MILES_METERS,
      p_exclude_user: hazard.reporter_id,
    });
    if (error) {
      console.error("rpc error", error);
      return new Response(error.message, { status: 500 });
    }
    if (!nearby?.length) return new Response("no users nearby", { status: 200 });

    const messages = nearby
      .filter((u: any) => u.push_token)
      .map((u: any) => ({
        to: u.push_token,
        sound: "default",
        title: "Police nearby",
        body: "Heads up — a rider reported police within 2 miles.",
        data: { type: "police", lat: hazard.lat, lng: hazard.lng, hazard_id: hazard.id },
      }));

    if (!messages.length) return new Response("no tokens", { status: 200 });

    // Expo Push API: batch up to 100 per request
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) console.error("expo push failed", await res.text());
    }

    return new Response(`sent ${messages.length}`, { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response((e as Error).message, { status: 500 });
  }
});
