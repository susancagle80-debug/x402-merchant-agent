// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SkillNFT is ERC721, ERC2981, Ownable {

    uint256 private _nextTokenId;

    struct Skill {
        string name;
        string description;
        string skillType;
        string ipfsHash;
        address creator;
        uint256 createdAt;
        bytes32 codeHash;
        bool isActive;
        uint256 royaltyBasisPoints;
    }

    mapping(uint256 => Skill) public skills;
    mapping(string => uint256) public skillTypeToLatestId;
    mapping(uint256 => uint256) public skillExecutionCount;
    mapping(address => bool) public authorizedMinters;

    event SkillMinted(uint256 indexed skillTokenId, address indexed creator, string indexed skillType, string ipfsHash, bytes32 codeHash, uint256 royaltyBasisPoints);
    event SkillDeprecated(uint256 indexed skillTokenId, string reason);
    event SkillExecuted(uint256 indexed skillTokenId, address indexed executor);
    event MinterAuthorizationChanged(address indexed minter, bool authorized);

    constructor() ERC721("SkillNFT", "SKILL") Ownable(msg.sender) {
        authorizedMinters[msg.sender] = true;
    }

    function mintSkill(
        string calldata name,
        string calldata description,
        string calldata skillType,
        string calldata ipfsHash,
        bytes32 codeHash,
        uint256 royaltyBasisPoints,
        address creator
    ) external returns (uint256) {
        require(authorizedMinters[msg.sender], "Not authorized to mint");
        require(creator != address(0), "Invalid creator address");
        require(royaltyBasisPoints <= 10000, "Royalty exceeds 100%");
        require(codeHash != bytes32(0), "Code hash cannot be empty");

        uint256 tokenId = _nextTokenId++;

        skills[tokenId] = Skill({
            name: name,
            description: description,
            skillType: skillType,
            ipfsHash: ipfsHash,
            creator: creator,
            createdAt: block.timestamp,
            codeHash: codeHash,
            isActive: true,
            royaltyBasisPoints: royaltyBasisPoints
        });

        skillTypeToLatestId[skillType] = tokenId;
        _safeMint(creator, tokenId);
        _setTokenRoyalty(tokenId, creator, uint96(royaltyBasisPoints));

        emit SkillMinted(tokenId, creator, skillType, ipfsHash, codeHash, royaltyBasisPoints);
        return tokenId;
    }

    function setMinterAuthorization(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit MinterAuthorizationChanged(minter, authorized);
    }

    function recordExecution(uint256 skillTokenId) external {
        require(skills[skillTokenId].createdAt > 0, "Skill does not exist");
        require(skills[skillTokenId].isActive, "Skill is deprecated");
        skillExecutionCount[skillTokenId]++;
        emit SkillExecuted(skillTokenId, msg.sender);
    }

    function deprecateSkill(uint256 skillTokenId, string calldata reason) external {
        require(skills[skillTokenId].createdAt > 0, "Skill does not exist");
        require(ownerOf(skillTokenId) == msg.sender || msg.sender == owner(), "Not authorized");
        skills[skillTokenId].isActive = false;
        emit SkillDeprecated(skillTokenId, reason);
    }

    function getSkill(uint256 tokenId) external view returns (Skill memory) {
        require(skills[tokenId].createdAt > 0, "Skill does not exist");
        return skills[tokenId];
    }

    function isSkillActive(uint256 tokenId) external view returns (bool) {
        return skills[tokenId].createdAt > 0 && skills[tokenId].isActive;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
