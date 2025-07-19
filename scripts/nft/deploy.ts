//@ts-ignore
import { Signer } from "@ethersproject/abstract-signer";
import { ethers } from "hardhat";
import { DiamondCutFacet, OwnershipFacet } from "../../typechain-types";
import {
  addresses,
  getRelayerSigner,
  verifyContract,
} from "../helperFunctions";

const { getSelectors, FacetCutAction } = require("../libraries/diamond");

export async function deployNftDiamond(cardAddress: string) {
  if (!cardAddress) {
    throw Error(`FAKE Gotchis Card Diamond address empty`);
  }
  console.log("Deploying FAKE Gotchis NFT Diamond contracts\n");

  //@ts-ignore
  const deployer = await getRelayerSigner(hre);
  const deployerAddress = await deployer.getAddress();
  console.log("Deployer:", deployerAddress);
  const { aavegotchiDiamond, ghstAddress } = addresses();
  console.log("Aavegotchi Diamond Address:", aavegotchiDiamond);

  // deploy DiamondCutFacet
  const DiamondCutFacet = await ethers.getContractFactory(
    "DiamondCutFacet",
    deployer
  );
  const diamondCutFacet = await DiamondCutFacet.deploy({});
  await diamondCutFacet.deployed();
  console.log("DiamondCutFacet deployed:", diamondCutFacet.address);
  await verifyContract(diamondCutFacet.address, false);
  // deploy Diamond
  const Diamond = await ethers.getContractFactory(
    "FakeGotchisNFTDiamond",
    deployer
  );
  const diamond = await Diamond.deploy(
    deployerAddress,
    diamondCutFacet.address,
    ghstAddress,
    aavegotchiDiamond,
    cardAddress
  );
  await diamond.deployed();
  console.log("FAKE Gotchis NFT Diamond deployed:", diamond.address);
  await verifyContract(
    diamond.address,
    true,
    [
      deployerAddress,
      diamondCutFacet.address,
      ghstAddress,
      aavegotchiDiamond,
      cardAddress,
    ],
    "contracts/FakeGotchisNFTDiamond/FakeGotchisNFTDiamond.sol:FakeGotchisNFTDiamond"
  );

  // deploy DiamondInit
  const DiamondInit = await ethers.getContractFactory("DiamondInit", deployer);
  const diamondInit = await DiamondInit.deploy();
  await diamondInit.deployed();
  console.log("DiamondInit deployed:", diamondInit.address);

  // deploy facets
  console.log("Deploying facets for FAKE Gotchis NFT Diamond\n");
  const FacetNames = [
    "DiamondLoupeFacet",
    "OwnershipFacet",
    "MetadataFacet",
    "FakeGotchisNFTFacet",
  ];
  const cut = [];
  for (const FacetName of FacetNames) {
    const Facet = await ethers.getContractFactory(FacetName, deployer);
    const facet = await Facet.deploy({});
    await facet.deployed();
    console.log(`${FacetName} deployed: ${facet.address}`);
    await verifyContract(facet.address, false);
    cut.push({
      facetAddress: facet.address,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facet),
    });
  }

  const diamondCut = await ethers.getContractAt(
    "IDiamondCut",
    diamond.address,
    deployer
  );

  // call to init function
  const functionCall = diamondInit.interface.encodeFunctionData("init");
  const tx = await diamondCut.diamondCut(
    cut,
    diamondInit.address,
    functionCall
  );
  console.log("FAKE Gotchis NFT Diamond cut tx: ", tx.hash);
  const receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Diamond upgrade failed: ${tx.hash}`);
  }
  console.log("Completed diamond cut");

  //wait for 3 seconds
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const ownershipFacet = await ethers.getContractAt(
    "OwnershipFacet",
    diamond.address
  );
  const diamondOwner = await ownershipFacet.owner();
  console.log("FAKE Gotchis NFT Diamond owner is:", diamondOwner);

  if (diamondOwner.toLowerCase() !== deployerAddress.toLowerCase()) {
    throw new Error(
      `FAKE Gotchis NFT Diamond owner ${diamondOwner} is not deployer address ${deployerAddress}!`
    );
  }

  //pause fgNFT
  const fakeGotchisNftFacet = await ethers.getContractAt(
    "MetadataFacet",
    diamond.address,
    deployer
  );
  const txPause = await fakeGotchisNftFacet.toggleDiamondPause();
  console.log("FAKE Gotchis NFT Diamond paused tx: ", txPause.hash);
  await txPause.wait();

  return diamond.address;
}
