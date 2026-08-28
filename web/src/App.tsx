import { useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

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
            {m.parts.map((part, i) =>
              part.type === "text" ? <span key={i}>{part.text}</span> : null,
            )}
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
