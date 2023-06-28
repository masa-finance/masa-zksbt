// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@masa-finance/masa-contracts-identity/contracts/tokens/MasaSBTAuthority.sol";

/// @title ZKP SBT Authority URL
/// @author Masa Finance
/// @notice Soulbound token implementing ZKP storing data on IPFS/Arweave
contract ZKPSBTAuthorityURL is MasaSBTAuthority, ReentrancyGuard {
    struct EncryptedData {
        bytes iv; // IV
        bytes ephemPublicKey; // ephemPublicKey
        bytes cipherText; // ciphertext
        bytes mac; // mac
    }

    // Struct to store the encrypted data with the public key of the owner of the SBT
    struct SBTData {
        bytes hashData; // hash of ownerAddress+creditScore without encryption, used to verify the data
        // encrypted data with the public key of the owner of the SBT
        EncryptedData encryptedUrl; // encrypted IPFS/Arweave URL
    }

    // tokenId => SBTData
    mapping(uint256 => SBTData) public sbtData;

    /// @notice Creates a new Test ZKP SBT
    /// @dev Creates a new Test ZKP SBT, inheriting from the Masa SSSBT contract.
    /// @param admin Administrator of the smart contract
    /// @param name Name of the token
    /// @param symbol Symbol of the token
    /// @param baseTokenURI Base URI of the token
    /// @param soulboundIdentity Address of the SoulboundIdentity contract
    /// @param paymentParams Payment gateway params
    constructor(
        address admin,
        string memory name,
        string memory symbol,
        string memory baseTokenURI,
        address soulboundIdentity,
        PaymentParams memory paymentParams
    )
        MasaSBTAuthority(
            admin,
            name,
            symbol,
            baseTokenURI,
            soulboundIdentity,
            paymentParams
        )
    {}

    function getHashData(uint256 tokenId) external view returns (bytes memory) {
        return sbtData[tokenId].hashData;
    }

    function getEncryptedUrl(
        uint256 tokenId
    ) external view returns (EncryptedData memory) {
        return sbtData[tokenId].encryptedUrl;
    }

    /// @notice Mints a new SBT
    /// @dev The caller must have the MINTER role
    /// @param to The address to mint the SBT to
    /// @param hashData Hash of ownerAddress+creditScore without encryption, used to verify the data
    /// @param encryptedUrl Encrypted IPFS/Arweave URL
    /// @return The SBT ID of the newly minted SBT
    function mint(
        address to,
        bytes calldata hashData,
        EncryptedData calldata encryptedUrl
    ) external payable virtual returns (uint256) {
        uint256 tokenId = _mintWithCounter(address(0), to);

        sbtData[tokenId] = SBTData({
            hashData: hashData,
            encryptedUrl: encryptedUrl
        });

        emit MintedToAddress(tokenId, to);

        return tokenId;
    }

    event MintedToAddress(uint256 tokenId, address to);
}
