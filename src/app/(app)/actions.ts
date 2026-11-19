"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Feedback = z.object({
  messageId: z.uuid(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  reason: z.string().trim().max(500).optional(),
});

// RLS allows feedback only on the caller's own assistant messages.
export async function submitFeedback(input: z.input<typeof Feedback>): Promise<{ ok: boolean }> {
  const parsed = Feedback.safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false };
  const { error } = await supabase.from("feedback").upsert(
    {
      message_id: parsed.data.messageId,
      user_id: claims.claims.sub,
      rating: parsed.data.rating,
      reason: parsed.data.reason || null,
    },
    { onConflict: "message_id,user_id" },
  );
  return { ok: !error };
}
