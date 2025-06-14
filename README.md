# Web3 Wallet Safety Kit

Your proactive wallet health and security AI co-pilot. We continuously monitor your assets, detect hidden risks, and provide intelligent alerts to keep you safe and in control.

This repository contains the backend services for the Web3 Wallet Safety Kit. It's a Node.js application built with Express and MongoDB, designed to be a robust, scalable, and extensible platform for Web3 security analysis.

## ✨ Features

- **Multi-Chain Support**: Easily configurable to monitor wallets across multiple EVM-compatible chains (Ethereum, Polygon, Base, etc.).
- **Sign-In with Ethereum (SIWE)**: Secure, passwordless authentication using only a crypto wallet.
- **Guest Scan**: Instant, no-signup-required wallet analysis to provide immediate value.
- **Deep Contract Analysis**: Scans both verified source code (for risky keywords) and unverified bytecode (for malicious function signatures).
- **Approval Monitoring**: Detects excessive or unlimited token (`ERC20`) and NFT (`ERC721`/`ERC1155`) approvals.
- **LP & Stake Tracking**: Identifies potentially forgotten liquidity pool or staking positions.
- **Dynamic Risk Scoring**: Generates a clear, actionable risk score based on a variety of factors.
- **Intelligent Notifications**: Uses a stateful system to alert users via Telegram only about new, high-risk events.
- **AI-Powered Summaries**: Leverages Google's Gemini AI to provide easy-to-understand summaries of complex contract risks.
- **Robust Job Queue System**: Manages analysis tasks asynchronously for high throughput and reliability.

## 🛠️ Getting Started

Follow these instructions to get a local copy up and running for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [MongoDB](https://www.mongodb.com/try/download/community) instance (local or cloud-based)
- [Git](https://git-scm.com/)

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/txMaestro/web3safetykit.git
    cd web3safetykit
    ```

2.  **Install NPM packages:**
    ```sh
    npm install
    ```

3.  **Set up environment variables:**
    -   Copy the example environment file:
        ```sh
        cp .env.example .env
        ```
    -   Open the `.env` file and fill in the required values (your MongoDB URI, API keys, JWT secret, etc.).

### Running the Application

-   **For development (with hot-reloading):**
    ```sh
    npm run dev
    ```

-   **For production:**
    ```sh
    npm start
    ```

The API server will start on the port specified in your `.env` file (default is `3001`).

## 🚀 API Usage

We've included a Postman collection to make testing the API easy.

1.  Open Postman.
2.  Click **Import** > **Raw text**.
3.  Paste the entire content of the `postman_collection.json` file from this repository.
4.  Configure the collection variables (like `base_url` and `wallet_address`) in Postman.

For a detailed guide on the authentication flow and available endpoints, please refer to the Postman collection.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.