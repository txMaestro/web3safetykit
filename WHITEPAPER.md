
# Web3 Safety Kit Whitepaper

## 1. Introduction

### 1.1 Purpose

The Web3 Safety Kit is an automated, real-time security analytics platform designed to proactively
protect crypto users' digital assets. Its primary mission is to continuously monitor user wallets and deliver
intelligent, actionable alerts regarding risky contract interactions, dangerous token approvals, and other
potential security threats.

### 1.2 Problem Statement

As the Web3 ecosystem expands, so does the sophistication of threats targeting users. Common risks
include:

- **Malicious Contracts:** Smart contracts with hidden attack vectors (e.g., delegatecall, selfdestruct), especially those without verified source code.
- **Unlimited Token Approvals:** Users unknowingly authorize dApps to spend unlimited amounts of their tokens via approve calls.
- **Rug Pulls:** Developers drain liquidity pools suddenly, stealing users' funds.
- **Forgotten Assets:** Liquidity left in pools, staked tokens, or NFTs that users forget to reclaim can lead to passive loss and unnecessary exposure.
- **Alert Fatigue:** Traditional tools often fail to highlight what truly matters. By generating irrelevant or excessive warnings, they cause users to overlook important risks and forget real, long-term exposures.

### 1.3 Our Solution

The Web3 Safety Kit counters these problems through a multi-layered, intelligent system:

- **Continuous Wallet Monitoring:** Automated scanning of wallet activity with immediate analysis of new transactions.
- **Stake Tracking:** The system monitors only the protocols where the user has staked assets and alerts if they remain idle or forgotten.
- **Liquidity Pool Tracking:** Only liquidity pools where the user has contributed are monitored, and forgotten or idle liquidity is flagged.
- **Portfolio Tracking (Planned):** Aggregates all on-chain positions to help users avoid passive losses due to forgotten assets.
- **Deep Contract Analysis:** Verification of both verified and unverified contracts using keyword detection and bytecode fingerprinting.
- **Approve Monitoring:** Alerts users when excessive or unnecessary token/NFT approvals (including Permit and Permit2) are granted.
- **Contract Interaction Intelligence:** Highlights unusual or risky contract interactions using AI-based behavioral auditing.
- **Risk Scoring Engine:** Assigns a dynamic risk score based on wallet behavior and interactions.
- **Community Intelligence Layer:** Aggregates user-reported data into a decentralized address intelligence feed to flag known threats.
- **Stateful Alerting:** Only sends alerts when a new, high-risk state is detected—reducing noise and alert fatigue.
- **Modular Architecture:** Easily extendable to support new chains and new threat analysis modules.

## 2. System Architecture

The system is built with a modular, event-driven design powered by Node.js and MongoDB.

### 2.1 Core Components

- **API Server (Express.js):** Provides RESTful endpoints for wallet management, user control, and report retrieval. Secured via JWT authentication.
- **Database (MongoDB):** Stores all user and wallet data using Mongoose ODM. Key models include:
  - **User:** User credentials and Telegram integration.
  - **Wallet:** Tracked wallet data, chain info, transactionCache, and lastAnalysisState.
  - **Job:** Analysis task model powering the job queue.
  - **Report:** Stores detailed analysis output.
  - **ApiRequest:** Manages rate-limited external API calls.
- **Job Queue System:**
  - **JobService:** Manages creation and retrieval of analysis tasks.
  - **workerRunner:** Polls JobService and runs analysis functions per taskType, enabling isolated, parallel processing for each analysis type.
- **Centralized API Request Queue:**
  - **RequestQueueService:** Queues all external API requests (Etherscan, Polygonscan, etc.) to a database.
  - **RequestProcessor.worker:** Processes queued requests, adheres to rate limits, and retries failures.
- **Incremental Data Fetching:**
  - **TransactionFetcher.worker:** Initiates analysis using transactionCache.lastBlock to pull only new transactions since last scan, optimizing performance.

## 3. Core Features

### 3.1 Multi-Chain Support

The platform supports multiple EVM-compatible chains via providerConfig.js. Each chain is configurable with its own API endpoints, keys, and rate limits. Currently supported chains:

- Ethereum
- Polygon
- Arbitrum
- Base
- zkSync

## 4. Technical Details

**Key Technologies:**

- Backend: Node.js
- Web Framework: Express.js
- Database: MongoDB (via Mongoose ODM)
- Blockchain SDK: Ethers.js
- Auth: JSON Web Token (JWT)
- Scheduling: node-cron
- Notifications: Telegram via Telegraf

**Performance Optimizations:**

- Async Workers: Analysis runs on background workers to prevent API blocking.
- Rate Limiting: RequestQueueService ensures fair use of external APIs.
- Incremental Fetching: Only processes changed data.
- Transaction Caching: Reduces repetitive API calls via transactionCache.

## 5. Development Roadmap

### Phase 1 – Live (TG Bot - Core Features)

- Stake monitoring
- Liquidity additions
- Risky approvals (ERC20, NFTs, Permit/Permit2)
- Contract interaction analysis & AI auditing
- Risk scoring
- Community-backed wallet intelligence network

### Phase 2 – Post Pro Token Sale (Quick Expansion)

- ⏳ Portfolio tracker finalization
- ⏳ Rug pull alerts
- ⏳ Token price tracking & liquidity source analysis
- ⏳ Airdrop monitoring
- ⏳ Contract blacklist system
- ⏳ False positive appeal system (Web)
- ⏳ Major exploit tracking
- ⏳ Email & push notification integrations

### Phase 3 – Long-Term

- B2B API services
- Full-scale AI audit and threat detection training
- Proactive Chrome extension:
  - Live JS & contract scanning on dApps
  - Pre-signing transaction alerts
  - Community-powered report/monetization system