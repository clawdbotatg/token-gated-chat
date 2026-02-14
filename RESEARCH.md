# Token-Gated Telegram Chat Solutions Research

*Research Date: February 13, 2026*

## Executive Summary

This document provides comprehensive research on token-gated Telegram chat solutions for Austin's OpenClaw agent bouncer bot. The goal is to implement a system that automatically kicks users who haven't proven ownership of specific tokens through cryptographic signature verification.

## 1. Existing Solutions Analysis

### 1.1 Collab.Land

**How it works:**
- **Token Gating**: Initial verification to confirm prospective members possess required tokens
- **Balance Checks**: Routine verification to ensure members continue to meet requirements
- **Privacy-First**: Wallet addresses aren't shared with community admins without explicit consent
- **Multi-Chain Support**: 40+ L1/L2 networks, supports both fungible tokens and NFTs
- **Wallet Compatibility**: 30+ wallets plus WalletConnect

**Strengths:**
- Mature platform with 4+ years of operation
- Tens of thousands of communities using it
- Robust privacy protections
- Comprehensive chain support
- Regular balance re-verification
- Admin portal for easy management

**Weaknesses:**
- Centralized service dependency
- Limited customization for specific use cases
- Subscription model for advanced features (Pro Mini Apps)
- May not integrate easily with custom OpenClaw agents

### 1.2 Guild.xyz

**How it works:**
- **Token-Based Access Control**: Based on token holdings and on-chain activity
- **Multi-Platform Integration**: Discord, Telegram, Twitter, GitHub support
- **Flexible Requirements**: Combines multiple verification methods
- **Analytics**: Community insights across platforms
- **Quest System**: Growth campaigns and member engagement tools

**Strengths:**
- 100+ integrations available
- Scales from 100 to 1M+ members
- LEGO-like building blocks approach
- Combines community building with quest mechanisms
- Comprehensive analytics
- Support for both token-gating and growth strategies

**Weaknesses:**
- More complex than simple token verification
- May be overkill for basic bouncer functionality
- Requires learning their platform-specific configuration

### 1.3 Comparison Summary

Both solutions are powerful but represent centralized platforms with their own UX patterns. For a custom OpenClaw agent implementation, we need more direct control over the verification flow and integration with our agent ecosystem.

## 2. Recommended Architecture for Custom Solution

### 2.1 Core Components

#### A. Signature Verification Website

**Standard: EIP-4361 (Sign-In with Ethereum)**

EIP-4361 provides a standardized message format for wallet-based authentication:

```
example.com wants you to sign in with your Ethereum account:
0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2

I accept the ExampleOrg Terms of Service: https://example.com/tos

URI: https://example.com/login
Version: 1
Chain ID: 1
Nonce: 32891756
Issued At: 2021-09-30T16:25:24Z
Resources:
- ipfs://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/
- https://example.com/my-web2-claim.json
```

**Key Security Features:**
- Standard message format prevents confusion
- Domain verification prevents phishing
- Nonce prevents replay attacks
- Expiration time limits session validity
- Chain ID prevents cross-chain attacks

**Implementation Requirements:**
- Generate compliant SIWE messages
- Verify signatures using ERC-191 (EOAs) or ERC-1271 (smart contracts)
- Domain verification to prevent phishing
- Proper nonce management for replay protection

#### B. Telegram User ID Linking

**Database Schema:**
```sql
CREATE TABLE verified_users (
    telegram_user_id BIGINT PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL,
    signature VARCHAR(132) NOT NULL,
    message_hash VARCHAR(66) NOT NULL,
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    token_requirements JSON,
    last_balance_check TIMESTAMP
);

CREATE INDEX idx_wallet_address ON verified_users(wallet_address);
CREATE INDEX idx_expires_at ON verified_users(expires_at);
```

**Linking Process:**
1. User visits verification website via unique link containing Telegram user ID
2. User connects wallet and signs SIWE message
3. System verifies signature and checks token balances
4. Database records the association between Telegram ID and verified wallet
5. System generates access token/proof for user

#### C. Token Balance Verification

**On-Chain Querying Strategy:**
- **Primary**: Direct RPC calls to Ethereum/L2 nodes
- **Fallback**: Multiple RPC providers (Alchemy, Infura, QuickNode)
- **Caching**: Balance results with appropriate TTL (5-15 minutes)
- **Batch Processing**: Group multiple balance checks to reduce RPC calls

**Smart Contract Interfaces:**
```solidity
// ERC-20 Token Balance
function balanceOf(address account) external view returns (uint256);

// ERC-721 Token Balance
function balanceOf(address owner) external view returns (uint256);

// ERC-1155 Token Balance  
function balanceOf(address account, uint256 id) external view returns (uint256);
```

**Multi-Chain Considerations:**
- Support for major L1s (Ethereum, Polygon, Arbitrum, Optimism, Base)
- Chain-specific RPC endpoints
- Handle different token standards per chain
- Cross-chain balance aggregation if needed

#### D. Telegram Bot API Integration

**Key Bot Methods:**
```javascript
// Kick user from chat
await bot.banChatMember(chatId, userId, {
    until_date: Math.floor(Date.now() / 1000) + 60, // Unban after 60s
    revoke_messages: false
});

// Get chat member info
const member = await bot.getChatMember(chatId, userId);

// Listen for new members
bot.on('new_chat_members', async (ctx) => {
    const newMembers = ctx.message.new_chat_members;
    for (const member of newMembers) {
        await verifyUserTokens(member.id, ctx.chat.id);
    }
});

// Check member status
bot.on('chat_member', async (ctx) => {
    // Handle member status changes
});
```

**Required Bot Permissions:**
- `can_restrict_members`: Required to kick/ban users
- `can_delete_messages`: Optional, to clean up verification messages
- Monitor `chat_member` updates to detect new joins

### 2.2 OpenClaw Agent Integration

**Agent Architecture:**
```typescript
class TokenGatedTelegramAgent {
    constructor(
        private telegramBot: TelegramBot,
        private verificationService: VerificationService,
        private tokenChecker: TokenChecker,
        private database: Database
    ) {}

    async handleNewMember(chatId: string, userId: number) {
        // Check if user is already verified
        const verification = await this.database.getVerification(userId);
        
        if (!verification || this.isExpired(verification)) {
            await this.startVerificationProcess(chatId, userId);
            return;
        }

        // Check current token balance
        const hasTokens = await this.tokenChecker.checkBalance(
            verification.wallet_address,
            verification.token_requirements
        );

        if (!hasTokens) {
            await this.kickUser(chatId, userId, "Insufficient token balance");
            await this.database.removeVerification(userId);
        }
    }

    async startVerificationProcess(chatId: string, userId: number) {
        const verificationUrl = this.generateVerificationUrl(userId);
        
        await this.telegramBot.sendMessage(
            userId, // Send DM to user
            `Welcome! Please verify your token ownership: ${verificationUrl}\n\n` +
            `You have 10 minutes to complete verification or you'll be removed from the chat.`
        );

        // Set timeout to kick if not verified
        setTimeout(async () => {
            const verification = await this.database.getVerification(userId);
            if (!verification) {
                await this.kickUser(chatId, userId, "Verification timeout");
            }
        }, 10 * 60 * 1000); // 10 minutes
    }
}
```

## 3. Alternative Approaches

### 3.1 Telegram Mini-Apps (Inline Wallet Verification)

**Concept:**
Instead of external website verification, use Telegram Mini-Apps for in-chat wallet connection.

**Implementation:**
```javascript
// Mini-App within Telegram
const webapp = window.Telegram.WebApp;

async function connectWallet() {
    // Use WalletConnect or injected wallet within Telegram
    const provider = await detectEthereumProvider();
    const accounts = await provider.request({ 
        method: 'eth_requestAccounts' 
    });
    
    // Sign message within Mini-App
    const message = generateSIWEMessage(accounts[0]);
    const signature = await provider.request({
        method: 'personal_sign',
        params: [message, accounts[0]]
    });
    
    // Send verification to bot via WebApp.sendData()
    webapp.sendData(JSON.stringify({
        address: accounts[0],
        signature: signature,
        message: message
    }));
}
```

**Pros:**
- Seamless in-app experience
- No external website needed
- Better user retention

**Cons:**
- Limited wallet support in Mini-Apps
- Newer, less tested technology
- Requires Mini-App development expertise
- Mobile wallet connection challenges

### 3.2 Farcaster Integration

**Concept:**
Leverage Farcaster's social graph and verified addresses for cross-platform verification.

**Implementation:**
```typescript
async function verifyFarcasterUser(fid: number): Promise<VerificationResult> {
    // Query Farcaster Hub for user's verified addresses
    const addresses = await farcasterHub.getVerifiedAddresses(fid);
    
    // Check token balances for all verified addresses
    for (const address of addresses) {
        const hasTokens = await checkTokenBalance(address);
        if (hasTokens) {
            return { verified: true, address };
        }
    }
    
    return { verified: false };
}

// Link Telegram username to Farcaster profile
async function linkTelegramToFarcaster(telegramId: number, farcasterHandle: string) {
    // Verify ownership of Farcaster account
    // Could use cast verification or other social proof
}
```

**Pros:**
- Leverages existing social verification
- Cross-platform identity
- Growing ecosystem

**Cons:**
- Requires users to have Farcaster accounts
- Additional complexity
- Less direct control over verification

### 3.3 ENS-Based Verification

**Concept:**
Use ENS reverse resolution to link social identities to wallet addresses.

**Implementation:**
```typescript
async function verifyENSUser(ensName: string): Promise<VerificationResult> {
    // Resolve ENS name to address
    const address = await provider.resolveName(ensName);
    if (!address) return { verified: false };
    
    // Check reverse resolution
    const reverseEns = await provider.lookupAddress(address);
    if (reverseEns !== ensName) return { verified: false };
    
    // Check token balance
    const hasTokens = await checkTokenBalance(address);
    return { verified: hasTokens, address };
}

// Text record verification for social links
async function getENSSocialLinks(ensName: string) {
    const resolver = await provider.getResolver(ensName);
    const telegramHandle = await resolver.getText('com.telegram');
    const twitterHandle = await resolver.getText('com.twitter');
    return { telegram: telegramHandle, twitter: twitterHandle };
}
```

**Pros:**
- Decentralized identity system
- Rich metadata in text records
- Growing adoption

**Cons:**
- Requires users to own ENS names
- Not all token holders use ENS
- Additional cost for users

## 4. ERC-8004 Agent Identity Integration

### 4.1 ERC-8004 Overview

ERC-8004 "Trustless Agents" provides a framework for:
- **Agent Discovery**: On-chain identity registry using ERC-721
- **Reputation Management**: Feedback and validation systems  
- **Trust Models**: Reputation, validation, and TEE attestation

### 4.2 Potential Integration Points

**Agent Registration:**
```typescript
// Register the bouncer agent on-chain
const agentRegistry = new AgentIdentityRegistry(contractAddress);
const agentId = await agentRegistry.register(
    "ipfs://QmAgentMetadata...", // Points to agent capabilities
    [
        { metadataKey: "service", metadataValue: "telegram-bouncer" },
        { metadataKey: "chains", metadataValue: "ethereum,polygon,arbitrum" }
    ]
);
```

**Agent Registration File:**
```json
{
    "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    "name": "OpenClaw Telegram Bouncer",
    "description": "Token-gated Telegram chat bouncer agent",
    "services": [
        {
            "name": "telegram-bot",
            "endpoint": "https://t.me/YourBouncerBot"
        },
        {
            "name": "verification",
            "endpoint": "https://verify.yourdomain.com"
        },
        {
            "name": "A2A",
            "endpoint": "https://agent.yourdomain.com/.well-known/agent-card.json"
        }
    ],
    "supportedTrust": [
        "reputation",
        "crypto-economic"
    ]
}
```

**Reputation Integration:**
```typescript
// Users can provide feedback on bouncer performance
await reputationRegistry.giveFeedback(
    agentId,
    95, // 95/100 rating
    0,  // 0 decimals
    "accuracy", // tag1
    "speed",    // tag2
    "https://t.me/YourBouncerBot",
    "ipfs://QmFeedbackDetails...",
    ethers.utils.keccak256("feedback content")
);
```

**Benefits:**
- Transparent agent performance metrics
- Cross-platform agent discovery
- Reputation-based trust for chat communities
- Standardized agent identity

**Implementation Considerations:**
- Deploy agent registry on appropriate L2 (low gas costs)
- Regular reputation monitoring and response to feedback
- Integration with OpenClaw agent mesh architecture

## 5. Security Considerations

### 5.1 Replay Attack Prevention

**Nonce Management:**
```typescript
class NonceManager {
    private usedNonces = new Set<string>();
    
    generateNonce(): string {
        return crypto.randomBytes(8).toString('hex');
    }
    
    validateNonce(nonce: string): boolean {
        if (this.usedNonces.has(nonce)) return false;
        this.usedNonces.add(nonce);
        return true;
    }
    
    // Cleanup old nonces periodically
    cleanupExpiredNonces() {
        // Implementation depends on nonce structure
    }
}
```

**Message Expiration:**
- Include `issued_at` and `expiration_time` in SIWE messages
- Reject expired signatures
- Short expiration windows (5-10 minutes)

### 5.2 Session Management

**Session Token Structure:**
```typescript
interface VerificationSession {
    telegramUserId: number;
    walletAddress: string;
    signature: string;
    messageHash: string;
    issuedAt: Date;
    expiresAt: Date;
    tokenRequirements: TokenRequirement[];
    chatPermissions: string[];
}
```

**Security Best Practices:**
- Encrypt sensitive data in database
- Regular session cleanup
- Rate limiting on verification attempts
- Monitoring for suspicious patterns

### 5.3 Bot Security

**Webhook Security:**
```typescript
// Verify webhook authenticity
function verifyTelegramWebhook(body: string, signature: string, token: string): boolean {
    const hash = crypto
        .createHmac('sha256', token)
        .update(body)
        .digest('hex');
    
    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(hash)
    );
}
```

**Access Control:**
- Secure bot token storage
- Environment-based configuration
- Proper error handling to prevent information disclosure
- Rate limiting on bot commands

## 6. Implementation Plan

### Phase 1: MVP Development (2-3 weeks)
1. **Core Verification System**
   - SIWE message generation and verification
   - Basic token balance checking (ERC-20/721)
   - Simple database schema

2. **Telegram Bot Integration** 
   - Basic bot setup with required permissions
   - New member detection and verification flow
   - Kick functionality with grace period

3. **Web Verification Interface**
   - Simple wallet connection (MetaMask, WalletConnect)
   - Message signing interface
   - Success/failure feedback

### Phase 2: Enhanced Features (2-3 weeks)
1. **Multi-Chain Support**
   - Polygon, Arbitrum, Optimism integration
   - Chain-specific token requirements
   - Cross-chain balance aggregation

2. **Advanced Token Logic**
   - ERC-1155 support
   - Complex requirements (multiple tokens, minimum amounts)
   - Dynamic balance checking intervals

3. **Admin Interface**
   - Chat configuration management
   - Token requirement updates
   - Verification status monitoring

### Phase 3: Production Features (2-3 weeks)
1. **Performance Optimization**
   - RPC request caching
   - Database optimization
   - Rate limiting and queue management

2. **Monitoring & Analytics**
   - Verification success rates
   - Performance metrics
   - Error tracking and alerting

3. **ERC-8004 Integration**
   - Agent registration
   - Reputation system integration
   - Cross-agent communication

### Phase 4: Alternative Approaches (Optional)
1. **Telegram Mini-App**
   - In-chat wallet verification
   - Enhanced user experience
   - Mobile optimization

2. **Farcaster Integration**
   - Social verification option
   - Cross-platform identity

## 7. Cost Analysis

### Infrastructure Costs (Monthly)
- **RPC Calls**: $50-200 (depending on volume and provider)
- **Database Hosting**: $25-100 (managed PostgreSQL)
- **Web Hosting**: $20-50 (verification website)
- **Bot Hosting**: $10-30 (simple compute instance)

### Development Effort
- **MVP**: 40-60 hours
- **Full Featured**: 100-150 hours
- **Alternative Approaches**: 30-50 hours each

### Scaling Considerations
- Balance check frequency vs. cost tradeoffs
- Multiple RPC providers for redundancy
- Database sharding for large user bases
- CDN for verification website

## 8. Conclusion

The recommended approach combines:
1. **EIP-4361 standard** for secure wallet verification
2. **Direct Telegram Bot API** integration for maximum control
3. **Multi-chain token balance** verification
4. **ERC-8004 agent identity** for reputation and discovery
5. **OpenClaw agent architecture** for seamless ecosystem integration

This provides a robust, scalable solution that maintains decentralization principles while offering the flexibility Austin requires. The phased implementation approach allows for iterative development and testing while delivering value quickly.

The alternative approaches (Mini-Apps, Farcaster, ENS) can be added later as additional verification methods rather than replacements, providing users with multiple convenient options for proving token ownership.