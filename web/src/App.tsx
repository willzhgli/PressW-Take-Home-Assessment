import { useMemo, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useUserId } from "./useUserId";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type WebSearchOutput =
  | { error: string }
  | {
      answer?: string;
      results: Array<{ title: string; url: string; snippet: string }>;
    };

type WebSearchPart = {
  type: "tool-webSearch";
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  input?: { query?: string };
  output?: WebSearchOutput;
  errorText?: string;
};

type FeasibilityPart = {
  type: "tool-checkFeasibility";
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  output?: {
    dish: string;
    have: string[];
    missing: string[];
    assumedMinimalKit?: boolean;
  };
};

type AllergenWarningPart = {
  type: "data-allergenWarning";
  data: { hits: Array<{ allergy: string; terms: string[] }> };
};

type DisclaimerPart = {
  type: "data-disclaimer";
  data: { text: string };
};

type MessagePart =
  | { type: "text"; text: string }
  | WebSearchPart
  | FeasibilityPart
  | AllergenWarningPart
  | DisclaimerPart;

function WebSearch({ part }: { part: WebSearchPart }) {
  const query = part.input?.query;

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="tool-pill">
        <span className="tool-pill__dot" />
        searching the web{query ? <>: <em>{query}</em></> : null}
      </div>
    );
  }

  const out = part.output;
  if (part.state === "output-error" || !out || "error" in out) {
    return <div className="tool-note">couldn’t reach the web just now</div>;
  }
  if (out.results.length === 0) return null;

  return (
    <details className="sources">
      <summary>Sources ({out.results.length})</summary>
      <ul>
        {out.results.map((r, i) => (
          <li key={i}>
            <a href={r.url} target="_blank" rel="noreferrer">
              {r.title}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Feasibility({ part }: { part: FeasibilityPart }) {
  if (part.state !== "output-available" || !part.output) return null;
  const { missing, assumedMinimalKit } = part.output;
  if (missing.length === 0) return null;

  return (
    <div className="tool-note tool-note--adapted">
      adapted for your kit — no {missing.join(", ")}
      {assumedMinimalKit ? " (assuming a basic kitchen)" : ""}
    </div>
  );
}

function AllergenWarning({ part }: { part: AllergenWarningPart }) {
  const summary = part.data.hits
    .map((h) => `${h.allergy} (${h.terms.join(", ")})`)
    .join("; ");
  return (
    <div className="allergen-warning">
      <strong>Heads up:</strong> this reply mentions something you've flagged an
      allergy to — {summary}. Check ingredients carefully before you cook.
    </div>
  );
}

export function App() {
  const [userId, resetUserId] = useUserId();
  const [input, setInput] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_URL}/api/chat`,
        headers: { "x-user-id": userId },
      }),
    [userId],
  );

  const { messages, sendMessage, status } = useChat({ id: userId, transport });

  const busy = status === "submitted" || status === "streaming";

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setInput("");
  }

  async function forgetMe() {
    if (busy) return;
    if (!window.confirm("Forget everything PantryPal remembers about you?")) {
      return;
    }
    try {
      await fetch(`${API_URL}/api/profile`, {
        method: "DELETE",
        headers: { "x-user-id": userId },
      });
    } catch {
      /* best effort — a new id starts fresh regardless */
    }
    resetUserId(); // new id -> new chat (id prop) + new transport
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>PantryPal</h1>
          <p>the friend who actually cooks</p>
        </div>
        <button
          type="button"
          className="forget"
          onClick={forgetMe}
          disabled={busy}
        >
          Forget me
        </button>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">What are you trying to make tonight?</div>
        )}

        {messages.map((m) => {
          const parts = m.parts as MessagePart[];
          const warning = parts.find(
            (p): p is AllergenWarningPart => p.type === "data-allergenWarning",
          );
          return (
            <div key={m.id} className={`msg msg--${m.role}`}>
              {warning && <AllergenWarning part={warning} />}
              {parts.map((part, i) => {
                if (part.type === "text")
                  return <span key={i}>{part.text}</span>;
                if (part.type === "tool-webSearch")
                  return <WebSearch key={i} part={part} />;
                if (part.type === "tool-checkFeasibility")
                  return <Feasibility key={i} part={part} />;
                if (part.type === "data-disclaimer")
                  return (
                    <div key={i} className="disclaimer">
                      {part.data.text}
                    </div>
                  );
                return null; // data-allergenWarning rendered above
              })}
            </div>
          );
        })}

        {status === "submitted" && (
          <div className="msg msg--assistant msg--pending">thinking…</div>
        )}
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. I have chicken thighs, rice, and not much else"
          aria-label="Message PantryPal"
        />
        <button type="submit" disabled={busy}>
          Send
        </button>
      </form>
    </div>
  );
}
