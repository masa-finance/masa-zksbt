import {
  getCoinMarketCapApiKey,
  getEtherscanApiKey,
  getInfuraApiKey,
  getPrivateKey
} from "./src/EnvParams";
import "hardhat-deploy";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-solhint";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/ethers-v5";
import "@typechain/hardhat";
import "@primitivefi/hardhat-dodoc";
import "hardhat-gas-reporter";
import "hardhat-circom";
import "solidity-coverage";
import { NetworksUserConfig } from "hardhat/types";

const getInfuraURL = (network: string) => {
  return `https://${network}.infura.io/v3/${getInfuraApiKey()}`;
};

const networks: NetworksUserConfig = {
  hardhat: {
    allowUnlimitedContractSize: true,
    gasPrice: "auto"
  },
  goerli: {
    url: getInfuraURL("goerli"),
    chainId: 5,
    accounts: [getPrivateKey("goerli")]
  },
  mainnet: {
    url: getInfuraURL("mainnet"),
    chainId: 1,
    accounts: [getPrivateKey("mainnet")]
  }
};

export default {
  networks,
  solidity: {
    compilers: [
      {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
            details: {
              yul: false
            }
          }
        }
      },
      {
        version: "0.8.8",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
            details: {
              yul: false
            }
          }
        }
      }
    ]
  },
  namedAccounts: {
    deployer: {
      default: 0
    }
  },
  etherscan: {
    apiKey: getEtherscanApiKey()
  },
  gasReporter: {
    currency: "USD",
    coinmarketcap: getCoinMarketCapApiKey(),
    token: "MATIC",
    gasPriceApi:
      "https://api.polygonscan.com/api?module=proxy&action=eth_gasPrice"
  },
  dodoc: {},
  typechain: {
    outDir: "typechain"
  },
  circom: {
    inputBasePath: "./circuits/",
    ptau: "pot12_final.ptau",
    outputBasePath: "./circuits_client/",
    circuits: [
      {
        name: "creditScoreConstraint",
        circuit: "creditScoreConstraint/creditScoreConstraint.circom",
        input: "creditScoreConstraint/input.json"
      }
    ]
  }
};
