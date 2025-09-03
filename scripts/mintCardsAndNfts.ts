import { ethers } from "hardhat";
import { getLedgerSigner } from "./helperFunctions";
import { varsForNetwork } from "../constants";
import { PC_WALLET } from "./bridge/bridgeConstants";

async function main() {
  const signer = await getLedgerSigner(ethers);
  const to = "0xa540A85FAD845Fc76A9C9A13C96AE1B1fA12EA07";
  const c = await varsForNetwork(ethers);

  const Card = await ethers.getContractAt(
    "FakeGotchisCardFacet",
    c.fakeGotchiCards,
    signer
  );

  //we consolidate balances of 0x6dE972a12eBee5866F1FF4dBbe8Aec2e2D5273E9 and 0x07A89588499Df7ea3a9d128BC8796b11361fbFF2

  //send 3 cards t
  let tx = await Card.safeTransferFrom(PC_WALLET, to, 0, 3, "0x");
  await tx.wait();
  console.log("Card transferred to:", to);

  //send FakeGotchisNfts to the to address
  const fgNfts = [
    {
      tokenId: "16728",
      balance: 1,
    },
    {
      tokenId: "16729",
      balance: 1,
    },
    {
      tokenId: "16730",
      balance: 1,
    },
    {
      tokenId: "16731",
      balance: 1,
    },
    {
      tokenId: "16732",
      balance: 1,
    },
    {
      tokenId: "16733",
      balance: 1,
    },
    {
      tokenId: "16734",
      balance: 1,
    },
    {
      tokenId: "16735",
      balance: 1,
    },
    {
      tokenId: "16736",
      balance: 1,
    },
    {
      tokenId: "16737",
      balance: 1,
    },
    {
      tokenId: "16738",
      balance: 1,
    },
    {
      tokenId: "16739",
      balance: 1,
    },
    {
      tokenId: "16740",
      balance: 1,
    },
    {
      tokenId: "16741",
      balance: 1,
    },
    {
      tokenId: "16742",
      balance: 1,
    },
    {
      tokenId: "16743",
      balance: 1,
    },
    {
      tokenId: "16744",
      balance: 1,
    },
    {
      tokenId: "16745",
      balance: 1,
    },
    {
      tokenId: "16746",
      balance: 1,
    },
    {
      tokenId: "16747",
      balance: 1,
    },
    {
      tokenId: "16748",
      balance: 1,
    },
    {
      tokenId: "16749",
      balance: 1,
    },
    {
      tokenId: "16750",
      balance: 1,
    },
    {
      tokenId: "16751",
      balance: 1,
    },
    {
      tokenId: "16752",
      balance: 1,
    },
    {
      tokenId: "16753",
      balance: 1,
    },
    {
      tokenId: "16754",
      balance: 1,
    },
    {
      tokenId: "16755",
      balance: 1,
    },
    {
      tokenId: "16756",
      balance: 1,
    },
    {
      tokenId: "16758",
      balance: 1,
    },
    {
      tokenId: "16759",
      balance: 1,
    },
    {
      tokenId: "16760",
      balance: 1,
    },
    {
      tokenId: "16762",
      balance: 1,
    },
    {
      tokenId: "16763",
      balance: 1,
    },
    {
      tokenId: "16764",
      balance: 1,
    },
    {
      tokenId: "16765",
      balance: 1,
    },
    {
      tokenId: "16766",
      balance: 1,
    },
    {
      tokenId: "16768",
      balance: 1,
    },
    {
      tokenId: "16769",
      balance: 1,
    },
    {
      tokenId: "16770",
      balance: 1,
    },
    {
      tokenId: "16771",
      balance: 1,
    },
    {
      tokenId: "16772",
      balance: 1,
    },
    {
      tokenId: "16773",
      balance: 1,
    },
  ];

  const fgNFTContract = await ethers.getContractAt(
    "FakeGotchisNFTFacet",
    c.fakeGotchiArt,
    signer
  );

  tx = await fgNFTContract.safeBatchTransfer(
    PC_WALLET,
    to,
    fgNfts.map((nft) => nft.tokenId),
    "0x"
  );
  await tx.wait();
  console.log("FakeGotchisNFT transferred to:", to);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
