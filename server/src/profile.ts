import { db } from "./db";

/**
 * User profile store — durable facts learned from conversation.
 *
 * Allergies are kept here because they're safety-critical (SCOPING: allergies are
 * stored and drive filtering; medical conditions are not stored). There is
 * deliberately no category for medical conditions, so the model has no slot to
 * persist one.
 */

export const PROFILE_CATEGORIES = [
  "equipment",
  "diet_preference",
  "cuisine_like",
  "cuisine_dislike",
  "allergy",
] as const;

export type ProfileCategory = (typeof PROFILE_CATEGORIES)[number];

export interface ProfileFact {
  category: ProfileCategory;
  value: string;
  createdAt: number;
}

const selectByUser = db.prepare(
  `SELECT category, value, created_at AS createdAt
     FROM profile_facts
    WHERE user_id = ?
    ORDER BY created_at ASC, value ASC`,
);

const insertFact = db.prepare(
  `INSERT OR IGNORE INTO profile_facts (user_id, category, value, created_at)
   VALUES (?, ?, ?, ?)`,
);

const deleteFact = db.prepare(
  `DELETE FROM profile_facts WHERE user_id = ? AND category = ? AND value = ?`,
);

const deleteByUser = db.prepare(`DELETE FROM profile_facts WHERE user_id = ?`);

/** Every fact stored for a user, oldest first. */
export function getFacts(userId: string): ProfileFact[] {
  return selectByUser.all(userId) as unknown as ProfileFact[];
}

/** Facts grouped by category. All categories are present; unused ones are []. */
export function getGroupedProfile(
  userId: string,
): Record<ProfileCategory, string[]> {
  const grouped = Object.fromEntries(
    PROFILE_CATEGORIES.map((c) => [c, [] as string[]]),
  ) as Record<ProfileCategory, string[]>;
  for (const fact of getFacts(userId)) grouped[fact.category]?.push(fact.value);
  return grouped;
}

/** Add a fact. Returns true if newly stored, false on a no-op (dupe or blank). */
export function addFact(
  userId: string,
  category: ProfileCategory,
  value: string,
): boolean {
  const v = value.trim();
  if (!v) return false;
  return Number(insertFact.run(userId, category, v, Date.now()).changes) > 0;
}

/** Remove one fact. Returns true if a row was deleted. */
export function removeFact(
  userId: string,
  category: ProfileCategory,
  value: string,
): boolean {
  return Number(deleteFact.run(userId, category, value.trim()).changes) > 0;
}

/** Delete everything stored for a user. Returns the number of rows removed. */
export function wipeUser(userId: string): number {
  return Number(deleteByUser.run(userId).changes);
}
