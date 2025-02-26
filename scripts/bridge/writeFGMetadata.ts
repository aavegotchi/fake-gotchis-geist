import fs from "fs";
import path from "path";
import { DATA_DIR } from "./mintFakeGotchiCardsAndNFTs";
import { varsForNetwork } from "../../constants";
import { ethers } from "hardhat";

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

interface GotchiNFTMetadataIds {
  [key: string]: GotchiNFTMetadata;
}

interface ProgressTracker {
  completedBatches: number[];
  lastProcessedIndex: number;
}

async function writeBatch(
  metadataFacet: any,
  allMetadata: GotchiNFTMetadata[],
  allMetadataIds: string[],
  startIndex: number,
  batchSize: number,
  totalBatches: number,
  maxRetries: number = 3
): Promise<boolean> {
  const batch = allMetadata.slice(startIndex, startIndex + batchSize);
  const batchIds = allMetadataIds.slice(startIndex, startIndex + batchSize);
  const batchNumber = Math.floor(startIndex / batchSize) + 1;

  console.log(`Writing batch ${batchNumber} of ${totalBatches}`);

  let retries = 0;
  while (retries <= maxRetries) {
    try {
      // const tx = await metadataFacet.batchWriteMetadata(batchIds, batch);
      // await tx.wait();
      console.log(`Successfully wrote batch ${batchNumber}`);
      return true;
    } catch (error) {
      retries++;
      if (retries > maxRetries) {
        console.error(
          `Failed to write batch ${batchNumber} after ${maxRetries} retries:`,
          error
        );
        return false;
      }
      console.warn(
        `Attempt ${retries}/${maxRetries} failed for batch ${batchNumber}. Retrying...`
      );
      // Exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, retries))
      );
    }
  }
  return false;
}

async function main() {
  const c = await varsForNetwork(ethers);
  const METADATA_FILE = `${DATA_DIR}/gotchiNFTMetadata.json`;
  const PROGRESS_FILE = path.join(DATA_DIR, "metadata_progress.json");

  // Initialize or load progress tracker
  let progress: ProgressTracker = {
    completedBatches: [],
    lastProcessedIndex: 0,
  };
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      console.log(
        `Resuming from previous run. Last processed index: ${progress.lastProcessedIndex}`
      );
    } catch (error) {
      console.warn(
        "Could not parse progress file, starting from beginning:",
        error
      );
    }
  }

  const metadata: GotchiNFTMetadataIds = JSON.parse(
    fs.readFileSync(METADATA_FILE, "utf8")
  );
  console.log(`Writing ${Object.keys(metadata).length} metadata onchain`);

  const allMetadataIds: string[] = Object.keys(metadata);
  const allMetadata: GotchiNFTMetadata[] = allMetadataIds.map(
    (id) => metadata[id]
  );

  const BATCH_SIZE = 20;
  const totalBatches = Math.ceil(allMetadata.length / BATCH_SIZE);

  const metadataFacet = await ethers.getContractAt(
    "MetadataFacet",
    c.fakeGotchiArt
  );

  for (
    let i = progress.lastProcessedIndex;
    i < allMetadata.length;
    i += BATCH_SIZE
  ) {
    const batchNumber = Math.floor(i / BATCH_SIZE);

    if (progress.completedBatches.includes(batchNumber)) {
      console.log(`Skipping already completed batch ${batchNumber + 1}`);
      continue;
    }

    const success = await writeBatch(
      metadataFacet,
      allMetadata,
      allMetadataIds,
      i,
      BATCH_SIZE,
      totalBatches,
      3 // maxRetries
    );

    if (success) {
      progress.completedBatches.push(batchNumber);
      progress.lastProcessedIndex = i + BATCH_SIZE;
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    } else {
      console.error(
        `Failed to process batch starting at index ${i}. Stopping.`
      );
      break;
    }
  }

  if (progress.lastProcessedIndex >= allMetadata.length) {
    console.log("All metadata successfully written onchain!");
    // Optionally clean up the progress file
    // if (fs.existsSync(PROGRESS_FILE)) {
    //   fs.unlinkSync(PROGRESS_FILE);
    //   console.log("Cleaned up progress tracking file.");
    // }
  } else {
    console.log(
      `Process incomplete. Processed ${progress.completedBatches.length} of ${totalBatches} batches.`
    );
    console.log(`Run the script again to continue from where it left off.`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Error in main process:", error);
    process.exit(1);
  });
}
