import { tool } from "ai";
import { z } from "zod";
import { getGroupedProfile } from "../profile";

/**
 * Equipment feasibility check. The model enumerates what a dish genuinely needs;
 * this diffs that against the user's stored equipment and reports the gap. The
 * point is the forcing function — making the model list requirements before
 * committing to a recipe — plus a structured signal the UI can surface.
 *
 * Bound to a userId per request (it reads the profile), so the caller only wires
 * it in when there's a user to check against.
 *
 * Dietary preferences and allergies are NOT handled here — those already reach
 * the model through the profile block in the system prompt.
 */

// Assumed when the user has no equipment on file. Better than the old "everyone
// has the same 8 items" assumption only in that the model is told to flag it.
const MINIMAL_KIT = ["stove", "oven", "frying pan", "pot", "knife"];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function isOwned(required: string, owned: string[]): boolean {
  const r = norm(required);
  return owned.some((item) => {
    const o = norm(item);
    return o === r || o.includes(r) || r.includes(o);
  });
}

export function createFeasibilityTool(userId: string) {
  return {
    checkFeasibility: tool({
      description:
        "Before committing to a recipe suggestion, check whether the user can actually make it. List the equipment the dish genuinely requires and you'll get back what they have and what's missing. If anything is missing, adapt the recipe or pick another one — don't just tell them no. Skip this for trivial things (a sandwich, a salad, boiling pasta).",
      inputSchema: z.object({
        dish: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe('The dish you are considering, e.g. "roast chicken".'),
        requiredEquipment: z
          .array(z.string().trim().min(1).max(60))
          .min(1)
          .max(15)
          .describe(
            "Every piece of equipment this dish genuinely needs (oven, blender, stand mixer, deep pot, etc.). Be specific and complete — this is matched against what the user owns.",
          ),
      }),
      execute: async ({ dish, requiredEquipment }) => {
        const owned = getGroupedProfile(userId).equipment;
        const assumedMinimalKit = owned.length === 0;
        const against = assumedMinimalKit ? MINIMAL_KIT : owned;

        const have: string[] = [];
        const missing: string[] = [];
        for (const item of requiredEquipment) {
          (isOwned(item, against) ? have : missing).push(item);
        }

        return assumedMinimalKit
          ? { dish, have, missing, assumedMinimalKit: true }
          : { dish, have, missing };
      },
    }),
  };
}
