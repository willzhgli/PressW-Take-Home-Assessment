import { useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

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

type MessagePart = { type: "text"; text: string } | WebSearchPart;

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

export function App() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: `${API_URL}/api/chat` }),
  });

  const busy = status === "submitted" || status === "streaming";

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setInput("");
  }

  return (
    <div className="app">
      <header className="header">
        <h1>PantryPal</h1>
        <p>the friend who actually cooks</p>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">What are you trying to make tonight?</div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg msg--${m.role}`}>
            {(m.parts as MessagePart[]).map((part, i) => {
              if (part.type === "text") return <span key={i}>{part.text}</span>;
              if (part.type === "tool-webSearch")
                return <WebSearch key={i} part={part} />;
              return null;
            })}
          </div>
        ))}

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
