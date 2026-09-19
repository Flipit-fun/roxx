// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RUSDCVault} from "../contracts/RUSDCVault.sol";

/// @notice Deploys RUSDCVault to Arc. The deployer signs with their OWN wallet —
///         this script never contains or requests a private key. Pass the account
///         via --account (keystore), --ledger, or --trezor when you run it.
///         Gas on Arc is paid in USDC, so the deployer needs a little USDC.
contract Deploy is Script {
    function run() external returns (RUSDCVault vault) {
        vm.startBroadcast();
        vault = new RUSDCVault();
        console2.log("RUSDCVault deployed at:", address(vault));
        vm.stopBroadcast();
    }
}
