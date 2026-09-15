# Reticence

A single-page site for **rETH** on Robinhood Chain (chain ID 4663).

- Deposit ETH to mint **rETH**; its redemption value accrues as protocol yield is added to the vault.
- Withdraw rETH back to ETH at the live rate, always open.
- Vanilla HTML/CSS/JS — no build step. Wallet integration via ethers.js (CDN) with EIP-6963 multi-wallet support.

## Structure

- `index.html` — scroll-film landing (self-contained: scroll-scrubbed video, four panels, pixel-dithered reveal of the rETH details). Links to the app; loads `js/script.js` for the footer year and shared helpers. The hero token chip reads "To Be Announced" until the $RETICENCE token launches.
- `app.html` — dedicated mint/withdraw app page (+ operator "Add yield")
- `css/style.css` — styles for the app page (the `.sky` block at the end is the theme that matches the landing)
- `js/script.js` — wallet/mint logic (+ legacy scroll UI, inert on the current pages)
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
