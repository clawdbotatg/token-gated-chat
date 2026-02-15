"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

function VerifyInner() {
  const searchParams = useSearchParams();
  const tg = searchParams.get("tg");
  const chat = searchParams.get("chat");

  const { address, isConnected, connector } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [status, setStatus] = useState<"idle" | "signing" | "verifying" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  // Try to redirect user to their wallet app (for WalletConnect in in-app browsers)
  async function redirectToWallet() {
    try {
      const provider: any = await connector?.getProvider();
      // WalletConnect v2: session has peer metadata with redirect URLs
      const session = provider?.session;
      const redirect = session?.peer?.metadata?.redirect;
      const walletUrl = redirect?.native || redirect?.universal;
      if (walletUrl) {
        window.location.href = walletUrl;
        return;
      }
    } catch {}
    // Fallback: try common deep links based on connector name
    const name = connector?.name?.toLowerCase() || "";
    if (name.includes("rainbow")) window.location.href = "rainbow://";
    else if (name.includes("metamask")) window.location.href = "metamask://";
    else if (name.includes("coinbase")) window.location.href = "cbwallet://";
    // If we can't determine the wallet, do nothing — WC push notification should alert them
  }

  const missingParams = !tg || !chat;

  async function verify() {
    if (!address || !tg || !chat) return;

    try {
      setStatus("signing");
      setMessage("Getting nonce...");

      // Get nonce
      const nonceRes = await fetch(`/api/nonce?tg=${tg}&chat=${chat}`);
      const { nonce } = await nonceRes.json();

      // Build SIWE message
      const domain = window.location.host;
      const origin = window.location.origin;
      const siweMessage = [
        `${domain} wants you to sign in with your Ethereum account:`,
        address,
        "",
        `Verify CLAWD token ownership for Telegram user ${tg}`,
        "",
        `URI: ${origin}`,
        `Version: 1`,
        `Chain ID: 8453`,
        `Nonce: ${nonce}`,
        `Issued At: ${new Date().toISOString()}`,
      ].join("\n");

      setMessage("Opening wallet to sign...");

      // Fire the sign request — don't await yet, redirect to wallet first
      const signPromise = signMessageAsync({ account: address, message: siweMessage });

      // Give WalletConnect a moment to send the request, then redirect to wallet app
      setTimeout(() => redirectToWallet(), 500);

      const signature = await signPromise;

      setStatus("verifying");
      setMessage("Verifying on-chain balance...");

      // Verify
      const verifyRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: siweMessage, signature }),
      });

      const result = await verifyRes.json();

      if (result.success) {
        setStatus("success");
        setMessage("✅ Verified! Check your Telegram DMs from @ClawdBouncerBot — your invite link is there! 🦞");
      } else {
        setStatus("error");
        setMessage(result.error || "Verification failed");
      }
    } catch (err: any) {
      setStatus("error");
      setMessage(err?.shortMessage || err?.message || "Something went wrong");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🦞</div>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem", color: "#ff6b6b" }}>$CLAWD Token Gate</h1>
        <p style={{ color: "#888", marginBottom: "2rem", fontSize: "0.9rem" }}>
          Connect your wallet and verify you hold at least 10M $CLAWD on Base to join the chat
        </p>

        {missingParams ? (
          <div style={errorStyle}>Missing verification parameters. Use the link from the Telegram bot.</div>
        ) : (
          <>
            <div style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "center" }}>
              <ConnectButton />
            </div>

            {isConnected && status !== "success" && (
              <button
                onClick={verify}
                disabled={status === "signing" || status === "verifying"}
                style={{
                  display: "inline-block",
                  padding: "14px 32px",
                  background: status === "signing" || status === "verifying" ? "#444" : "#ff6b6b",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "1rem",
                  fontWeight: 600,
                  cursor: status === "signing" || status === "verifying" ? "not-allowed" : "pointer",
                  width: "100%",
                }}
              >
                {status === "signing" || status === "verifying" ? "Verifying..." : "🔐 Verify $CLAWD Holdings"}
              </button>
            )}

            {message && (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1rem",
                  borderRadius: "12px",
                  fontSize: "0.9rem",
                  ...(status === "error"
                    ? errorStyle
                    : status === "success"
                      ? successStyle
                      : infoStyle),
                }}
              >
                {message}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const errorStyle = { background: "#2d1515", color: "#ff6b6b", border: "1px solid #ff6b6b33" };
const successStyle = { background: "#152d15", color: "#6bff6b", border: "1px solid #6bff6b33" };
const infoStyle = { background: "#15152d", color: "#6b6bff", border: "1px solid #6b6bff33" };

export default function VerifyPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ fontSize: "4rem" }}>🦞</div></div>}>
      <VerifyInner />
    </Suspense>
  );
}
