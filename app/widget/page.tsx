"use client";

import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Marked, type Tokens } from "marked";

/* ──────────────────────────────────────────────────────────────────────────
   Types
────────────────────────────────────────────────────────────────────────── */
type Msg = { role: "user" | "assistant"; content: string };
type EFState = {
    initiated: boolean;
    step: "intro" | "goals" | "fit" | "tour" | "updates" | "end" | string;
    fit_score: number;
    industry?: string;
    goals?: string[];
};

/* ──────────────────────────────────────────────────────────────────────────
   Versioned storage keys + localStorage wrapper
   - bump STORAGE_VERSION (e.g., "v4") to wipe stale client state globally
────────────────────────────────────────────────────────────────────────── */
const STORAGE_VERSION = "v5";
const LS_MSGS = `ef_msgs_${STORAGE_VERSION}`;
const LS_STATE = `ef_state_${STORAGE_VERSION}`;

const STO = {
    get<T = unknown>(k: string): T | null {
        try {
            const raw = localStorage.getItem(k);
            return raw ? (JSON.parse(raw) as T) : null;
        } catch {
            return null;
        }
    },
    set(k: string, v: unknown) {
        try {
            localStorage.setItem(k, JSON.stringify(v));
        } catch { }
    },
    del(k: string) {
        try {
            localStorage.removeItem(k);
        } catch { }
    },
};

/* ──────────────────────────────────────────────────────────────────────────
   Markdown + sanitize
────────────────────────────────────────────────────────────────────────── */
const md = new Marked({ gfm: true, breaks: true, async: false });
md.use({
    renderer: {
        heading(this: unknown, token: Tokens.Heading): string | false {
            return `<h${token.depth}>${token.text}</h${token.depth}>`;
        },
    },
});
function renderContent(text: string): { __html: string } {
    const compacted = (text || "").replace(/\r/g, "").replace(/\n{2,}/g, "\n");
    const html = md.parse(compacted) as string;
    return { __html: DOMPurify.sanitize(html) };
}

/* ──────────────────────────────────────────────────────────────────────────
   UX helpers
────────────────────────────────────────────────────────────────────────── */
function placeholderFor(step: EFState["step"], busy: boolean) {
    if (busy) return "Working…";
    if (step === "intro") return "Quick one: which industry are you in?";
    if (step === "goals") return "Top 1–2 goals or challenges?";
    return "Ask a question… or pick a button below.";
}

/* ──────────────────────────────────────────────────────────────────────────
   Main widget
────────────────────────────────────────────────────────────────────────── */
function Widget() {
    const [messages, setMessages] = useState<Msg[]>([]);
    const [state, setState] = useState<EFState>({ initiated: false, step: "intro", fit_score: 0 });
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);

    const scroller = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const didInitRef = useRef(false);
    const sendingRef = useRef(false);

    /* Restore once, then boot the assistant if nothing to restore */
    useEffect(() => {
        if (didInitRef.current) return;

        let restored = false;
        const savedMsgs = STO.get<Msg[]>(LS_MSGS);
        const savedState = STO.get<Partial<EFState>>(LS_STATE);

        if (Array.isArray(savedMsgs) && savedMsgs.length) {
            setMessages(savedMsgs);
            restored = true;
        }
        if (savedState && typeof savedState === "object") {
            setState((prev) => ({ ...prev, ...savedState }));
        }

        didInitRef.current = true;
        if (!restored) {
            void callApi([]); // first assistant turn (intro)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Persist to localStorage whenever messages or state change */
    useEffect(() => {
        STO.set(LS_MSGS, messages);
    }, [messages]);
    useEffect(() => {
        STO.set(LS_STATE, state);
    }, [state]);

    /* Focus + scroll behavior */
    useEffect(() => {
        inputRef.current?.focus();
    }, []);
    useEffect(() => {
        scroller.current?.scrollTo(0, scroller.current?.scrollHeight ?? 0);
    }, [messages]);

    /* Utilities to append messages */
    function appendUserMessage(text: string): Msg[] {
        const msg: Msg = { role: "user", content: text };
        let nextRef: Msg[] = [];
        setMessages((prev) => (nextRef = [...prev, msg]));
        return nextRef;
    }
    function appendAssistantMessage(text: string): Msg[] {
        let nextRef: Msg[] = [];
        setMessages((prev) => {
            const trimmed = (text || "").trim();
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.content === trimmed) {
                nextRef = prev; // de-dupe identical assistant message
                return prev;
            }
            nextRef = [...prev, { role: "assistant", content: trimmed }];
            return nextRef;
        });
        return nextRef;
    }

    /* Server call */
    // replace your current callApi with this
    async function callApi(nextMessages: Msg[], event?: string) {
        setBusy(true);
        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
                body: JSON.stringify({
                    messages: nextMessages,
                    state,
                    event, // ← NEW
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
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { text: string; state: Partial<EFState> };
            appendAssistantMessage(data.text);
            if (data?.state) {
                setState((prev) => ({
                    ...prev,
                    ...data.state,
                    initiated: data.state.initiated ?? prev.initiated ?? true,
                }));
            }
        } catch (err) {
            console.error("Send failed:", err);
        } finally {
            setBusy(false);
        }
    }

    /* Send + CTA helpers (double-click guard via sendingRef) */
    async function send() {
        if (!input.trim() || busy || sendingRef.current) return;
        sendingRef.current = true;
        const userText = input.trim();
        const next = appendUserMessage(userText);
        setInput("");

        // decide what just happened on the client
        const event =
            state.step === "intro" ? "answered_industry" :
                state.step === "goals" ? "answered_goals" :
                    "free_text";

        await callApi(next, event);
        sendingRef.current = false;
    }

    async function chooseApply() {
        if (busy || sendingRef.current) return;
        sendingRef.current = true;
        const next = appendUserMessage("I want to apply as a Founding Member.");
        await callApi(next, "cta_apply");   // ← NEW
        sendingRef.current = false;
    }
    async function chooseTour() {
        if (busy || sendingRef.current) return;
        sendingRef.current = true;
        const next = appendUserMessage("Give me the tour.");
        await callApi(next, "cta_tour");    // ← NEW
        sendingRef.current = false;
    }
    async function chooseUpdates() {
        if (busy || sendingRef.current) return;
        sendingRef.current = true;
        const next = appendUserMessage("I only want occasional updates by email.");
        await callApi(next, "cta_updates"); // ← NEW
        sendingRef.current = false;
    }


    const showFitCtas = state?.step === "fit" || (state?.fit_score ?? 0) >= 0.7;
    const showTourCtas = state?.step === "tour";
    const showUpdatesCtas = state?.step === "updates";

    return (
        <div className="ef-widget">
            <div
                ref={scroller}
                className="ef-thread"
                style={{
                    overflowY: "auto",
                    maxHeight: 540,
                    padding: "28px 36px",
                    lineHeight: 1.7,
                    background: "#fff",
                }}
            >
                {messages.map((m, i) => (
                    <div key={i} className={`ef-msg ${m.role}`} style={msgWrap(m.role)}>
                        <div style={nameStyle(m.role)}>{m.role === "user" ? "You" : "ExecFrontline"}</div>
                        {m.role === "user" ? (
                            <div style={pill}>{m.content}</div>
                        ) : (
                            <div style={assistantBody} dangerouslySetInnerHTML={renderContent(m.content)} />
                        )}
                    </div>
                ))}
            </div>

            <div className="ef-actions" style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={placeholderFor(state?.step, busy)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void send();
                    }}
                    disabled={busy}
                    style={{
                        flex: 1,
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1px solid #d0d7de",
                        boxSizing: "border-box",
                        minHeight: 44,
                    }}
                />
                <button
                    onClick={() => void send()}
                    disabled={busy}
                    style={{ ...btn, padding: "10px 16px", minHeight: 44, boxSizing: "border-box" }}
                >
                    Send
                </button>
            </div>

            {(showFitCtas || showTourCtas || showUpdatesCtas) && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => void chooseApply()} disabled={busy} style={btn} aria-label="Apply as a Founding Member">
                        ✈️ Apply
                    </button>
                    <button onClick={() => void chooseTour()} disabled={busy} style={btnSecondary} aria-label="Take the 2-minute tour">
                        🧭 Take tour
                    </button>
                    <button onClick={() => void chooseUpdates()} disabled={busy} style={btnTertiary} aria-label="Receive occasional updates only">
                        📧 Updates only
                    </button>
                </div>
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Styles
────────────────────────────────────────────────────────────────────────── */
const msgWrap = (role: string): React.CSSProperties => ({
    margin: "18px 0",
    padding: "16px 20px",
    borderRadius: 12,
    background: role === "user" ? "#eef5ff" : "#f7f8fa",
    boxShadow: role === "assistant" ? "0 1px 3px rgba(0,0,0,0.05)" : "0 1px 2px rgba(0,0,0,0.04)",
    transition: "all 0.2s ease",
    fontFamily: "Montserrat, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#222",
    lineHeight: 1.7,
    letterSpacing: "0.1px",
});
const nameStyle = (role: string): React.CSSProperties => ({
    fontWeight: 600,
    fontSize: "0.9rem",
    color: role === "user" ? "#0047ab" : "#111827",
    marginBottom: 8,
});
const pill: React.CSSProperties = {
    display: "inline-block",
    padding: "8px 12px",
    borderRadius: 999,
    background: "#dfeaff",
    border: "1px solid #bcd2ff",
    fontSize: "0.95rem",
    lineHeight: "1.4",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
};
const assistantBody: React.CSSProperties = {
    fontSize: "0.95rem",
    wordBreak: "break-word",
    whiteSpace: "normal",
    lineHeight: 1.6,
};
const btn: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid #0047ab",
    background: "#0047ab",
    color: "#fff",
    cursor: "pointer",
    boxSizing: "border-box",
};
const btnSecondary: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid #0047ab",
    background: "#fff",
    color: "#0047ab",
    cursor: "pointer",
    boxSizing: "border-box",
};
const btnTertiary: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid #bbb",
    background: "#fff",
    color: "#333",
    cursor: "pointer",
    boxSizing: "border-box",
};

/* ──────────────────────────────────────────────────────────────────────────
   Exported page
────────────────────────────────────────────────────────────────────────── */
export default function Page() {
    return (
        <main style={{ maxWidth: 760, margin: "40px auto", padding: "0 20px" }}>
            <Widget />
        </main>
    );
}
