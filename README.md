# Reticence

A single-page site for **rUSDC** on Arc, Circle's USDC-native Layer-1 (chain ID 5042).

- Swap USDC for **rUSDC** one to one; its redemption value accrues as yield from real property (rent and appreciation) is paid into the vault.
- Withdraw rUSDC back to USDC at the live rate, always open.
- On Arc, USDC is the native gas token (18 decimals at the EVM level), so deposits are plain value transfers — no approve step.
- Vanilla HTML/CSS/JS — no build step. Wallet integration via ethers.js (CDN) with EIP-6963 multi-wallet support.

## Structure

- `index.html` — scroll-film landing (self-contained: scroll-scrubbed video, four panels, pixel-dithered reveal of the rUSDC details). Links to the app; loads `js/script.js` for the footer year and shared helpers. The hero token chip reads "To Be Announced" until the $RETICENCE token launches.
- `app.html` — dedicated mint/withdraw app page (+ operator "Add yield")
- `css/style.css` — styles for the app page (the `.sky` block at the end is the theme that matches the landing)
- `js/script.js` — wallet/mint logic (+ legacy scroll UI, inert on the current pages)
- `js/config.js` — Arc chain params + vault address + ABI + display symbols
- `contracts/RUSDCVault.sol` — the accruing USDC-backed vault contract
- `DEPLOY.md` — contract deploy notes

## Going live

1. Deploy `contracts/RUSDCVault.sol` to Arc (see `DEPLOY.md`).
2. Paste the deployed address into `VAULT_ADDRESS` in `js/config.js`.
3. Put the same address into the "Contract" rows on `app.html` and `index.html` (they read "To Be Announced" until then).

> The rate is derived from the vault's USDC balance and is variable, not guaranteed.
> The contract is unaudited — test on Arc Testnet and seek an audit and legal review
> before taking real deposits.
