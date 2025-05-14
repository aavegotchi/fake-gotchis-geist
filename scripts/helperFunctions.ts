import { Contract } from "@ethersproject/contracts";
import { OwnershipFacet } from "../typechain-types";
import path from "path";
import fs from "fs";
import { network, run } from "hardhat";

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
    aavegotchiDiamond: "0x86e527A5863975d0141514D20248aD17B6BF92D0", // Base Sepolia Testnet
    ghstAddress: "0xe97f36a00058aa7dfc4e85d23532c3f70453a7ae",
  },
  8453: {
    aavegotchiDiamond: "", // Base Mainnet
    ghstAddress: "",
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

export async function verifyContract(
  address: string,
  withArgs: boolean = false,
  args?: any[],
  contractName?: string
) {
  //only try to verify if it is a live network

  if (["localhost", "hardhat"].includes(network.name)) {
    console.log("Skipping verification on local network");
    return;
  }

  //wait for 3 seconds
  await new Promise((resolve) => setTimeout(resolve, 3000));

  if (withArgs) {
    try {
      const verifyArgs: any = {
        address,
        constructorArguments: args,
      };
      if (contractName) {
        verifyArgs.contract = contractName;
      }
      await run("verify:verify", verifyArgs);
    } catch (error) {
      console.log("Error verifying contract", error);
    }
  } else {
    try {
      const verifyArgs: any = {
        address,
      };
      if (contractName) {
        verifyArgs.contract = contractName;
      }
      await run("verify:verify", verifyArgs);
    } catch (error) {
      console.log("Error verifying contract", error);
    }
  }
}
