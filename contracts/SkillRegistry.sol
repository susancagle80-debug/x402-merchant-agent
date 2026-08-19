// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SkillRegistry
 * @dev ERC-721 contract representing ownership of a Skill Capability with metadata support.
 */
contract SkillRegistry is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    constructor() ERC721("SkillCapability", "SKILL") Ownable(msg.sender) {}

    function mintSkill(address to, string memory uri) public onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }
}
