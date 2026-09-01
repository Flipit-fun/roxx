# Roxx

A single-page site for **rETH** on Robinhood Chain (chain ID 4663).

- Deposit ETH to mint **rETH**; its redemption value accrues as protocol yield is added to the vault.
- Withdraw rETH back to ETH at the live rate, always open.
- Vanilla HTML/CSS/JS — no build step. Wallet integration via ethers.js (CDN) with EIP-6963 multi-wallet support.

## Structure

- `index.html` — landing page + mint/withdraw panel
- `app.html` — dedicated mint/withdraw app page (+ operator "Add yield")
- `css/style.css` — styles
- `js/script.js` — camera/scroll UI + wallet/mint logic
- `js/config.js` — chain params + contract address + ABI
- `contracts/RETHVault.sol` — the accruing ETH-backed vault contract
- `contracts/RETH.sol` — earlier flat 1:1 version (reference)
- `DEPLOY.md` — contract deploy notes

## Going live

1. Deploy `contracts/RETHVault.sol` to Robinhood Chain.
2. Paste the deployed address into `RETH_ADDRESS` in `js/config.js`.

> The rate is derived from the vault's ETH balance and is variable, not guaranteed.
> The contract is unaudited — test on testnet and seek an audit and legal review
> before taking real deposits.
