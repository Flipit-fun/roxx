// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RETH} from "../contracts/RETH.sol";

/// @notice Deploys RETH. The deployer signs with their OWN wallet — this script
///         never contains or requests a private key. Pass the account via
///         --account (keystore), --ledger, or --trezor when you run it.
contract Deploy is Script {
    function run() external returns (RETH reth) {
        vm.startBroadcast();
        reth = new RETH();
        console2.log("RETH deployed at:", address(reth));
        vm.stopBroadcast();
    }
}
