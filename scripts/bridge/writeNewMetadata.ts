import fs from "fs";
import { ethers } from "hardhat";
import { varsForNetwork } from "../../constants";
import { getRelayerSigner } from "../helperFunctions";

// ---------------- Types ----------------
interface GotchiNFTMetadata {
  publisher: string;
  royalty: [number, number];
  editions: number;
  flagCount: number;
  likeCount: number;
  artist: string;
  createdAt: number;
  status: number;
  minted: boolean;
  name: string;
  description: string;
  externalLink: string;
  artistName: string;
  publisherName: string;
  fileHash: string;
  fileType: string;
  thumbnailHash: string;
  thumbnailType: string;
}

interface GotchiNFTMetadataTuple extends Array<number | GotchiNFTMetadata> {
  0: number;
  1: GotchiNFTMetadata;
}

// ---------------- Main ----------------
async function writeNewMetadata(): Promise<void> {
  // Grab network-specific addresses (fakeGotchiArt etc.)
  const c = await varsForNetwork(ethers);

  // Load the fresh metadata that needs to be bridged / written
  const raw: GotchiNFTMetadataTuple[] = JSON.parse(
    fs.readFileSync("scripts/bridge/newCorrectData.json", "utf8")
  );
  const ids = raw.map((t) => t[0]);
  const metadata = raw.map((t) => t[1] as GotchiNFTMetadata);

  // Use the relayer / default signer for the current network
  // @ts-ignore – hre is injected by Hardhat when the script is executed with `npx hardhat run`
  //NOTE: set to the new signer

  const signer = await getRelayerSigner(hre);

  const metadataFacet = await ethers.getContractAt(
    "MetadataFacet",
    c.fakeGotchiArt,
    signer
  );

  console.log(`Writing ${ids.length} new metadata entries…`);
  const tx = await metadataFacet.batchWriteMetadata(ids, metadata);
  await tx.wait();
  console.log(`✅ Metadata written (tx: ${tx.hash})`);

  console.log("Updating metadataIdCounter to 514…");
  const tx2 = await metadataFacet.setMetadataIdCounter(514);
  await tx2.wait();
  console.log(`✅ metadataIdCounter set (tx: ${tx2.hash})`);
}

if (require.main === module) {
  writeNewMetadata().catch((err) => {
    console.error("Fatal error in writeNewMetadata", err);
    process.exit(1);
  });
}
