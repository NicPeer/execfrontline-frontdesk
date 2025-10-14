
# ExecFrontline Responses Widget — v2

This is a tiny **Vercel-ready** Next.js app that:
- exposes `/api/chat` using the **OpenAI Responses API** (with fallback to Chat Completions), and
- hosts a minimal **widget** at `/widget` with Markdown rendering, safe links, and CTA buttons.

## Quickstart

### 1) Local dev
```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
# open http://localhost:3000/widget
```

### 2) Required env vars
Set in `.env.local` and later in Vercel → Project Settings → Environment Variables:
- `OPENAI_API_KEY` (required)
- `APP_NAME` (default: ExecFrontline)
- `LINK_TOUR`, `LINK_APPLY`, `LINK_CALENDLY`, `LINK_WEBSITE`, `LINK_NEWSLETTER`
- `FIT_COPY_PERFECT` (optional copy string)

### 3) Deploy to Vercel
- Push/import the repo to Vercel.
- Add the environment variables.
- Deploy → visit `https://YOUR-APP.vercel.app/widget`

### 4) Embed in Circle.so
Per post:
```html
<iframe
  src="https://YOUR-APP.vercel.app/widget"
  width="100%"
  height="640"
  style="border:0;border-radius:8px;overflow:hidden"
  allow="clipboard-read; clipboard-write">
</iframe>
<p>If you’re on the mobile app, <a href="https://YOUR-APP.vercel.app/widget" target="_blank">open the assistant here</a>.</p>
```

Site-wide bubble (Settings → Custom Code → before </body>):
```html
<script>
(function(){
  const b=document.createElement('div');
  Object.assign(b.style,{position:'fixed',right:'20px',bottom:'20px',width:'56px',height:'56px',borderRadius:'50%',background:'#0047ab',color:'#fff',display:'grid',placeItems:'center',cursor:'pointer',zIndex:9999});
  b.textContent='💬'; document.body.appendChild(b);
  const m=document.createElement('div'); Object.assign(m.style,{position:'fixed',inset:'0',display:'none',background:'rgba(0,0,0,.35)',zIndex:9998});
  m.innerHTML = '<div style="position:absolute;right:24px;bottom:88px;width:420px;max-width:95vw;height:70vh;background:#fff;border-radius:12px;overflow:hidden"><iframe src="https://YOUR-APP.vercel.app/widget" width="100%" height="100%" style="border:0"></iframe></div>';
  document.body.appendChild(m);
  b.onclick=()=>m.style.display='block';
  m.onclick=(e)=>{ if(e.target===m) m.style.display='none'; };
})();
</script>
```

## State model & branching logic

The assistant outputs a **JSON state header** in every message:
```
<state>{"step":"intro|goals|fit|tour|apply|updates","fit_score":0..1,"role":"","industry":"","goals":[],"next":""}</state>
```
The server (`/api/chat`) parses and returns it as `state`. The widget uses it to show CTAs.

**Type (for reference):**
```ts
type Step = "intro" | "goals" | "fit" | "tour" | "apply" | "updates";
type AssistantState = {
  step: Step;
  fit_score: number;
  role?: string;
  industry?: string;
  goals?: string[];
  next?: Step | "" ;
};
```

**Branching (UI):**
- Show the three CTA buttons when `state.step === "fit"` or `fit_score >= 0.7`.
- Keep showing them on `tour`/`updates` so users can pivot.
- Each button sends a clear message string the prompt understands (e.g., "I want to apply as a Founding Member.").

## Files
- `app/api/chat/route.ts` — server route with variable-injected SYSTEM prompt.
- `app/widget/page.tsx` — chat UI with Markdown rendering, safe links, and CTA buttons.
- `app/globals.css` — list spacing and link styling.
- `app/page.tsx` — small index page with link to `/widget`.

MIT License.
