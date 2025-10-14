"use client";

import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Marked, type Tokens } from "marked";
import type { Msg } from "@/types/chat";

// ── Marked v15: create a configured instance (sync), and customize renderer
const md = new Marked({ gfm: true, breaks: true, async: false });
md.use({
    renderer: {
        // v15 signature: receives a token, not (text, level)
        heading(this: unknown, token: Tokens.Heading): string | false {
            return `<h${token.depth}>${token.text}</h${token.depth}>`;
        },
    },
});

// ── Helpers
function renderContent(text: string): { __html: string } {
    const html = md.parse(text) as string; // async:false narrows to string at runtime; cast for TS
    return { __html: DOMPurify.sanitize(html) };
}

export default function Widget() {
    // State
    const [messages, setMessages] = useState<Msg[]>([]);
    const [state, setState] = useState<any>({ step: "intro", fit_score: 0 });
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);

    // Refs
    const scroller = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // ── Reusable message appenders (type-safe)
    function appendUserMessage(text: string): Msg[] {
        const msg: Msg = { role: "user", content: text };
        const next: Msg[] = [...messages, msg];
        setMessages(next);
        return next;
    }

    function appendAssistantMessage(text: string): Msg[] {
        const msg: Msg = { role: "assistant", content: text };
        const next: Msg[] = [...messages, msg];
        setMessages(next);
        return next;
    }

    // ── API call
    async function callApi(nextMessages: Msg[]) {
        setBusy(true);
        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({
                    messages: nextMessages,
                    vars: {
                        APP_NAME: "ExecFrontline",
                        LINKS: {
                            tour: "https://typebot.co/execfrontline-validation",
                            apply: "https://typebot.co/execfrontline-validation",
                            calendly:
                                "https://calendly.com/nic-execfrontline/1-1-introduction-to-execfrontline",
                            newsletter:
                                "https://www.execfrontline.com/execfrontline-newsletter/",
                            website: "https://execfrontline.com",
                        },
                        COPY: {
                            fit_yes:
                                "Perfect — that’s exactly the kind of profile ExecFrontline was built for. You’ll fit right in.",
                        },
                    },
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            appendAssistantMessage(data.text);
            setState(data.state);
            scroller.current?.scrollTo(0, scroller.current.scrollHeight);
        } catch (err) {
            console.error("Send failed:", err);
        } finally {
            setBusy(false);
        }
    }

    // ── Handlers
    async function send() {
        if (!input.trim() || busy) return;
        const next = appendUserMessage(input);
        setInput("");
        await callApi(next);
    }

    async function chooseApply() {
        if (busy) return;
        const next = appendUserMessage("I want to apply as a Founding Member.");
        await callApi(next);
    }

    async function chooseTour() {
        if (busy) return;
        const next = appendUserMessage("Give me the tour.");
        await callApi(next);
    }

    // UX niceties
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // ── Render
    return (
        <div className="ef-widget">
            <div
                ref={scroller}
                className="ef-thread"
                style={{ overflowY: "auto", maxHeight: 540, padding: 12 }}
            >
                {messages.map((m, i) => (
                    <div
                        key={i}
                        className={`ef-msg ${m.role}`}
                        style={{
                            margin: "8px 0",
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: m.role === "user" ? "#eef5ff" : "#f6f7f9",
                        }}
                        dangerouslySetInnerHTML={renderContent(m.content)}
                    />
                ))}
            </div>

            <div
                className="ef-actions"
                style={{ display: "flex", gap: 8, marginTop: 10 }}
            >
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={busy ? "Working…" : "Type your question…"}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void send();
                    }}
                    disabled={busy}
                    style={{
                        flex: 1,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #d0d7de",
                    }}
                />
                <button onClick={() => void send()} disabled={busy}>
                    Send
                </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => void chooseApply()} disabled={busy}>
                    Apply (Founding Member)
                </button>
                <button onClick={() => void chooseTour()} disabled={busy}>
                    Take the Tour
                </button>
            </div>

            {/* Optional debug/state display */}
            {/* <pre style={{ marginTop: 12 }}>{JSON.stringify(state, null, 2)}</pre> */}
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
