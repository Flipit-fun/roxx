/* ============================================================
   RETICENCE — chain + contract configuration
   ------------------------------------------------------------
   Arc is Circle's EVM Layer-1 where USDC is the NATIVE gas token,
   represented with 18 decimals at the EVM level. That means wallet
   balances, msg.value and the vault's accounting are all USDC scaled
   by 1e18 — the same model as wei — so no ERC-20 approve step exists.
   Fill in VAULT_ADDRESS after you deploy contracts/RUSDCVault.sol.
   Network reference: https://docs.arc.io/arc/references/connect-to-arc
   ============================================================ */
window.RETICENCE_CONFIG = {
  // Which network the front end targets: "mainnet" or "testnet".
  network: 'mainnet',

  // Display symbols. ASSET is what users deposit, SHARE is what they receive.
  ASSET_SYMBOL: 'USDC',
  SHARE_SYMBOL: 'rUSDC',

  // Deployed RUSDCVault (accruing vault) on Arc. Empty until deployed —
  // the app then shows "To Be Announced" and disables minting.
  VAULT_ADDRESS: '',

  networks: {
    mainnet: {
      // 5042 -> hex
      chainId: '0x13b2',
      chainName: 'Arc',
      nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
      rpcUrls: ['https://rpc.mainnet.arc.io'],
      blockExplorerUrls: ['https://explorer.arc.io']
    },
    testnet: {
      // 5042002 -> hex
      chainId: '0x4cef52',
      chainName: 'Arc Testnet',
      nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
      rpcUrls: ['https://rpc.testnet.arc.io'],
      blockExplorerUrls: ['https://explorer.testnet.arc.io']
    }
  },

  // ABI for the accruing vault (matches contracts/RUSDCVault.sol).
  VAULT_ABI: [
    'function deposit() payable returns (uint256)',
    'function redeem(uint256 shares) returns (uint256)',
    'function withdraw(uint256 assets) returns (uint256)',
    'function addYield() payable',
    'function convertToAssets(uint256 shares) view returns (uint256)',
    'function convertToShares(uint256 assets) view returns (uint256)',
    'function exchangeRate() view returns (uint256)',
    'function previewDeposit(uint256 assets) view returns (uint256)',
    'function previewRedeem(uint256 shares) view returns (uint256)',
    'function totalAssets() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function name() view returns (string)',
    'event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares)',
    'event Withdraw(address indexed caller, address indexed receiver, uint256 assets, uint256 shares)',
    'event YieldAdded(address indexed from, uint256 assets, uint256 newTotalAssets)'
  ]
};
