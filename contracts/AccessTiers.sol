// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AccessTiers
 * @dev ERC-1155 contract representing access tiers linked to skills with expiry support and delegation.
 */
contract AccessTiers is ERC1155, Ownable {
    // tokenId => (userAddress => expiryTimestamp)
    mapping(uint256 => mapping(address => uint256)) public userExpiry;

    // Hot wallet delegate mapping: coldWallet => hotWallet => bool
    mapping(address => mapping(address => bool)) public delegates;

    constructor() ERC1155("") Ownable(msg.sender) {}

    // Mint function to issue tier tokens
    function mint(address account, uint256 id, uint256 amount, uint256 expiry) public onlyOwner {
        _mint(account, id, amount, "");
        userExpiry[id][account] = expiry;
    }

    function setExpiry(uint256 id, address account, uint256 expiry) public onlyOwner {
        userExpiry[id][account] = expiry;
    }

    // Delegation: Cold wallet authorizes a hot wallet
    function setDelegate(address hotWallet, bool authorized) public {
        delegates[msg.sender][hotWallet] = isAuthorized;
    }

    // Convenience overload for direct authorization check
    function isAuthorized(uint256 id, address account) public view returns (bool) {
        return isAuthorizedWithColdWallet(id, account, account);
    }

    // Check authorization, considering delegation
    function isAuthorizedWithColdWallet(uint256 id, address hotWallet, address coldWallet) public view returns (bool) {
        // Check if the hot wallet is authorized by the cold wallet, or if hot wallet is the cold wallet
        if (delegates[coldWallet][hotWallet] || hotWallet == coldWallet) {
            uint256 expiry = userExpiry[id][coldWallet];
            // Check if cold wallet owns the tier token.
            // If expiry is 0, treat as permanent access.
            bool isNotExpired = (expiry == 0 || block.timestamp < expiry);
            
            return balanceOf(coldWallet, id) > 0 && isNotExpired;
        }
        return false;
    }
}
