# Deploying RETH to Robinhood Chain

`RETH.sol` is a 1:1 ETH-backed mint/redeem token. Deposit ETH, get rETH; burn
rETH, get ETH back. This guide deploys it and connects the front end.

Robinhood Chain is an Arbitrum L2 with **ETH as the native gas token**.
Docs: https://docs.robinhood.com/chain/connecting/

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | 4663 (0x1237) | 46630 (0xB626) |
| Explorer | robinhoodchain.blockscout.com | explorer.testnet.chain.robinhood.com |
| RPC | https://robinhood-mainnet.g.alchemy.com/v2/{API_KEY} | https://robinhood-testnet.g.alchemy.com/v2/{API_KEY} |

> **Test first.** Deploy to testnet, mint/redeem a small amount, confirm it
> works, *then* do mainnet. Mainnet ETH is real money.

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

### 3. Set your RPC key
```bash
export ALCHEMY_KEY=your_alchemy_api_key   # from an Alchemy Robinhood Chain app
```

### 4. Import your deployer key into an encrypted keystore (one time)
```bash
cast wallet import roxx-deployer --interactive
# paste the private key when prompted, then set a password.
# From now on you reference it by name: --account roxx-deployer
```

### 5. Build
```bash
forge build
```

### 6. Deploy

Testnet:
```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://robinhood-testnet.g.alchemy.com/v2/$ALCHEMY_KEY \
  --account roxx-deployer \
  --broadcast
```

Mainnet:
```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://robinhood-mainnet.g.alchemy.com/v2/$ALCHEMY_KEY \
  --account roxx-deployer \
  --broadcast
```

Ledger instead of keystore: swap `--account roxx-deployer` for `--ledger`.

The console prints `RETH deployed at: 0x...`. Copy that address.

### 7. (Optional) Verify the source on Blockscout
```bash
forge verify-contract <DEPLOYED_ADDRESS> contracts/RETH.sol:RETH \
  --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api \
  --chain 4663
```

---

## Option B — Remix (browser, no install)

1. Open https://remix.ethereum.org
2. New file `RETH.sol`, paste the contents of `contracts/RETH.sol`.
3. Compiler tab → select `0.8.24` → **Compile**.
4. In your wallet (MetaMask), add Robinhood Chain using the table above, and
   switch to it.
5. Deploy tab → Environment = **Injected Provider** (your wallet) → contract
   `RETH` → **Deploy** → confirm in the wallet.
6. Copy the deployed address from the Deployed Contracts panel.

---

## Connect the front end

Open `js/config.js` and set two fields:

```js
window.ROXX_CONFIG = {
  network: 'mainnet',            // or 'testnet' while testing
  RETH_ADDRESS: '0xYourDeployedAddress',
  ...
```

Also replace `{API_KEY}` in the `rpcUrls` with your Alchemy key so wallets can
auto-add the network.

Reload the site. The Mint section will:
- Connect a wallet and auto-add/switch to Robinhood Chain.
- Show your live ETH / rETH balance.
- **Mint:** send ETH → receive rETH 1:1.
- **Redeem:** burn rETH → receive ETH 1:1.

---

## Sanity checks after deploy

- Mint 0.001 ETH → your rETH balance rises by 0.001.
- `totalSupply()` equals the contract's ETH balance (100% backed).
- Redeem 0.001 rETH → you get 0.001 ETH back, supply drops.

If those three hold, the peg and backing are correct.
