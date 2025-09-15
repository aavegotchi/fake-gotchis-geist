import { Contract } from "@ethersproject/contracts";
import path from "path";
import fs from "fs";
import { network, run } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { LedgerSigner } from "@anders-t/ethers-ledger";
// import {
//   DefenderRelayProvider,
//   DefenderRelaySigner,
// } from "defender-relay-client/lib/ethers";

export const gasPrice = 280000000000;

export async function impersonate(
  address: string,
  contract: any,
  ethers: any,
  network: any
) {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  let signer = await ethers.getSigner(address);
  contract = contract.connect(signer);
  return contract;
}

export async function resetChain(hre: any) {
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.MATIC_URL,
        },
      },
    ],
  });
}

export function getSelectors(contract: Contract) {
  const signatures = Object.keys(contract.interface.functions);
  const selectors = signatures.reduce((acc: string[], val: string) => {
    if (val !== "init(bytes)") {
      acc.push(contract.interface.getSighash(val));
    }
    return acc;
  }, []);
  return selectors;
}

export function getSighashes(selectors: string[], ethers: any): string[] {
  if (selectors.length === 0) return [];
  const sighashes: string[] = [];
  selectors.forEach((selector) => {
    if (selector !== "") sighashes.push(getSelector(selector, ethers));
  });
  return sighashes;
}

export function getSelector(func: string, ethers: any) {
  const abiInterface = new ethers.utils.Interface([func]);
  return abiInterface.getSighash(ethers.utils.Fragment.from(func));
}

interface Addresses {
  aavegotchiDiamond: string;
  ghstAddress: string;
}

interface NetworkAddresses {
  [chainId: number]: Addresses;
}

const chainAddresses: NetworkAddresses = {
  137: {
    aavegotchiDiamond: "0x86935F11C86623deC8a25696E1C19a8659CbF95d", // Polygon Mainnet
    ghstAddress: "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7",
  },
  84532: {
    aavegotchiDiamond: "0x03A74B3e2DD81F5E8FFA1Fb96bb81B35cF3ed5d2", // Base Sepolia Testnet
    ghstAddress: "0xe97f36a00058aa7dfc4e85d23532c3f70453a7ae",
  },
  8453: {
    aavegotchiDiamond: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF", // Base Mainnet
    ghstAddress: "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb",
  },
  31337: {
    aavegotchiDiamond: "0x86e527A5863975d0141514D20248aD17B6BF92D0", //Placeholder for local
    ghstAddress: "0xe97f36a00058aa7dfc4e85d23532c3f70453a7ae",
  },
  // Add more networks as needed
};

export function addresses() {
  let chainId = network.config.chainId;
  if (network.name === "hardhat" || network.name === "localhost") {
    chainId = 31337;
  } else if (!chainId) {
    throw new Error("Chain ID not found in network config");
  }
  const address = chainAddresses[chainId];
  if (!address) {
    throw new Error(`No address found for chainId ${chainId}`);
  }
  return address;
}

export const mumbaiFakeGotchisNFTDiamondAddress =
  "0x330088c3372f4F78cF023DF16E1e1564109191dc";
export const mumbaiFakeGotchisCardDiamondAddress =
  "0x9E282FE4a0be6A0C4B9f7d9fEF10547da35c52EA";
export const mumbaiFakeGotchisUpgraderAddress =
  "0x94cb5C277FCC64C274Bd30847f0821077B231022";

export const ghstAddress = "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7";

export async function diamondOwner(address: string, ethers: any) {
  return await (await ethers.getContractAt("OwnershipFacet", address)).owner();
}

interface DeployedDiamonds {
  fakeGotchisNFT: string;
  fakeGotchisCard: string;
}

interface NetworkDeployments {
  [chainId: number]: DeployedDiamonds;
}

const DEPLOYED_DIAMONDS_PATH = path.join(__dirname, "deployedDiamonds.json");

export function saveDeployedDiamonds(
  chainId: number,
  diamonds: DeployedDiamonds
) {
  // Load existing deployments if file exists
  let allDeployments: NetworkDeployments = {};
  if (fs.existsSync(DEPLOYED_DIAMONDS_PATH)) {
    allDeployments = JSON.parse(
      fs.readFileSync(DEPLOYED_DIAMONDS_PATH, "utf8")
    );
  }

  // Update deployments for the specific chain
  allDeployments[chainId] = diamonds;

  // Save back to file
  fs.writeFileSync(
    DEPLOYED_DIAMONDS_PATH,
    JSON.stringify(allDeployments, null, 2)
  );
}

export function getDeployedDiamonds(chainId: number): DeployedDiamonds {
  if (!fs.existsSync(DEPLOYED_DIAMONDS_PATH)) {
    throw new Error("No deployed diamonds file found");
  }

  const allDeployments: NetworkDeployments = JSON.parse(
    fs.readFileSync(DEPLOYED_DIAMONDS_PATH, "utf8")
  );

  const diamonds = allDeployments[chainId];
  if (!diamonds) {
    throw new Error(`No deployed diamonds found for chainId ${chainId}`);
  }

  return diamonds;
}

export const xpRelayerAddress = "0xb6384935d68e9858f8385ebeed7db84fc93b1420";
export const xpRelayerAddressBaseSepolia =
  "0x46c7064038C4821dDd1c27Ed9FC4b283a74AC6d2";
export const xpRelayerAddressBase =
  "0xf52398257A254D541F392667600901f710a006eD";

export interface RelayerInfo {
  apiKey: string;
  apiSecret: string;
}

// export async function getRelayerSigner(hre: HardhatRuntimeEnvironment) {
//   const testing = ["hardhat", "localhost"].includes(hre.network.name);
//   let xpRelayer;
//   if (
//     hre.network.config.chainId === 137 ||
//     hre.network.config.chainId === 8453
//   ) {
//     xpRelayer = xpRelayerAddress;
//   } else if (hre.network.config.chainId === 84532) {
//     xpRelayer = xpRelayerAddressBaseSepolia;
//   }

//   if (testing) {
//     if (hre.network.config.chainId !== 31337) {
//       console.log("Using Hardhat");

//       await hre.network.provider.request({
//         method: "hardhat_impersonateAccount",
//         params: [xpRelayer],
//       });
//       await hre.network.provider.request({
//         method: "hardhat_setBalance",
//         params: [xpRelayerAddress, "0x100000000000000000000000"],
//       });
//       return await hre.ethers.provider.getSigner(xpRelayerAddress);
//     } else {
//       return (await hre.ethers.getSigners())[0];
//     }
//     //we assume same defender for base mainnet
//   } else if (hre.network.name === "matic" || hre.network.name === "base") {
//     console.log("USING", hre.network.name);

//     const credentials: RelayerInfo = {
//       apiKey: process.env.DEFENDER_APIKEY!,
//       apiSecret: process.env.DEFENDER_SECRET!,
//     };

//     const provider = new DefenderRelayProvider(credentials);
//     return new DefenderRelaySigner(credentials, provider, {
//       speed: "average",
//       validForSeconds: 200,
//     });
//   } else if (hre.network.name === "baseSepolia") {
//     console.log("USING BASE SEPOLIA DEFENDER");
//     const credentials: RelayerInfo = {
//       apiKey: process.env.DEFENDER_APIKEY_BASESEPOLIA!,
//       apiSecret: process.env.DEFENDER_SECRET_BASESEPOLIA!,
//     };

//     const provider = new DefenderRelayProvider(credentials);
//     return new DefenderRelaySigner(credentials, provider, {
//       speed: "safeLow",
//       validForSeconds: 180,
//     });
//   } else if (
//     ["tenderly", "polter", "amoy", "geist"].includes(hre.network.name)
//   ) {
//     //impersonate
//     return (await hre.ethers.getSigners())[0];
//   } else {
//     throw Error("Incorrect network selected");
//   }
// }

export async function verifyContract(
  address: string,
  withArgs: boolean = false,
  args?: any[],
  contractName?: string
) {
  //only try to verify if it is a live network

  //@ts-ignore
  if (["localhost", "hardhat"].includes(hre.network.name)) {
    console.log("Skipping verification on local network");
    return;
  }

  console.log(`Attempting to verify contract at ${address}...`);
  console.log("Waiting 5 seconds before verifying...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  try {
    const verifyArgs: any = {
      address,
    };

    if (withArgs && args) {
      verifyArgs.constructorArguments = args;
    }

    if (contractName) {
      verifyArgs.contract = contractName;
    }

    //@ts-ignore
    await hre.run("verify:verify", verifyArgs);
    console.log(`Successfully verified contract ${address}`);
  } catch (error: any) {
    const msg = error?.message || "";
    if (
      msg.includes("Already Verified") ||
      msg.includes("ContractAlreadyVerified") || // Added to catch Etherscan's newer message
      msg.includes("already verified") || // General catch
      msg.includes("Contract source code already verified") // Another Etherscan variant
    ) {
      console.log(
        `Contract ${address}${
          contractName ? " (" + contractName + ")" : ""
        } already verified on block explorer, skipping.`
      );
    } else {
      console.error(
        `Error verifying contract ${address}${
          contractName ? " (" + contractName + ")" : ""
        }:`,
        msg
      );
    }
  }
}

export async function getLedgerSigner(ethers: any) {
  console.log("Getting ledger signer");
  return new LedgerSigner(ethers.provider, "m/44'/60'/1'/0/0");
}
