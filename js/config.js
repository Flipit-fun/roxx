/* ============================================================
   ROXX — chain + contract configuration
   ------------------------------------------------------------
   Robinhood Chain is an Arbitrum L2 with ETH as the native gas
   token. Fill in RETH_ADDRESS after you deploy RETH.sol.
   Docs: https://docs.robinhood.com/chain/connecting/
   ============================================================ */
window.ROXX_CONFIG = {
  // Which network the front end targets: "mainnet" or "testnet".
  network: 'mainnet',

  // Paste the deployed rETH mint contract address here after deploying.
  // While empty, the app shows "To Be Announced" and Connect still works.
  RETH_ADDRESS: '',

  networks: {
    mainnet: {
      // 4663 -> hex
      chainId: '0x1237',
      chainName: 'Robinhood Chain',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      // Alchemy is the recommended provider. Swap {API_KEY} for your key,
      // or replace with any other Robinhood Chain RPC you use.
      rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
      blockExplorerUrls: ['https://robinhoodchain.blockscout.com']
    },
    testnet: {
      // 46630 -> hex
      chainId: '0xB626',
      chainName: 'Robinhood Chain Testnet',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://robinhood-testnet.g.alchemy.com/v2/{API_KEY}'],
      blockExplorerUrls: ['https://explorer.testnet.chain.robinhood.com']
    }
  },

  // ABI for the accruing vault (matches contracts/RETHVault.sol).
  RETH_ABI: [
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
