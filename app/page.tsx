export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <div>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🦞</div>
        <h1 style={{ fontSize: "1.5rem", color: "#ff6b6b", marginBottom: "0.5rem" }}>$CLAWD Token Gate</h1>
        <p style={{ color: "#888" }}>Message <a href="https://t.me/ClawdBouncerBot" style={{ color: "#ff6b6b" }}>@ClawdBouncerBot</a> on Telegram to get started.</p>
      </div>
    </div>
  );
}
