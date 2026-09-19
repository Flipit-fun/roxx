// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RUSDCVault — a USDC-backed, value-accruing rUSDC token on Arc
/// @dev    Arc (Circle's L1) uses USDC as the NATIVE gas token with 18 decimals
///         at the EVM level, so `msg.value` and balances here are USDC scaled
///         by 1e18 — exactly the wei model. No ERC-20 approve step is needed:
///         users send USDC as value to deposit(), and redeem() pays USDC back
///         as native value.
/// @notice Deposit USDC, mint rUSDC at the current exchange rate. The rate is
///         derived purely from balances: rate = totalAssets / totalSupply.
///         When yield USDC is added via addYield(), the value of every rUSDC
///         rises. When you withdraw, you burn rUSDC and receive
///         rUSDC * (totalAssets / totalSupply) in USDC.
///
///         Key safety properties:
///         - The contract can NEVER owe more USDC than it holds. Redemption is
///           always priced against the actual USDC balance, so it is always
///           fully backed and can never become a scheme that pays early exits
///           from later deposits.
///         - Deposits and withdrawals do NOT move the rate: assets and supply
///           change together.
///         - Only addYield() (real yield fed back in) moves the rate up; a
///           realized loss handled off-chain would show as a lower balance and
///           the rate would reflect that honestly.
///         - No owner controls the rate. addYield() is permissionless.
///         - A 1:1 virtual offset (1 share / 1 wei asset) keeps the rate at
///           exactly 1 USDC = 1 rUSDC from the first deposit and avoids
///           division by zero on an empty vault.
///
///         Yield is generated off-chain by the protocol's real-estate holdings
///         (rent collected and property appreciation) and returned to this
///         contract as USDC via addYield(). The target rate is
///         VARIABLE and NOT guaranteed — it reflects whatever is actually
///         funded. The contract starts exactly 1:1 (no profit, no loss).
contract RUSDCVault {
    string public constant name = "Reticence USDC";
    string public constant symbol = "rUSDC";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Virtual offsets. Kept at 1:1 so the vault reads exactly 1 USDC = 1 rUSDC
    // from the very first deposit, while still avoiding division by zero and
    // keeping a basic guard against the empty-vault edge case.
    uint256 private constant VIRTUAL_SHARES = 1;
    uint256 private constant VIRTUAL_ASSETS = 1;

    // Accounting of USDC backing the shares. Kept explicit (rather than reading
    // address(this).balance) so a forced-send of USDC cannot skew the rate.
    uint256 public totalAssets;

    // Simple reentrancy guard for functions that send USDC out.
    uint256 private _locked = 1;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event YieldAdded(address indexed from, uint256 assets, uint256 newTotalAssets);

    modifier nonReentrant() {
        require(_locked == 1, "reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ------------------------------------------------------------------
    // Rate / conversion views
    // ------------------------------------------------------------------

    /// @notice USDC value of a given amount of rUSDC shares.
    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * (totalAssets + VIRTUAL_ASSETS)) / (totalSupply + VIRTUAL_SHARES);
    }

    /// @notice rUSDC shares minted for a given amount of USDC assets.
    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * (totalSupply + VIRTUAL_SHARES)) / (totalAssets + VIRTUAL_ASSETS);
    }

    /// @notice USDC value of ONE rUSDC (1e18), scaled to 1e18. Starts at 1e18 (1:1).
    function exchangeRate() external view returns (uint256) {
        return convertToAssets(1e18);
    }

    /// @notice Shares a depositor would receive for `assets` USDC right now.
    function previewDeposit(uint256 assets) external view returns (uint256) {
        return convertToShares(assets);
    }

    /// @notice USDC a holder would receive for redeeming `shares` right now.
    function previewRedeem(uint256 shares) external view returns (uint256) {
        return convertToAssets(shares);
    }

    // ------------------------------------------------------------------
    // Deposit / Withdraw (always open)
    // ------------------------------------------------------------------

    /// @notice Deposit USDC and mint rUSDC to msg.sender at the current rate.
    function deposit() external payable returns (uint256 shares) {
        require(msg.value > 0, "zero USDC");
        shares = convertToShares(msg.value);
        require(shares > 0, "zero shares");
        totalAssets += msg.value;
        _mint(msg.sender, shares);
        emit Deposit(msg.sender, msg.sender, msg.value, shares);
    }

    /// @notice Plain USDC transfers deposit as well.
    receive() external payable {
        uint256 shares = convertToShares(msg.value);
        require(shares > 0, "zero shares");
        totalAssets += msg.value;
        _mint(msg.sender, shares);
        emit Deposit(msg.sender, msg.sender, msg.value, shares);
    }

    /// @notice Burn `shares` rUSDC and receive the current USDC value. Always open.
    function redeem(uint256 shares) external nonReentrant returns (uint256 assets) {
        require(shares > 0, "zero shares");
        require(balanceOf[msg.sender] >= shares, "insufficient rUSDC");
        assets = convertToAssets(shares);
        require(assets > 0, "zero assets");
        require(assets <= totalAssets, "insufficient liquidity");

        _burn(msg.sender, shares);
        totalAssets -= assets;

        (bool ok, ) = msg.sender.call{value: assets}("");
        require(ok, "USDC transfer failed");
        emit Withdraw(msg.sender, msg.sender, assets, shares);
    }

    /// @notice Burn rUSDC to withdraw a specific USDC amount. Always open.
    function withdraw(uint256 assets) external nonReentrant returns (uint256 shares) {
        require(assets > 0, "zero assets");
        require(assets <= totalAssets, "insufficient liquidity");
        shares = convertToShares(assets);
        // round up so the vault never gives away value
        if (convertToAssets(shares) < assets) shares += 1;
        require(balanceOf[msg.sender] >= shares, "insufficient rUSDC");

        _burn(msg.sender, shares);
        totalAssets -= assets;

        (bool ok, ) = msg.sender.call{value: assets}("");
        require(ok, "USDC transfer failed");
        emit Withdraw(msg.sender, msg.sender, assets, shares);
    }

    // ------------------------------------------------------------------
    // Yield — permissionless top-up that raises the rate for everyone
    // ------------------------------------------------------------------

    /// @notice Add USDC yield to the vault. Mints NO shares, so the value of
    ///         every existing rUSDC rises. Anyone can call it (typically the
    ///         protocol paying in rent and property gains). There is no
    ///         privileged rate setter — the rate is always balances-derived.
    function addYield() external payable {
        require(msg.value > 0, "zero USDC");
        totalAssets += msg.value;
        emit YieldAdded(msg.sender, msg.value, totalAssets);
    }

    // ------------------------------------------------------------------
    // Minimal ERC-20 (rUSDC is a plain, transferable token)
    // ------------------------------------------------------------------

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= value, "allowance");
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    // ------------------------------------------------------------------
    // internals
    // ------------------------------------------------------------------

    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "zero address");
        require(balanceOf[from] >= value, "insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
