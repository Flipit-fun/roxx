// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RETH — a 1:1 ETH-backed mintable token
/// @notice Deposit ETH, mint rETH at a flat 1:1 rate. Burn rETH to redeem
///         the same amount of ETH. Every rETH in supply is backed by exactly
///         one wei of ETH held by this contract. There is no owner, no fee,
///         and no way to mint rETH without depositing the ETH first.
contract RETH {
    string public constant name = "Roxx ETH";
    string public constant symbol = "rETH";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Simple reentrancy guard for redeem (it makes an external ETH call).
    uint256 private _locked = 1;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Minted(address indexed to, uint256 ethIn, uint256 rethOut);
    event Redeemed(address indexed from, uint256 rethIn, uint256 ethOut);

    modifier nonReentrant() {
        require(_locked == 1, "reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ------------------------------------------------------------------
    // Mint / Redeem — the whole point
    // ------------------------------------------------------------------

    /// @notice Send ETH, receive an equal amount of rETH. 1 ETH => 1 rETH.
    function mint() external payable {
        require(msg.value > 0, "zero ETH");
        _mint(msg.sender, msg.value);
        emit Minted(msg.sender, msg.value, msg.value);
    }

    /// @notice Burn rETH and receive an equal amount of ETH back. 1 rETH => 1 ETH.
    function redeem(uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        require(balanceOf[msg.sender] >= amount, "insufficient rETH");
        _burn(msg.sender, amount);
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit Redeemed(msg.sender, amount, amount);
    }

    /// @notice Minting via a plain ETH transfer works too.
    receive() external payable {
        _mint(msg.sender, msg.value);
        emit Minted(msg.sender, msg.value, msg.value);
    }

    // ------------------------------------------------------------------
    // Minimal ERC-20 so rETH is a plain, transferable claim
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
