
export default function Home() {
  return (
    <main style={{ display:"grid", placeItems:"center", minHeight:"100vh", fontFamily:"system-ui" }}>
      <div style={{ maxWidth:640, padding:24 }}>
        <h1>ExecFrontline Onboarding Assistant</h1>
        <p>Open the <a href="/widget">/widget</a> page to test the embedded assistant.</p>
      </div>
    </main>
  );
}
