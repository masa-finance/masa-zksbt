import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { solidity } from "ethereum-waffle";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";
import { deployments, ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  VerifyCreditScore,
  VerifyCreditScore__factory,
  ZKPSBTAuthorityURL,
  ZKPSBTAuthorityURL__factory
} from "../typechain";
import { Wallet } from "ethers";
import publicKeyToAddress from "ethereum-public-key-to-address";
import { create } from "ipfs-http-client";
import {
  getInfuraIPFSApiKey,
  getInfuraIPFSApiKeySecret
} from "../src/EnvParams";

const buildPoseidon = require("circomlibjs").buildPoseidon;
const auth =
  "Basic " +
  Buffer.from(
    getInfuraIPFSApiKey() + ":" + getInfuraIPFSApiKeySecret()
  ).toString("base64");
const ipfs = create({
  host: "ipfs.infura.io",
  port: 5001,
  protocol: "https",
  apiPath: "/api/v0",
  headers: {
    authorization: auth
  }
});

const {
  encryptWithPublicKey,
  decryptWithPrivateKey
} = require("../src/crypto");
const { genProof } = require("../src/solidity-proof-builder");

chai.use(chaiAsPromised);
chai.use(solidity);
const expect = chai.expect;

// contract instances
let zkpSBT: ZKPSBTAuthorityURL;
let verifyCreditScore: VerifyCreditScore;

let owner: SignerWithAddress;
let address1: Wallet;

const creditScore = 45;
const income = 3100;
const reportDate = new Date("2023-01-31T20:23:01.804Z").getTime();
const threshold = 40;

let encryptedJson;
let ipfsPath;
let encryptedIpfsPath;
let hashData;
let hashDataHex;

describe("ZKP SBT Authority URL", () => {
  beforeEach(async () => {
    [, owner] = await ethers.getSigners();

    address1 = new ethers.Wallet(
      "0x41c5ab8f659237772a24848aefb3700202ec730c091b3c53affe3f9ebedbc3c9",
      // ethers.Wallet.createRandom().privateKey,
      ethers.provider
    );

    await deployments.fixture("ZKPSBTAuthorityURL", {
      fallbackToGlobal: true
    });
    await deployments.fixture("VerifyCreditScore", {
      fallbackToGlobal: true
    });

    await owner.sendTransaction({
      to: address1.address,
      value: ethers.utils.parseEther("1")
    });

    const { address: zkpSBTAddress } = await deployments.get(
      "ZKPSBTAuthorityURL"
    );
    const { address: verifyCreditScoreAddress } = await deployments.get(
      "VerifyCreditScore"
    );

    zkpSBT = ZKPSBTAuthorityURL__factory.connect(zkpSBTAddress, owner);
    verifyCreditScore = VerifyCreditScore__factory.connect(
      verifyCreditScoreAddress,
      owner
    );

    // middleware checks that public key belongs to address1
    expect(publicKeyToAddress(address1.publicKey)).to.be.equal(
      address1.address
    );

    // middleware calculates hash of data
    const poseidon = await buildPoseidon();
    hashData = poseidon([
      BigInt(address1.address),
      BigInt(creditScore),
      BigInt(income),
      BigInt(reportDate)
    ]);
    hashDataHex = "0x" + BigInt(poseidon.F.toString(hashData)).toString(16);

    const json = {
      address: address1.address,
      creditScore: creditScore,
      income: income,
      reportDate: reportDate
    };

    // middleware encrypts data with public key of address1
    encryptedJson = await encryptWithPublicKey(
      address1.publicKey,
      JSON.stringify(json)
    );

    const ipfsDoc = await ipfs.add(JSON.stringify(encryptedJson));
    ipfsPath = ipfsDoc.path;
    encryptedIpfsPath = await encryptWithPublicKey(
      address1.publicKey,
      ipfsPath
    );
  });

  describe("sbt information", () => {
    it("should be able to get sbt information", async () => {
      expect(await zkpSBT.name()).to.equal("ZKP SBT");

      expect(await zkpSBT.symbol()).to.equal("ZKPSBT");
    });
  });

  describe("mint", () => {
    it("should mint from owner", async () => {
      const mintTx = await zkpSBT
        .connect(owner)
        .mint(address1.address, hashDataHex, encryptedIpfsPath);
      const mintReceipt = await mintTx.wait();

      const toAddress = mintReceipt.events![1].args![1];

      expect(toAddress).to.equal(address1.address);
    });

    it("should fail to mint from non minter address", async () => {
      await expect(
        zkpSBT
          .connect(address1)
          .mint(address1.address, hashDataHex, encryptedIpfsPath)
      ).to.be.reverted;
    });
  });

  describe("burn", () => {
    it("should burn", async () => {
      // we mint
      let mintTx = await zkpSBT
        .connect(owner)
        .mint(address1.address, hashDataHex, encryptedIpfsPath);
      let mintReceipt = await mintTx.wait();
      const tokenId = mintReceipt.events![0].args![1].toNumber();

      const balanceBefore = await zkpSBT.balanceOf(address1.address);

      await zkpSBT.connect(address1).burn(tokenId);

      expect(await zkpSBT.balanceOf(address1.address)).to.be.equal(
        balanceBefore.toNumber() - 1
      );
    });
  });

  describe("tokenUri", () => {
    it("should get a valid token URI from its tokenId", async () => {
      const mintTx = await zkpSBT
        .connect(owner)
        .mint(address1.address, hashDataHex, encryptedIpfsPath);

      const mintReceipt = await mintTx.wait();
      const tokenId = mintReceipt.events![0].args![1].toNumber();
      const tokenUri = await zkpSBT.tokenURI(tokenId);

      // check if it's a valid url
      expect(() => new URL(tokenUri)).to.not.throw();
      // we expect that the token uri is already encoded
      expect(tokenUri).to.equal(encodeURI(tokenUri));
      expect(tokenUri).to.contain("testserver/");
    });
  });

  describe("decrypt data", () => {
    it("decrypt the data with address1 private key and generate/validate proof", async () => {
      const mintTx = await zkpSBT
        .connect(owner)
        .mint(address1.address, hashDataHex, encryptedIpfsPath);

      const mintReceipt = await mintTx.wait();
      const tokenId = mintReceipt.events![0].args![1].toNumber();
      const sbtData = await zkpSBT.sbtData(tokenId);

      // we decrypt the URL with the private key of address1
      const decryptedURL = await decryptWithPrivateKey(
        address1.privateKey,
        sbtData.encryptedUrl
      );

      // we get the encrypted data from IPFS
      const resp = await ipfs.cat(decryptedURL);
      let content: number[] = [];
      for await (const chunk of resp) {
        content = [...content, ...chunk];
      }
      const encryptedData = Buffer.from(content).toString("utf8");

      // we decrypt the data with the private key of address1
      const decryptedData = JSON.parse(
        await decryptWithPrivateKey(
          address1.privateKey,
          JSON.parse(encryptedData)
        )
      );

      // we check that the hash of the data is the same
      const poseidon = await buildPoseidon();
      expect(
        "0x" +
          BigInt(
            poseidon.F.toString(
              poseidon([
                BigInt(decryptedData.address),
                BigInt(decryptedData.creditScore),
                BigInt(decryptedData.income),
                BigInt(decryptedData.reportDate)
              ])
            )
          ).toString(16)
      ).to.equal(sbtData.hashData);

      // we check that the data is the same
      expect(+decryptedData.creditScore).to.equal(creditScore);

      // input of ZKP
      const input = {
        hashData: sbtData.hashData,
        ownerAddress: address1.address,
        threshold: threshold,
        creditScore: +decryptedData.creditScore,
        income: +decryptedData.income,
        reportDate: +decryptedData.reportDate
      };

      // generate ZKP proof
      const proof = await genProof(input);

      // check ZKP proof
      await verifyCreditScore.loanEligible(
        proof.a,
        proof.b,
        proof.c,
        proof.PubSignals,
        zkpSBT.address,
        tokenId
      );

      expect(
        await verifyCreditScore.isElegibleForLoan(address1.address)
      ).to.be.equal(threshold);
    });

    it("proof with invalid creditScore will fail (incorrect hash)", async () => {
      const mintTx = await zkpSBT
        .connect(owner)
        .mint(address1.address, hashDataHex, encryptedIpfsPath);

      const mintReceipt = await mintTx.wait();
      const tokenId = mintReceipt.events![0].args![1].toNumber();
      const sbtData = await zkpSBT.sbtData(tokenId);

      // input of ZKP
      const input = {
        hashData: sbtData.hashData,
        ownerAddress: address1.address,
        threshold: threshold,
        creditScore: 55, // invalid credit score
        income: income,
        reportDate: reportDate
      };

      // generate ZKP proof will fail because the hash is not correct
      await expect(genProof(input)).to.be.rejected;

      expect(
        await verifyCreditScore.isElegibleForLoan(address1.address)
      ).to.be.equal(0);
    });
  });
});
