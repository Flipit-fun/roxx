// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RETHVault — an ETH-backed, value-accruing rETH token
/// @notice Deposit ETH, mint rETH at the current exchange rate. The rate is
///         derived purely from balances: rate = totalAssets / totalSupply.
///         When yield ETH is added via addYield(), the value of every rETH
///         rises. When you withdraw, you burn rETH and receive
///         rETH * (totalAssets / totalSupply) in ETH.
///
///         Key safety properties:
///         - The contract can NEVER owe more ETH than it holds. Redemption is
///           always priced against the actual ETH balance, so it is always
///           fully backed and can never become a scheme that pays early exits
///           from later deposits.
///         - Deposits and withdrawals do NOT move the rate: assets and supply
///           change together.
///         - Only addYield() (real yield fed back in) moves the rate up; a
///           realized loss handled off-chain would show as a lower balance and
///           the rate would reflect that honestly.
///         - No owner controls the rate. addYield() is permissionless.
///         - A virtual offset (1e3 shares / 1 wei asset) blocks the classic
///           first-depositor inflation attack.
///
///         Yield is generated off-chain by the protocol's staking / lending
///         and returned to this contract via addYield(). The target rate is
///         VARIABLE and NOT guaranteed — it reflects whatever is actually
///         funded. The contract starts exactly 1:1 (no profit, no loss).
contract RETHVault {
    string public constant name = "Roxx ETH";
    string public constant symbol = "rETH";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Virtual offsets for inflation-attack resistance (OZ ERC-4626 approach).
    uint256 private constant VIRTUAL_SHARES = 1e3;
    uint256 private constant VIRTUAL_ASSETS = 1;

    // Accounting of ETH backing the shares. Kept explicit (rather than reading
    // address(this).balance) so a forced-send of ETH cannot skew the rate.
    uint256 public totalAssets;

    // Simple reentrancy guard for functions that send ETH out.
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

    /// @notice ETH value of a given amount of rETH shares.
    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * (totalAssets + VIRTUAL_ASSETS)) / (totalSupply + VIRTUAL_SHARES);
    }

    /// @notice rETH shares minted for a given amount of ETH assets.
    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * (totalSupply + VIRTUAL_SHARES)) / (totalAssets + VIRTUAL_ASSETS);
    }

    /// @notice ETH value of ONE rETH (1e18), scaled to 1e18. Starts at 1e18 (1:1).
    function exchangeRate() external view returns (uint256) {
        return convertToAssets(1e18);
    }

    /// @notice Shares a depositor would receive for `assets` ETH right now.
    function previewDeposit(uint256 assets) external view returns (uint256) {
        return convertToShares(assets);
    }

    /// @notice ETH a holder would receive for redeeming `shares` right now.
    function previewRedeem(uint256 shares) external view returns (uint256) {
        return convertToAssets(shares);
    }

    // ------------------------------------------------------------------
    // Deposit / Withdraw (always open)
    // ------------------------------------------------------------------

    /// @notice Deposit ETH and mint rETH to msg.sender at the current rate.
    function deposit() external payable returns (uint256 shares) {
        require(msg.value > 0, "zero ETH");
        shares = convertToShares(msg.value);
        require(shares > 0, "zero shares");
        totalAssets += msg.value;
        _mint(msg.sender, shares);
        emit Deposit(msg.sender, msg.sender, msg.value, shares);
    }

    /// @notice Plain ETH transfers deposit as well.
    receive() external payable {
        uint256 shares = convertToShares(msg.value);
        require(shares > 0, "zero shares");
        totalAssets += msg.value;
        _mint(msg.sender, shares);
        emit Deposit(msg.sender, msg.sender, msg.value, shares);
    }

    /// @notice Burn `shares` rETH and receive the current ETH value. Always open.
    function redeem(uint256 shares) external nonReentrant returns (uint256 assets) {
        require(shares > 0, "zero shares");
        require(balanceOf[msg.sender] >= shares, "insufficient rETH");
        assets = convertToAssets(shares);
        require(assets > 0, "zero assets");
        require(assets <= totalAssets, "insufficient liquidity");

        _burn(msg.sender, shares);
        totalAssets -= assets;

        (bool ok, ) = msg.sender.call{value: assets}("");
        require(ok, "ETH transfer failed");
        emit Withdraw(msg.sender, msg.sender, assets, shares);
    }

    /// @notice Burn rETH to withdraw a specific ETH amount. Always open.
    function withdraw(uint256 assets) external nonReentrant returns (uint256 shares) {
        require(assets > 0, "zero assets");
        require(assets <= totalAssets, "insufficient liquidity");
        shares = convertToShares(assets);
        // round up so the vault never gives away value
        if (convertToAssets(shares) < assets) shares += 1;
        require(balanceOf[msg.sender] >= shares, "insufficient rETH");

        _burn(msg.sender, shares);
        totalAssets -= assets;

        (bool ok, ) = msg.sender.call{value: assets}("");
        require(ok, "ETH transfer failed");
        emit Withdraw(msg.sender, msg.sender, assets, shares);
    }

    // ------------------------------------------------------------------
    // Yield — permissionless top-up that raises the rate for everyone
    // ------------------------------------------------------------------

    /// @notice Add ETH yield to the vault. Mints NO shares, so the value of
    ///         every existing rETH rises. Anyone can call it (typically the
    ///         protocol returning staking / lending yield). There is no
    ///         privileged rate setter — the rate is always balances-derived.
    function addYield() external payable {
        require(msg.value > 0, "zero ETH");
        totalAssets += msg.value;
        emit YieldAdded(msg.sender, msg.value, totalAssets);
    }

    // ------------------------------------------------------------------
    // Minimal ERC-20 (rETH is a plain, transferable token)
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
