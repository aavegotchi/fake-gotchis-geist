import { ethers } from "hardhat";
import { varsForNetwork } from "../../constants";
import { getRelayerSigner } from "../helperFunctions";

async function main() {
  const c = await varsForNetwork(ethers);
  //@ts-ignore
  const signer = await getRelayerSigner(hre);

  //unpause fgcards
  const fgcard = await ethers.getContractAt(
    "FakeGotchisCardFacet",
    c.fakeGotchiCards,
    signer
  );
  const tx = await fgcard.toggleDiamondPause(false);
  await tx.wait();
  console.log("Unpaused fgCards");

  //unpause fgart
  const fgArt = await ethers.getContractAt(
    "MetadataFacet",
    c.fakeGotchiArt,
    signer
  );
  const tx2 = await fgArt.toggleDiamondPause(false);
  await tx2.wait();
  console.log("Unpaused fgArt");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
