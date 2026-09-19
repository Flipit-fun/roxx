# Deploying RUSDCVault to Arc

`RUSDCVault.sol` is a USDC-backed, value-accruing vault token. Deposit USDC, get
rUSDC at the current rate; redeem rUSDC, get USDC back. This guide deploys it and
connects the front end.

Arc is Circle's EVM Layer-1 where **USDC is the native gas token**. At the EVM
level the native balance has 18 decimals, so `msg.value` is USDC scaled by 1e18
(the wei model) and the vault needs no ERC-20 approve step.
Docs: https://docs.arc.io/arc/references/connect-to-arc

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | 5042 (0x13b2) | 5042002 (0x4cef52) |
| RPC | https://rpc.mainnet.arc.io | https://rpc.testnet.arc.io |
| Explorer | https://explorer.arc.io | https://explorer.testnet.arc.io |
| Gas | USDC | USDC (faucet: https://faucet.circle.com) |

> **Test first.** Deploy to testnet, mint/redeem a small amount, confirm it
> works, *then* do mainnet. Mainnet USDC is real money.

---

## Your private key never leaves your machine

Neither this repo nor these commands contain a private key. You sign with your
own wallet. Two safe ways:

- **Keystore (recommended):** import your key once into an encrypted local
  keystore; every deploy prompts for its password.
- **Hardware wallet:** sign on a Ledger/Trezor.

Never paste a private key into a file, a chat, or a command that gets saved to
shell history.

---

## Option A — Foundry (command line)

### 1. Install Foundry
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 2. Get forge-std
```bash
forge install foundry-rs/forge-std --no-commit
```

### 3. Import your deployer key into an encrypted keystore (one time)
```bash
cast wallet import reticence-deployer --interactive
# paste the private key when prompted, then set a password.
# From now on you reference it by name: --account reticence-deployer
```

The deployer wallet needs a little USDC on Arc for gas (testnet: use the faucet).

### 4. Build
```bash
forge build
```

### 5. Deploy

Testnet:
```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc.testnet.arc.io \
  --account reticence-deployer \
  --broadcast
```

Mainnet:
```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc.mainnet.arc.io \
  --account reticence-deployer \
  --broadcast
```

Ledger instead of keystore: swap `--account reticence-deployer` for `--ledger`.

The console prints `RUSDCVault deployed at: 0x...`. Copy that address.

### 6. (Optional) Verify the source

Open the contract on https://explorer.arc.io and use its verification page
(flattened source or standard JSON input; compiler 0.8.24, optimizer on, 200 runs).
If the explorer exposes a Blockscout-compatible API you can also run:
```bash
forge verify-contract <DEPLOYED_ADDRESS> contracts/RUSDCVault.sol:RUSDCVault \
  --verifier blockscout \
  --verifier-url https://explorer.arc.io/api \
  --chain 5042
```

---

## Option B — Remix (browser, no install)

1. Open https://remix.ethereum.org
2. New file `RUSDCVault.sol`, paste the contents of `contracts/RUSDCVault.sol`.
3. Compiler tab → select `0.8.24` → **Compile**.
4. In your wallet (MetaMask), add Arc using the table above (currency symbol
   USDC, 18 decimals), and switch to it.
5. Deploy tab → Environment = **Injected Provider** (your wallet) → contract
   `RUSDCVault` → **Deploy** → confirm in the wallet.
6. Copy the deployed address from the Deployed Contracts panel.

---

## Connect the front end

Open `js/config.js` and set:

```js
window.RETICENCE_CONFIG = {
  network: 'mainnet',            // or 'testnet' while testing
  VAULT_ADDRESS: '0xYourDeployedAddress',
  ...
```

Then replace "To Be Announced" in the Contract rows of `app.html` and
`index.html` with the address (and link it to
`https://explorer.arc.io/address/<address>`).

Reload the site. The Mint panel will:
- Connect a wallet and auto-add/switch to Arc.
- Show your live USDC / rUSDC balance.
- **Mint:** send USDC → receive rUSDC at the current rate (1:1 at launch).
- **Withdraw:** burn rUSDC → receive USDC at the current rate.

---

## Sanity checks after deploy

- Mint 1 USDC → your rUSDC balance rises by 1.
- `totalAssets()` equals the contract's USDC balance (100% backed).
- Withdraw 1 rUSDC → you get 1 USDC back, supply drops.

If those three hold, the peg and backing are correct.
