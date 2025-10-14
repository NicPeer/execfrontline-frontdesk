
"use client";

import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";

type Msg = { role: "user" | "assistant"; content: string };

marked.setOptions({
    gfm: true,
    breaks: true,
    async: false,
});

marked.use({
  renderer: {
    heading(text, level) {
      return `<h${level}>${text}</h${level}>`;
    },
  },
});

export default function Widget() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [state, setState] = useState<any>({ step: "intro", fit_score: 0 });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0) {
      (async () => {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [] }),
            cache: "no-store",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setMessages([{ role: "assistant", content: data.text }]);
          setState(data.state);
        } catch (err) {
          console.error("Init call failed:", err);
        }
      })();
    }
  }, [messages.length]);

  function renderContent(text: string) {
    const html = marked.parse(text);
    return { __html: DOMPurify.sanitize(html) };
  }

  async function callApi(nextMessages: Msg[]) {
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          vars: {
            APP_NAME: "ExecFrontline",
            LINKS: {
              tour: "https://typebot.co/execfrontline-validation",
              apply: "https://typebot.co/execfrontline-validation",
              calendly: "https://calendly.com/nic-execfrontline/1-1-introduction-to-execfrontline",
              newsletter: "https://www.execfrontline.com/execfrontline-newsletter/",
              website: "https://execfrontline.com",
            },
            COPY: {
              fit_yes: "Perfect — that’s exactly the kind of profile ExecFrontline was built for. You’ll fit right in.",
            },
          },
        }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.text }]);
      setState(data.state);
      scroller.current?.scrollTo(0, scroller.current.scrollHeight);
    } catch (err) {
      console.error("Send failed:", err);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!input.trim() || busy) return;
    const next = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
    await callApi(next);
  }

  async function chooseApply() {
    if (busy) return;
    const choice = "I want to apply as a Founding Member.";
    const next = [...messages, { role: "user", content: choice }];
    setMessages(next);
    await callApi(next);
  }
  async function chooseTour() {
    if (busy) return;
    const choice = "I want to take the 2-minute tour first.";
    const next = [...messages, { role: "user", content: choice }];
    setMessages(next);
    await callApi(next);
  }
  async function chooseUpdates() {
    if (busy) return;
    const choice = "I only want occasional updates by email.";
    const next = [...messages, { role: "user", content: choice }];
    setMessages(next);
    await callApi(next);
  }

  const showFitCtas = state?.step === "fit" || (state?.fit_score ?? 0) >= 0.7;
  const showTourCtas = state?.step === "tour";
  const showUpdatesCtas = state?.step === "updates";

  return (
    <div style={{ fontFamily: "system-ui", height: "100vh", display: "flex", flexDirection: "column" }}>
      <div ref={scroller} style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ margin: "8px 0" }}>
            <strong>{m.role === "user" ? "You" : "ExecFrontline"}</strong>
            <div className="message-content" style={{ marginTop: 4 }} dangerouslySetInnerHTML={renderContent(m.content)} />
          </div>
        ))}

        {(showFitCtas || showTourCtas || showUpdatesCtas) && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={chooseApply} disabled={busy} style={btn} aria-label="Apply as a Founding Member">✈️ Apply</button>
            <button onClick={chooseTour} disabled={busy} style={btnSecondary} aria-label="Take the 2-minute tour">🧭 Take tour</button>
            <button onClick={chooseUpdates} disabled={busy} style={btnTertiary} aria-label="Receive occasional updates only">📧 Updates only</button>
          </div>
        )}

        <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
          <em>state:</em> {JSON.stringify(state)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #eee" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about ExecFrontline or AA&D challenges…"
          style={{ flex: 1, padding: 8 }}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={busy}
        />
        <button onClick={send} disabled={busy}>{busy ? "…" : "Send"}</button>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #0047ab",
  background: "#0047ab",
  color: "#fff",
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #0047ab",
  background: "#fff",
  color: "#0047ab",
  cursor: "pointer",
};
const btnTertiary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #bbb",
  background: "#fff",
  color: "#333",
  cursor: "pointer",
};
