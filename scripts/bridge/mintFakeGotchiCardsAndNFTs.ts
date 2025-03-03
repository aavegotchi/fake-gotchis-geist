import fs from "fs";
import path from "path";
import { varsForNetwork } from "../../constants";
import { ethers } from "hardhat";

interface TokenBalance {
  tokenId: string;
  balance: string;
}

interface OwnerBalances {
  ownerAddress: string;
  tokenBalances: TokenBalance[];
}

interface OwnerBalancesCard {
  ownerAddress: string;
  tokenBalances: TokenBalance;
}

interface HolderBalances {
  [ownerAddress: string]: OwnerBalances;
}

interface CardHolderBalances {
  [ownerAddress: string]: OwnerBalancesCard;
}

export const DATA_DIR = `${__dirname}/data`;
const MINTED_DIR = `${__dirname}/minted`;
const CARDS_FILE = `${DATA_DIR}/fakeGotchiCardHolders.json`;
const NFTS_FILE = `${DATA_DIR}/fakeGotchisNFTHolders.json`;
const PROGRESS_FILE = path.join(MINTED_DIR, "minting_progress.json");

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

interface MintingProgress {
  cards: {
    completedBatches: number[];
    lastProcessedIndex: number;
  };
  nfts: {
    completedBatches: number[];
    lastProcessedIndex: number;
  };
}

async function mintBatchWithRetry(
  batch: any[],
  mintFunction: Function,
  type: string,
  batchNumber: number,
  totalBatches: number
): Promise<boolean> {
  let retries = 0;
  while (retries <= MAX_RETRIES) {
    try {
      console.log(`Minting ${type} batch ${batchNumber} of ${totalBatches}`);
      //uncomment to send txn
      // await mintFunction(batch);
      console.log(`Successfully minted ${type} batch ${batchNumber}`);
      return true;
    } catch (error) {
      retries++;
      if (retries > MAX_RETRIES) {
        console.error(
          `Failed to mint ${type} batch ${batchNumber} after ${MAX_RETRIES} retries:`,
          error
        );
        return false;
      }
      console.warn(
        `Attempt ${retries}/${MAX_RETRIES} failed for ${type} batch ${batchNumber}. Retrying...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * Math.pow(2, retries))
      );
    }
  }
  return false;
}

async function processHolders(
  holderData: any,
  mintFunction: Function,
  type: "cards" | "NFTs",
  progress: MintingProgress
) {
  if (!fs.existsSync(MINTED_DIR)) {
    fs.mkdirSync(MINTED_DIR, { recursive: true });
  }

  const progressKey = type.toLowerCase() as keyof MintingProgress;
  const remainingData = Object.entries(holderData).reduce(
    (acc: Record<string, any>, [key, value]: [string, any]) => {
      const index = parseInt(key);
      const batchNumber = Math.floor(index / BATCH_SIZE);
      if (!progress[progressKey].completedBatches.includes(batchNumber)) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, any>
  );

  const totalAddresses = Object.values(remainingData).length;
  const totalBatches = Math.ceil(totalAddresses / BATCH_SIZE);

  console.log(
    `Processing ${totalAddresses} addresses in ${totalBatches} batches of ${BATCH_SIZE} for ${type}`
  );

  for (
    let i = progress[progressKey].lastProcessedIndex;
    i < totalAddresses;
    i += BATCH_SIZE
  ) {
    const batchNumber = Math.floor(i / BATCH_SIZE);

    if (progress[progressKey].completedBatches.includes(batchNumber)) {
      console.log(
        `Skipping already completed ${type} batch ${batchNumber + 1}`
      );
      continue;
    }

    const start = i;
    const end = Math.min(start + BATCH_SIZE, totalAddresses);
    const batch = Object.values(remainingData)
      .slice(start, end)
      .map((item) => {
        if (type === "cards") {
          return {
            ownerAddress: item.ownerAddress,
            tokenBalances: item.tokenBalances[0],
          };
        }
        return item;
      });

    const success = await mintBatchWithRetry(
      batch,
      mintFunction,
      type,
      batchNumber + 1,
      totalBatches
    );

    if (success) {
      progress[progressKey].completedBatches.push(batchNumber);
      progress[progressKey].lastProcessedIndex = i + BATCH_SIZE;
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    } else {
      console.error(
        `Failed to process ${type} batch starting at index ${i}. Stopping.`
      );
      break;
    }
  }

  return progress[progressKey].lastProcessedIndex >= totalAddresses;
}

async function main() {
  const contracts = await varsForNetwork(ethers);

  const fakeGotchiCards = await ethers.getContractAt(
    "FakeGotchisCardFacet",
    contracts.fakeGotchiCards
  );
  const fakeGotchiNFTs = await ethers.getContractAt(
    "MetadataFacet",
    contracts.fakeGotchiArt
  );

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let progress: MintingProgress = {
    cards: { completedBatches: [], lastProcessedIndex: 0 },
    nfts: { completedBatches: [], lastProcessedIndex: 0 },
  };

  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
      console.log("Resuming from previous run");
    } catch (error) {
      console.warn(
        "Could not parse progress file, starting from beginning:",
        error
      );
    }
  }

  const cardData: CardHolderBalances = JSON.parse(
    fs.readFileSync(CARDS_FILE, "utf8")
  );
  const cardsComplete = await processHolders(
    cardData,
    fakeGotchiCards.massMint,
    "cards",
    progress
  );

  const nftData: HolderBalances = JSON.parse(
    fs.readFileSync(NFTS_FILE, "utf8")
  );
  const nftsComplete = await processHolders(
    nftData,
    fakeGotchiNFTs.mintBatch,
    "NFTs",
    progress
  );

  if (cardsComplete && nftsComplete) {
    console.log("All minting completed successfully!");
    // if (fs.existsSync(PROGRESS_FILE)) {
    //   fs.unlinkSync(PROGRESS_FILE);
    //   console.log("Cleaned up progress tracking file.");
    // }
  } else {
    console.log(
      "Process incomplete. Run the script again to continue from where it left off."
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Error in main process:", error);
    process.exit(1);
  });
}
