import type { Metadata } from "next";
import { ClientProviders } from "./client-providers";

export const metadata: Metadata = {
  title: "$CLAWD Token Gate",
  description: "Verify your $CLAWD holdings to join the holders chat",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "#0a0a0a",
          color: "#e0e0e0",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          minHeight: "100vh",
        }}
      >
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
