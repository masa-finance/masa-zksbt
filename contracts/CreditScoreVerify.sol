// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "hardhat/console.sol";

interface IVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[4] memory input
    ) external view returns (bool);
}

interface IZKPSBT is IERC721 {
    function getHashData(uint256 tokenId) external view returns (bytes memory);
}

/// @title Verify if user is eligible for a loan
/// @author Masa Finance
/// @notice Tests if the user is eligible for a loan based on the credit score
contract CreditScoreVerify {
    IVerifier verifier;

    mapping(address => uint256) public isElegibleForLoan;

    constructor(IVerifier _verifier) {
        verifier = _verifier;
    }

    // @notice verifies the validity of the proof, and make further verifications on the public
    // input of the circuit, if verified add the address to the list of eligible addresses
    function loanEligible(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[4] memory publicValues,
        IZKPSBT zkpSBT,
        uint256 sbtTokenId
    ) public {
        address ownerAddress = address(uint160(publicValues[2]));
        uint256 threshold = publicValues[3];

        require(
            publicValues[0] ==
                0x0000000000000000000000000000000000000000000000000000000000000001,
            "The claim doesn't satisfy the query condition"
        );

        require(
            zkpSBT.ownerOf(sbtTokenId) == ownerAddress,
            "The SBT doesn't belong to the address that is trying to claim the loan"
        );

        bytes memory hash = zkpSBT.getHashData(sbtTokenId);
        require(
            keccak256(abi.encodePacked(hash)) ==
                keccak256(abi.encodePacked(publicValues[1])),
            "The hash of the data doesn't match the hash of the data in the SBT"
        );

        require(
            verifier.verifyProof(a, b, c, publicValues),
            "Proof verification failed"
        );

        console.log(
            "Address",
            ownerAddress,
            "is elegible for a loan with a credit score >=",
            threshold
        );

        isElegibleForLoan[ownerAddress] = threshold;
    }
}
