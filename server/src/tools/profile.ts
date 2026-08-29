import { tool } from "ai";
import { z } from "zod";
import { PROFILE_CATEGORIES, addFact, removeFact } from "../profile";

/**
 * Profile write tools. The model calls these to remember durable facts about the
 * user; reads happen via the profile block injected into the system prompt, not
 * a tool.
 *
 * Bound to a userId per request (see createProfileTools) — the caller only wires
 * these in when there is a user id to write against.
 */

const categorySchema = z.enum(PROFILE_CATEGORIES);
const valueSchema = z.string().trim().min(1).max(120);

export function createProfileTools(userId: string) {
  return {
    updateProfile: tool({
      description:
        "Record durable facts the user states about themselves so you still know them next time: kitchen equipment they own, dietary preferences (\"vegetarian\", \"no pork\"), cuisines they love or avoid, and food allergies. Call this whenever the user mentions such a fact — you don't need to ask permission. Do NOT record one-off context (\"tonight I want something quick\"), guesses, or medical conditions.",
      inputSchema: z.object({
        category: categorySchema.describe(
          "equipment | diet_preference | cuisine_like | cuisine_dislike | allergy",
        ),
        values: z
          .array(valueSchema)
          .min(1)
          .max(20)
          .describe(
            'One or more values, lowercase and singular where natural, e.g. ["air fryer", "cast iron skillet"].',
          ),
      }),
      execute: async ({ category, values }) => {
        const added: string[] = [];
        const alreadyKnown: string[] = [];
        for (const value of values) {
          (addFact(userId, category, value) ? added : alreadyKnown).push(value);
        }
        return { category, added, alreadyKnown };
      },
    }),

    removeProfileFact: tool({
      description:
        'Remove a previously recorded profile fact when the user corrects or retracts it ("I gave away my air fryer", "actually I eat fish now").',
      inputSchema: z.object({
        category: categorySchema,
        value: valueSchema,
      }),
      execute: async ({ category, value }) => ({
        removed: removeFact(userId, category, value),
      }),
    }),
  };
}
