"use client";

import { RainbowKitProvider, connectorsForWallets, darkTheme, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { phantomWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import "@rainbow-me/rainbowkit/styles.css";

const projectId = "3a8170812b534d0ff9d794f19a901d64"; // Public WalletConnect project ID (SE2 default)

const { wallets } = getDefaultWallets();

const connectors = connectorsForWallets(
  [
    ...wallets,
    {
      groupName: "More",
      wallets: [phantomWallet],
    },
  ],
  { appName: "$CLAWD Token Gate", projectId },
);

const config = createConfig({
  connectors,
  chains: [base],
  transports: { [base.id]: http() },
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#ff6b6b",
            accentColorForeground: "white",
            borderRadius: "medium",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
