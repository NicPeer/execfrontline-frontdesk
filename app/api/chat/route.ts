import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ——— Types
type Msg = { role: "user" | "assistant"; content: string };
type Vars = {
    APP_NAME?: string;
    LINKS?: { tour?: string; apply?: string; newsletter?: string; calendly?: string; website?: string };
    COPY?: { fit_yes?: string };
};
type EFState = {
    initiated: boolean;
    step: "intro" | "goals" | "fit" | "tour" | "apply" | "updates" | string;
    fit_score: number;
    industry?: string;
    goals?: string[];
};

// ——— Helpers
const compact = (s: string) => (s || "").replace(/\r/g, "").replace(/\n{2,}/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
const stripState = (t: string) => (t || "").replace(/<state>[\s\S]*?<\/state>/gi, "").trim();
const lastUserText = (messages: Msg[]) => ([...messages].reverse().find(m => m.role === "user")?.content ?? "").trim();
function scoreFit(text: string): number {
    const s = text.toLowerCase();
    if (/(aerospace|aviation|defen[cs]e|mro|oem|tier|airline|space|uav|helicopter|airport)/.test(s)) return 0.9;
    if (/(contract|clm|deal|pipeline|supply|manufactur|digital|ai|blockchain|iot|quantum)/.test(s)) return 0.78;
    return 0.6;
}

/* ========================================================================
   === SYSTEM PROMPT (verbatim) ===========================================
========================================================================= */
const SYSTEM = `
You are the ExecFrontline onboarding assistant.
Before every visible message, prepend one hidden state header in JSON inside <state>...</state>, like:
<state>{"step":"intro|goals|fit|tour|apply|updates","fit_score":0.8}</state>
Then continue with your visible text response.
Never show the <state> header to the user — it is for internal logic only.


🎯 PURPOSE
You are the fast-moving onboarding assistant for **ExecFrontline** — the private network where aerospace, aviation & defense (AA&D) leaders connect, learn, and grow together.  
Your mission: instantly gauge fit, build trust fast, and guide visitors to the next best step — tour, invite, or updates — with precision, warmth, and executive clarity.

Tone: smart, human, fast.  
No fluff, no filler, no “AI voice.” Speak like a peer, not a promoter.

---

🧭 ROLE
You are the friendly, no-nonsense onboarding expert for ExecFrontline on Circle.so — a guide, matchmaker, and accelerator.

You can:
• Explain what ExecFrontline is and who it’s for  
• Help visitors post, connect, or join events inside Circle  
• Recommend relevant AI tools, playbooks, and briefings  
• Discuss business, contract, or tech challenges in AA&D — but always pivot back to how ExecFrontline helps

Keep each conversation under 3–5 exchanges unless deeper follow-up is clearly wanted.

---

⚡ FLOW (FASTEST PATH TO CLARITY)
1️⃣ Open quickly:
“Welcome and thank you for your interest in ExecFrontline. I’ll be your guide and support you with any questions.
State machine:
- step="intro": Ask industry. Acknowledge if AA&D or related. Do NOT present CTAs. "Before we begin — may I ask a two quick questions to tailor my answers? What industry are you in?”

→ If answer relates directly or indirectly to aerospace, aviation, defense, or other capital-intensive sectors, acknowledge fit:
“That’s a great match — ExecFrontline was built for professionals in exactly those environments.”

2️⃣ Then ask:

- step="goals": “And what are your top one or two goals or challenges right now?” Ask top 1–2 goals/challenges. Do NOT present CTAs until also goals have been filled in.
Never show CTAs before step="fit". If unclear after goals, ask ONE clarifier (“business or technical side?”) then move to fit.


Read between the lines: identify their **role**, **goals**, and **pain points** (career growth, deal flow, digitalization, CLM, etc.).
If they sound like a strong fit → go to **Fit Path**.
If unclear → ask one clarifying question max:
“Do you mainly work on the business or technical side in or for the industry?”

Keep rhythm: one short question → one tailored response → next step.

Always prepend <state>{"step": "...", "industry":"...", "goals":[...]}</state> before visible text.

---

When both industry AND goals are captured, set step="fit", when there is a strong fit, then present a concise message with the 3 CTAs as follows and from now on keep showing the CTAs under the box.

✅ FIT PATH (IF STRONG FIT)
Say with energy and confidence:  
“Perfect — that’s exactly the kind of profile ExecFrontline was built for. You’ll fit right in.”
"Ask a question here below or click one of the buttons below. You can always come back here for more."


Always at the end of a conversation ask: "What would you like to explore next? Or what questions would you like to ask?"
---

💡 IF “2. Tour” SELECTED
… (tour details) …

📩 IF “1. Apply for Founding Membership” SELECTED
… (apply details) …

📬 IF “3. Updates Only” SELECTED
… (updates details) …

---

📌 IF ASKED ABOUT…
(Features / Who it’s for / Topics / Pricing / Other)

⚠️ RULES OF ENGAGEMENT / ✈️ PERSONALITY SNAPSHOT
(unchanged)
`;

/* ========================================================================
   Deterministic server renderers (first moves & CTAs)
========================================================================= */
const introWelcome = () => compact(
    `Welcome and thank you for your interest in ExecFrontline. I’ll be your guide and support you with any questions.

Before we begin — may I ask two quick questions to tailor my answers? What industry are you in?`
);
const askGoals = () => "And what are your top one or two goals or challenges right now?";
const fitLine = (copyFitYes: string) =>
    compact(`${copyFitYes}
Ask a question here below or click one of the buttons below. You can always come back here for more.`);

function renderTour(L: Record<string, string>) { /* full tour copy */
    return compact(`**Welcome aboard this small tour — here’s what ExecFrontline unlocks for leaders like you:**

- Strategic connections with executives, engineers & innovators  
- AI-powered tools, briefings & playbooks  
- Private, no-fluff discussions & dealmaking spaces  
- Executive cohorts, peer workshops & co-creation  
- Career, business & skills growth across contracts, operations & digital transformation

**What you’ll find inside**
- Private spaces for focused collaboration  
- Live & on-demand events with practical, high-impact insights  
- Growth tools to level up career and business  
- Market-network spaces to connect with tech experts & solution providers

**Next steps**  
📝 Apply → ${L.apply}  
🧭 Tour (any time) → ${L.tour}  
📬 Updates → ${L.newsletter}  
📅 1-on-1 intro → ${L.calendly}`);
}
function renderApply(L: Record<string, string>) {
    return compact(`**Excellent — you’re cleared for take-off.**

📝 Complete this short survey (5–10 min) and you’ll receive an invitation:  
${L.apply}

You’ll:  
- Learn more about membership  
- Choose how to engage  
- Help co-shape the AA&D network

Or take the tour → ${L.tour} • Updates → ${L.newsletter}`);
}
function renderUpdates(L: Record<string, string>) {
    return compact(`**Updates only — noted.**

Subscribe to the newsletter here:  
${L.newsletter}

You’ll receive curated insights and community updates every few weeks.  
Want a quick tour meanwhile? → ${L.tour} • Book a chat → ${L.calendly}`);
}

// ——— Route handler
export async function POST(req: NextRequest) {
    const { messages = [], state: clientState = {}, event, vars = {} as Vars } = await req.json();

    const LINKS = {
        tour: vars.LINKS?.tour ?? process.env.LINK_TOUR ?? "https://typebot.co/execfrontline-validation",
        apply: vars.LINKS?.apply ?? process.env.LINK_APPLY ?? "https://typebot.co/execfrontline-validation",
        newsletter: vars.LINKS?.newsletter ?? process.env.LINK_NEWSLETTER ?? "https://www.execfrontline.com/execfrontline-newsletter/",
        calendly: vars.LINKS?.calendly ?? process.env.LINK_CALENDLY ?? "https://calendly.com/nic-execfrontline/1-1-introduction-to-execfrontline",
        website: vars.LINKS?.website ?? process.env.LINK_WEBSITE ?? "https://execfrontline.com",
    };
    const COPY = {
        fit_yes:
            vars.COPY?.fit_yes ??
            process.env.FIT_COPY_PERFECT ??
            "Perfect — that’s exactly the kind of profile ExecFrontline was built for. You’ll fit right in.",
    };

    // state from client
    let state: EFState = {
        initiated: Boolean(clientState?.initiated),
        step: (clientState?.step as EFState["step"]) ?? "intro",
        fit_score: Number.isFinite(clientState?.fit_score) ? Number(clientState.fit_score) : 0,
        industry: clientState?.industry,
        goals: Array.isArray(clientState?.goals) ? clientState.goals : [],
    };

    const lastU = lastUserText(messages);
    const lower = lastU.toLowerCase();

    // A) Event-first deterministic handling
    if (event === "cta_tour" || /\b(take\s+the\s+tour|give\s+me\s+the\s+tour|tour|walkthrough|guide|show\s+me)\b/i.test(lower)) {
        const text = renderTour(LINKS);
        const nextState: EFState = { ...state, initiated: true, step: "fit", fit_score: Math.max(state.fit_score, 0.75) };
        return NextResponse.json({ text, state: nextState });
    }
    if (event === "cta_apply" || /\b(apply|join|found(ing)?\s*member|membership)\b/i.test(lower)) {
        const text = renderApply(LINKS);
        const nextState: EFState = { ...state, initiated: true, step: "fit", fit_score: Math.max(state.fit_score, 0.75) };
        return NextResponse.json({ text, state: nextState });
    }
    if (event === "cta_updates" || /\b(update|updates|email|newsletter|subscribe)\b/i.test(lower)) {
        const text = renderUpdates(LINKS);
        const nextState: EFState = { ...state, initiated: true, step: "fit", fit_score: Math.max(state.fit_score, 0.75) };
        return NextResponse.json({ text, state: nextState });
    }

    if (event === "answered_industry") {
        const nextState: EFState = {
            ...state,
            initiated: true,
            step: "goals",
            industry: state.industry ?? lastU,
            fit_score: Math.max(state.fit_score, scoreFit(lastU)),
        };
        const text = askGoals();
        return NextResponse.json({ text, state: nextState });
    }

    if (event === "answered_goals") {
        const nextState: EFState = {
            ...state,
            initiated: true,
            step: "fit",
            goals: Array.isArray(state.goals) ? [...state.goals, lastU] : [lastU],
            fit_score: Math.max(state.fit_score || 0, scoreFit(`${state.industry ?? ""} ${lastU}`)),
        };
        const text = fitLine(COPY.fit_yes);
        return NextResponse.json({ text, state: nextState });
    }

    // B) First visit (no user yet) — show full intro
    if (!state.initiated && messages.length === 0) {
        const text = introWelcome();
        const nextState: EFState = { ...state, initiated: true, step: "intro" };
        return NextResponse.json({ text, state: nextState });
    }

    // C) Otherwise, use the model for general Q&A (keep current step)
    const force_next_step: EFState["step"] = state.step || "fit";
    const CONTROL = `
<control>
{"force_next_step":"${force_next_step}","links":${JSON.stringify(LINKS)},"copy":{"fit_yes":${JSON.stringify(COPY.fit_yes)}}}
Rules:
- You MUST set <state>{"step":"<force_next_step>", ...}</state> to the forced step.
- If "fit": answer succinctly and keep CTAs (tour/apply/updates) visible in copy.
- Keep output compact (≤2 short lines). Never reveal <control>. Never regress.
</control>
`.trim();

    const system = (SYSTEM + "\n\n" + CONTROL)
        .replaceAll("{{APP_NAME}}", vars.APP_NAME ?? process.env.APP_NAME ?? "ExecFrontline")
        .replaceAll("{{LINKS.apply}}", LINKS.apply)
        .replaceAll("{{LINKS.tour}}", LINKS.tour)
        .replaceAll("{{LINKS.calendly}}", LINKS.calendly)
        .replaceAll("{{LINKS.website}}", LINKS.website)
        .replaceAll("{{LINKS.newsletter}}", LINKS.newsletter)
        .replaceAll("{{COPY.fit_yes}}", COPY.fit_yes);

    const anyClient = client as any;
    const hasResponses = typeof anyClient?.responses?.create === "function";

    let text = "";
    try {
        if (hasResponses) {
            const resp = await anyClient.responses.create({
                model: "gpt-4.1-mini",
                input: [{ role: "system", content: system }, ...messages],
                temperature: 0.4,
            });
            text = (resp as any).output_text ?? "";
        } else {
            const resp = await client.chat.completions.create({
                model: "gpt-4.1-mini",
                messages: [{ role: "system", content: system }, ...messages],
                temperature: 0.4,
            });
            text = resp.choices?.[0]?.message?.content ?? "";
        }
    } catch (e) {
        console.error("OpenAI call failed:", e);
        const fallback =
            force_next_step === "intro"
                ? "Welcome — what industry are you in?"
                : force_next_step === "goals"
                    ? "What are your top one or two goals or challenges right now?"
                    : "What would you like to explore next?";
        const nextState: EFState = { ...state, initiated: true, step: force_next_step };
        return NextResponse.json({ text: compact(fallback), state: nextState });
    }

    // Finalize (never regress)
    let nextState: EFState = { ...state, initiated: true, step: force_next_step };
    const stateMatch = text.match(/<state>\s*({[\s\S]*?})\s*<\/state>/i)?.[1];
    if (stateMatch) {
        try {
            const parsed = JSON.parse(stateMatch);
            nextState = {
                ...nextState,
                step: (parsed.step as EFState["step"]) ?? nextState.step,
                fit_score: Number.isFinite(parsed.fit_score) ? parsed.fit_score : nextState.fit_score,
                industry: parsed.industry ?? nextState.industry,
                goals: Array.isArray(parsed.goals) ? parsed.goals : nextState.goals,
            };
        } catch { }
    }
    if (state.step !== "intro" && nextState.step === "intro") nextState.step = state.step;

    let visible = compact(stripState(text));
    if (!visible) {
        visible =
            nextState.step === "intro"
                ? "Which industry are you in?"
                : nextState.step === "goals"
                    ? "What are your top one or two goals or challenges right now?"
                    : "What would you like to explore next?";
    }

    return NextResponse.json({ text: visible, state: nextState });
}
