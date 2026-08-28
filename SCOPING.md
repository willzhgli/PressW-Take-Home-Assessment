# PantryPal v1 — Scoping

**Author:** willzhgli  ·  **Assessment window:** 3 hours, self-timeboxed
**One-line product:** a conversational AI cooking assistant users talk to when deciding what to cook, that remembers them and only suggests things they can actually make.

---

## Scope committed

1. **Conversational agent, clone-and-run.** Hono + Vercel AI SDK backend, Vite/React chat UI, `docker-compose up`. All LLM calls go through the AI SDK; no model-specific SDKs.
2. **LLM-driven tool use.** The model decides when to call:
   - `web_search` — external tool (Tavily) for recipes, techniques, and current info.
   - `get_profile` / `update_profile` — read/write the user's equipment, cuisine preferences, dietary preferences, and allergies.
   - `check_feasibility` — cross-reference a candidate recipe's required equipment against what the user owns. On a gap, the model must offer a substitution or an alternative recipe, never a bare "you can't make this."
   - `save_recipe` / `list_saved_recipes` — a favourites list (asked for in every beta interview).
3. **Persistent per-user memory (SQLite).** Equipment, dietary preferences, cuisine affinities, allergies, and saved recipes, keyed on a client-generated user ID. A `forget me` command wipes the user; individual facts are viewable and removable in-conversation. No fixed assumed-equipment list — the profile starts empty and is learned.
4. **Opinionated persona.** A "friend who actually cooks" system voice that takes positions and recommends against things, within the compliance rules below. Streaming responses so first token is fast.
5. **Compliance layer, baked into the response contract (not bolted on):**
   - Allergen notice rendered as a consistent formatted footer on any response that names a specific recipe or ingredient, whether or not allergies were mentioned. A post-processing step enforces its presence when a recipe/ingredient tool ran.
   - Health conditions (diabetes, keto-for-management, pregnancy, etc.): acknowledge generically, refer to a qualified professional, do not adapt recipes to the condition or make nutritional-adequacy claims. Stated *preferences* ("I'm vegetarian") are honoured normally.
   - "Is this safe to eat" / spoilage / foodborne-illness questions: decline, redirect to food-safety authorities, then offer what the assistant *can* help with.
   - Off-topic requests get a light redirect; food-adjacent topics (wine, gear, hosting, restaurant opinions) are in scope.
6. **Two-tier model routing.** A fast/cheap model (Haiku-class) is the default; a lightweight classifier escalates multi-step, tool-heavy, or reasoning-heavy queries to a stronger model (Sonnet-class). Both via the AI SDK, swappable by config.

## Scope cut

- **Hands-free / voice mode.** Real demand (CEO + CX), but v1 is text. Transport is kept separate from the agent loop so voice is additive later, not a rewrite.
- **Grocery-list export & multi-day meal planning.** CX tagged both as v2. No planning state model in v1.
- **PDF / "learn my family cookbook" ingestion.** CX said not v1; bulk ingestion + retrieval is its own project.
- **Dedicated onboarding / settings UI.** The profile is built conversationally and inspected via chat; the frontend is explicitly throwaway per Product. No profile-editing screen.
- **COPPA / under-13 handling.** Raised as a question for legal, not a build item. v1 assumes a 13+ audience, stated in the README; no age gate.

## Contradictions resolved

- **Personality vs. legal disclaimers.** CEO wants no hedging; counsel mandates allergen notices and health deflection (non-negotiable). Resolution: disclaimers are *structural*, not conversational — the answer body stays opinionated; the allergen notice is a compact, consistent footer. Legal wins on presence, personality wins on tone.
- **Remembering health info vs. "store no health mentions."** Resolution: split allergies from medical conditions. Allergies are safety-critical → stored, and drive hard filtering (a shellfish allergy blocks shrimp suggestions permanently). Medical conditions → not stored, not adapted to; generic acknowledgement + referral. This is the preference-vs-condition line counsel herself drew.
- **Scope breadth: "don't be a narc" vs. "refuse anything not about cooking."** Resolution: adopt the wider boundary. Wine, equipment, hosting, and restaurant opinions are fair game; clearly off-topic asks (cover letters, code) get a one-line redirect. "Stay in its lane" is satisfied by redirecting, not by a narrow topic definition.
- **Latency: <2s hard cap vs. quality over speed.** Resolution: routing serves both. Target p50 < 2s for no-tool answers on the fast model; tool-using turns are allowed to take longer rather than return something worse. Streaming keeps perceived latency low regardless.

## Clarifying questions (before a production build)

1. **Allergen notice** — approved exact wording and placement (every message, or every message that includes a recipe/ingredient)? Counsel offered to workshop this.
2. **User identity** — is there real auth to key memory and deletion on, or is a client-provided ID acceptable for v1? Drives the retention/GDPR story.
3. **Launch jurisdictions** — determines how conservative the health and food-safety refusals must be.
4. **Per-conversation cost ceiling** — a concrete target to tune the router against ("can't cost a dollar" is directional).
5. **Recipe sourcing** — any preferred or disallowed sources, and licensing limits on reproducing recipe text?

## Assumptions made

- **Web search** = Tavily behind a tool interface, swappable via env var; API key documented in the README.
- **Models** = Anthropic via the AI SDK: Haiku-class fast tier, Sonnet-class escalation tier. Config-swappable.
- **Identity** = a client-generated UUID in `localStorage`; no login in v1. Memory and `forget me` are keyed on it.
- **Feasibility** tracks *what the user owns / doesn't own* (equipment, major dietary constraints), not pantry quantities.
- **Audience** = English-only, text-only, 13+. Stated in the README.
- Recipes are model-generated or summarised from search results with source links, not copied verbatim.

## Risks accepted

- **Conversational profile extraction is lossy** — it may miss or mis-record facts ("I got rid of my air fryer"). Mitigation: facts are visible on request and correctable in chat; the profile has no silent authority. Accepted because a rigid form was explicitly rejected and is wrong on day one anyway.
- **The LLM may still emit a disallowed health or food-safety claim.** Mitigation: strong system prompt plus a lightweight output check for a few high-risk patterns — not a certified guardrail. Accepted for a 3-hour v1; flagged in TRADEOFFS.
- **Allergen-footer enforcement has a gap** on free-form ingredient talk that triggers no tool call. Accepted and documented; the post-processing check covers the tool-call path.
- **Router misclassification** sends some hard queries to the cheap model (weaker answer) or simple queries to the smart model (higher cost). Mitigation: bias the classifier toward escalation on ambiguity. Accepted as tunable.
- **SQLite single-file store** doesn't scale past one instance and isn't encrypted at rest. Fine for the assessment; noted as not production-ready.
- **Prompt injection via search results.** Mitigation: search content is inserted as clearly delimited untrusted data and system rules are reasserted. Partial mitigation only.
