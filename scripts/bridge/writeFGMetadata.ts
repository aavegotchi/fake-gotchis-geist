import fs from "fs";
import path from "path";
import { ethers } from "hardhat";
import { varsForNetwork } from "../../constants";
import { FGNFTPATH, MINTED_DIR, writeMiscProgress } from "./bridgeConstants";
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
  status: number;
}

interface GotchiNFTMetadataTuple extends Array<number | GotchiNFTMetadata> {
  0: number;
  1: GotchiNFTMetadata;
}

interface ProgressTracker {
  completedBatches: number[];
  lastProcessedIndex: number;
}

// ---------------- Helpers ----------------
async function writeBatch(
  metadataFacet: any,
  allMetadata: GotchiNFTMetadata[],
  allMetadataIds: string[],
  startIndex: number,
  batchSize: number,
  totalBatches: number,
  maxRetries = 3
): Promise<boolean> {
  const batch = allMetadata.slice(startIndex, startIndex + batchSize);
  const batchIds = allMetadataIds.slice(startIndex, startIndex + batchSize);
  const batchNumber = Math.floor(startIndex / batchSize) + 1;

  console.log(`Writing metadata batch ${batchNumber} / ${totalBatches}`);

  let retries = 0;
  while (retries <= maxRetries) {
    try {
      const tx = await metadataFacet.batchWriteMetadata(batchIds, batch);
      await tx.wait();
      console.log(`✅  Batch ${batchNumber} written`);
      return true;
    } catch (err) {
      retries++;
      if (retries > maxRetries) {
        console.error(`❌  Failed batch ${batchNumber}`, err);
        return false;
      }
      console.warn(`Retry ${retries}/${maxRetries} for batch ${batchNumber}`);
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retries)));
    }
  }
  return false;
}

export async function writeFGNFTMetadata(): Promise<void> {
  const c = await varsForNetwork(ethers);

  const METADATA_FILE = `${FGNFTPATH}/gotchiNFTMetadata.json`;
  const PROGRESS_FILE = path.join(MINTED_DIR, "metadata_progress.json");

  let progress: ProgressTracker = {
    completedBatches: [],
    lastProcessedIndex: 0,
  };
  //create the directory if it doesn't exist
  if (!fs.existsSync(MINTED_DIR)) {
    fs.mkdirSync(MINTED_DIR, { recursive: true });
  }

  // Load existing progress if file exists
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      // Ensure required properties exist with sensible defaults
      if (!Array.isArray(progress.completedBatches))
        progress.completedBatches = [];
      if (typeof progress.lastProcessedIndex !== "number")
        progress.lastProcessedIndex = 0;
      console.log(
        `Resuming metadata write. Last index: ${progress.lastProcessedIndex}`
      );
    } catch {
      console.warn("Could not parse progress file – starting fresh");
    }
  }

  const raw: GotchiNFTMetadataTuple[] = JSON.parse(
    fs.readFileSync(METADATA_FILE, "utf8")
  );
  const allIds = raw.map((t) => t[0].toString());
  const allData = raw.map((t) => t[1] as GotchiNFTMetadata);

  const BATCH_SIZE = 20;
  const totalBatches = Math.ceil(allData.length / BATCH_SIZE);

  //@ts-ignore
  const signer = await getRelayerSigner(hre);
  const metadataFacet = await ethers.getContractAt(
    "MetadataFacet",
    c.fakeGotchiArt,
    signer
  );

  for (
    let i = progress.lastProcessedIndex;
    i < allData.length;
    i += BATCH_SIZE
  ) {
    const batchNumber = Math.floor(i / BATCH_SIZE);
    if (progress.completedBatches.includes(batchNumber)) continue;

    const ok = await writeBatch(
      metadataFacet,
      allData,
      allIds,
      i,
      BATCH_SIZE,
      totalBatches
    );
    if (!ok) throw new Error(`Batch ${batchNumber} failed`);

    progress.completedBatches.push(batchNumber);
    progress.lastProcessedIndex = i + BATCH_SIZE;
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  }

  if (progress.lastProcessedIndex >= allData.length) {
    console.log("✅ All metadata written on-chain");
    writeMiscProgress("writeFGNFTMetadata", true);
  } else {
    console.log("⚠️  Metadata writing incomplete – re-run to continue");
  }
}

if (require.main === module) {
  writeFGNFTMetadata().catch((err) => {
    console.error("Fatal error in writeFGMetadata", err);
    process.exit(1);
  });
}
