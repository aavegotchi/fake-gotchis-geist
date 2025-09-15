import { ethers } from "ethers";
import { HardhatEthersHelpers } from "hardhat/types";

export interface Constants {
  aavegotchiDiamond: string;
  realmDiamond: string;
  installationDiamond: string;
  tileDiamond: string;
  ghstAddress: string;
  fakeGotchiCards: string;
  fakeGotchiArt: string;
  safeProxyFactory?: string;
}

interface NetworkToConstants {
  [network: number]: Constants;
}

export interface Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

function varsByChainId(chainId: number) {
  if ([137, 80001, 84532, 8453, 31337].includes(chainId))
    return networkToVars[chainId];
  else return networkToVars[137];
}

export async function varsForNetwork(ethers: HardhatEthersHelpers) {
  return varsByChainId((await ethers.provider.getNetwork()).chainId);
}

export const maticVars: Constants = {
  aavegotchiDiamond: "0x86935F11C86623deC8a25696E1C19a8659CbF95d",
  realmDiamond: "0x1D0360BaC7299C86Ec8E99d0c1C9A95FEfaF2a11",
  installationDiamond: "0x19f870bD94A34b3adAa9CaA439d333DA18d6812A",
  tileDiamond: "0x9216c31d8146bCB3eA5a9162Dc1702e8AEDCa355",
  ghstAddress: "0x385eeac5cb85a38a9a07a70c73e0a3271cfb54a7",
  fakeGotchiCards: "0x9f6BcC63e86D44c46e85564E9383E650dc0b56D7",
  fakeGotchiArt: "0xA4E3513c98b30d4D7cc578d2C328Bd550725D1D0",
  safeProxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
};

const mumbaiVars: Constants = {
  aavegotchiDiamond: "0x14B55C7862023c9f2aEfCA1EB5a606465dA034B0",
  realmDiamond: "0x726F201A9aB38cD56D60ee392165F1434C4F193D",
  installationDiamond: "0x663aeA831087487d2944ce44836F419A35Ee005A",
  tileDiamond: "0xDd8947D7F6705136e5A12971231D134E80DFC15d",
  ghstAddress: "0x20d0A1ce31f8e8A77b291f25c5fbED007Adde932",
  fakeGotchiCards: "0x139E8A05239778540dA798957A9Cc380F77192Dc",
  fakeGotchiArt: "0xF62f629b7cBdef543B5d6a5E10c8061a88A443Cf",
};

export const baseVars: Constants = {
  aavegotchiDiamond: "0xA99c4B08201F2913Db8D28e71d020c4298F29dBF",
  realmDiamond: "",
  installationDiamond: "",
  tileDiamond: "",
  safeProxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
  ghstAddress: "0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb",
  fakeGotchiCards: "0xe46B8902dAD841476d9Fee081F1d62aE317206A9",
  fakeGotchiArt: "0xAb59CA4A16925b0a4BaC5026C94bEB20A29Df479",
};

export const baseSepoliaVars: Constants = {
  aavegotchiDiamond: "0x86e527A5863975d0141514D20248aD17B6BF92D0",
  realmDiamond: "",
  installationDiamond: "",
  tileDiamond: "",
  ghstAddress: "0xe97f36a00058aa7dfc4e85d23532c3f70453a7ae",
  fakeGotchiCards: "0x06c047e6400F58215D4e545adeC80CB5ED3cA206",
  fakeGotchiArt: "0xc539C1Adba8530DF916945A97CBCc3C3529B2b7B",
  safeProxyFactory: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
};

export const localVars: Constants = {
  aavegotchiDiamond: "0x86e527A5863975d0141514D20248aD17B6BF92D0",
  realmDiamond: "",
  installationDiamond: "",
  tileDiamond: "",
  ghstAddress: "0xe97f36a00058aa7dfc4e85d23532c3f70453a7ae",
  fakeGotchiCards: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  fakeGotchiArt: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
  safeProxyFactory: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
};

const networkToVars: NetworkToConstants = {
  137: maticVars,
  80001: mumbaiVars,
  100: maticVars, //update
  84532: baseSepoliaVars,
  8453: baseVars,
  31337: localVars,
};

export const gasPrice = 75000000000;

export const aavegotchiDAOAddress =
  "0xb208f8BB431f580CC4b216826AFfB128cd1431aB";
export const pixelcraftAddress = "0xD4151c984e6CF33E04FFAAF06c3374B2926Ecc64";

export const proxyAdminAddress = "0xB549125b4A2F3c1B4319b798EcDC72b04315dF2D";

export const ecosystemVesting = "0x7e07313B4FF259743C0c84eA3d5e741D2b0d07c3";
export const gameplayVesting = "0x3fB6C2A83d2FfFe94e0b912b612fB100047cc176";

export const DOMAIN_TYPES = [
  {
    name: "name",
    type: "string",
  },
  {
    name: "version",
    type: "string",
  },
  {
    name: "chainId",
    type: "uint256",
  },
  {
    name: "verifyingContract",
    type: "address",
  },
];

export const PERMIT_TYPES = {
  //EIP712Domain: DOMAIN_TYPES,
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export function baseSepoliaProvider() {
  const url = process.env.BASE_SEPOLIA_RPC_URL;
  if (!url) {
    throw new Error("BASE_SEPOLIA_RPC_URL not found in environment variables");
  }
  return new ethers.providers.JsonRpcProvider(url);
}

export function baseProvider() {
  const url = process.env.BASE_RPC_URL;
  if (!url) {
    throw new Error("BASE_RPC_URL not found in environment variables");
  }
  console.log("Using Base URL:", url);
  return new ethers.providers.JsonRpcProvider(url);
}
