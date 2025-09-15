//@ts-ignore
import { Signer } from "@ethersproject/abstract-signer";
import { deployCardDiamond } from "./card/deploy";
import { deployNftDiamond } from "./nft/deploy";
import { ethers, network } from "hardhat";
import { getRelayerSigner, saveDeployedDiamonds } from "./helperFunctions";

export async function deployDiamonds() {
  const fakeGotchisCardDiamond = await deployCardDiamond();
  const fakeGotchisNftDiamond = await deployNftDiamond(fakeGotchisCardDiamond);

  //@ts-ignore
  const deployer = await getRelayerSigner(hre);

  const fakeGotchiCardFacet = await ethers.getContractAt(
    "FakeGotchisCardFacet",
    fakeGotchisCardDiamond,
    deployer
  );

  await (
    await fakeGotchiCardFacet.setFakeGotchisNftAddress(fakeGotchisNftDiamond)
  ).wait();

  // Get chainId from provider
  const chainId = network.config.chainId!;

  // Save deployed diamond addresses
  saveDeployedDiamonds(chainId, {
    fakeGotchisNFT: fakeGotchisNftDiamond,
    fakeGotchisCard: fakeGotchisCardDiamond,
  });

  return { fakeGotchisCardDiamond, fakeGotchisNftDiamond };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployDiamonds()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
