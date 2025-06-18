// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Minimal ERC-20 interface with:
 * - burn() to destroy tokens from caller's balance
 * - transfer() for reward distribution
 * - balanceOf() to check contract holdings
 */
interface IERC20Burnable {
    function burn(uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * 🔥 FixedBurner – Community Incentive via Burn
 * 
 * In the Virtuals tokenomics:
 * - 42.5% of total supply (4.25 million tokens) is reserved for burning
 * - We want **100 unique wallets** to each trigger a burn
 * - Each wallet burns 420,750 tokens from the contract
 * - And receives 4,250 tokens as a reward
 *
 * Think of this like a micro-airdrop that requires on-chain interaction
 * with a reward for participation.
 */
contract FixedBurner {
    address public owner;                    // Contract deployer and token initializer
    IERC20Burnable public token;             // The token to be burned & rewarded

    // Constants (assuming token has 18 decimals)
    uint256 public constant BURN_AMOUNT    = 420_750 * 1e18; // Amount burned per wallet
    uint256 public constant REWARD_AMOUNT  =   4_250 * 1e18; // Incentive for burner
    uint256 public constant TOTAL_REQUIRED = BURN_AMOUNT + REWARD_AMOUNT; // 425,000

    mapping(address => bool) public hasBurned; // Tracks if a wallet has already burned

    event Burned(address indexed caller, uint256 burned, uint256 rewarded);
    event TokenSet(address tokenAddress);
    event OwnershipRenounced();

    constructor() {
        owner = msg.sender;
    }

    /**
     * Sets the token to be used in the burn process.
     * This can only be done once, by the contract owner.
     */
    function setToken(address _token) external {
        require(msg.sender == owner, "Not owner");
        require(address(token) == address(0), "Token already set");
        require(_token != address(0), "Invalid token address");
        token = IERC20Burnable(_token);
        emit TokenSet(_token);
    }

    /**
     * After setup, ownership can be renounced to decentralize control.
     */
    function renounceOwnership() external {
        require(msg.sender == owner, "Not owner");
        owner = address(0);
        emit OwnershipRenounced();
    }

    /**
     * 🔥 burnFixedAmount()
     *
     * Allows one-time participation in the burn-a-drop event.
     * - Each wallet can call this only once
     * - Contract must hold at least 425,000 tokens
     * - Burns 420,750 tokens from contract balance
     * - Sends 4,250 tokens to caller as a reward
     */
    function burnFixedAmount() external {
        require(address(token) != address(0), "Token not set");
        require(!hasBurned[msg.sender], "Already participated");

        uint256 balance = token.balanceOf(address(this));
        require(balance >= TOTAL_REQUIRED, "Not enough tokens in contract");

        hasBurned[msg.sender] = true;

        require(token.transfer(msg.sender, REWARD_AMOUNT), "Reward failed");
        token.burn(BURN_AMOUNT);

        emit Burned(msg.sender, BURN_AMOUNT, REWARD_AMOUNT);
    }

    /**
     * Public helper to check how many tokens remain in the contract.
     */
    function getTokenBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}