import fs from "fs";
import path from "path";
import { ethers } from "hardhat";
import { varsForNetwork } from "../../constants";
import { deploySafe } from "./deploySafe";
import { DATA_DIR, MINTED_DIR } from "./bridgeConstants";

// File paths
const NFT_SAFES_FILE = path.join(DATA_DIR, "FGNFT", "gotchisNFTSafe.json");
const CARD_SAFES_FILE = path.join(DATA_DIR, "FGCard", "gotchiCardsSafe.json");
const PROGRESS_FILE = path.join(MINTED_DIR, "safe_minting_progress.json");

// Constants
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

interface TokenBalance {
  tokenId: string;
  balance: string;
}

interface SafeDetails {
  safeAddress: string;
  tokenBalances: TokenBalance[];
}

interface MintingProgress {
  cards: {
    completedSafes: string[];
    failedSafes: string[];
    totalMinted: number;
  };
  nfts: {
    completedSafes: string[];
    failedSafes: string[];
    totalMinted: number;
  };
  analytics: {
    startTime: number;
    lastUpdateTime: number;
    totalProcessed: number;
    successRate: number;
  };
}

async function mintWithRetry(
  safe: SafeDetails,
  mintFunction: Function,
  type: string,
  retryCount = 0
): Promise<boolean> {
  try {
    console.log(`Minting ${type} to safe ${safe.safeAddress}`);
    // Uncomment to send transaction
    // await mintFunction(safe.safeAddress, safe.tokenBalances);
    console.log(`Successfully minted ${type} to ${safe.safeAddress}`);
    return true;
  } catch (error) {
    if (retryCount >= MAX_RETRIES) {
      console.error(
        `Failed to mint ${type} to ${safe.safeAddress} after ${MAX_RETRIES} retries:`,
        error
      );
      return false;
    }
    console.warn(
      `Attempt ${retryCount + 1}/${MAX_RETRIES} failed for ${type} to ${
        safe.safeAddress
      }. Retrying...`
    );
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 * Math.pow(2, retryCount))
    );
    return mintWithRetry(safe, mintFunction, type, retryCount + 1);
  }
}

function updateProgress(
  progress: MintingProgress,
  type: "cards" | "nfts",
  safe: SafeDetails,
  success: boolean
) {
  if (success) {
    progress[type].completedSafes.push(safe.safeAddress);
    progress[type].totalMinted += safe.tokenBalances.length;
  } else {
    progress[type].failedSafes.push(safe.safeAddress);
  }

  progress.analytics.lastUpdateTime = Date.now();
  progress.analytics.totalProcessed++;
  progress.analytics.successRate =
    (progress[type].completedSafes.length /
      (progress[type].completedSafes.length +
        progress[type].failedSafes.length)) *
    100;

  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function processSafes(
  safes: SafeDetails[],
  mintFunction: Function,
  type: "cards" | "nfts",
  progress: MintingProgress
) {
  console.log(`Processing ${safes.length} safes for ${type}...`);

  for (const safe of safes) {
    // Skip if already processed
    if (
      progress[type].completedSafes.includes(safe.safeAddress) ||
      progress[type].failedSafes.includes(safe.safeAddress)
    ) {
      console.log(`Skipping already processed safe ${safe.safeAddress}`);
      continue;
    }

    // Check/deploy safe first
    const deployedSafe = await deploySafe(safe.safeAddress);
    if (!deployedSafe) {
      console.log(
        `Skipping ${type} minting for failed safe ${safe.safeAddress}`
      );
      updateProgress(progress, type, safe, false);
      continue;
    }

    // Proceed with minting
    const success = await mintWithRetry(safe, mintFunction, type);
    updateProgress(progress, type, safe, success);
  }

  return progress[type].completedSafes.length === safes.length;
}

async function main() {
  // Ensure minted directory exists
  if (!fs.existsSync(MINTED_DIR)) {
    fs.mkdirSync(MINTED_DIR, { recursive: true });
  }

  // Initialize or load progress
  let progress: MintingProgress = {
    cards: { completedSafes: [], failedSafes: [], totalMinted: 0 },
    nfts: { completedSafes: [], failedSafes: [], totalMinted: 0 },
    analytics: {
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      totalProcessed: 0,
      successRate: 0,
    },
  };

  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    console.log("Resuming from previous run");
  }

  // Get contract instances
  const contracts = await varsForNetwork(ethers);
  const fakeGotchiCards = await ethers.getContractAt(
    "FakeGotchisCardFacet",
    contracts.fakeGotchiCards
  );
  const fakeGotchiNFTs = await ethers.getContractAt(
    "MetadataFacet",
    contracts.fakeGotchiArt
  );

  // Load safe data
  const cardSafes: SafeDetails[] = JSON.parse(
    fs.readFileSync(CARD_SAFES_FILE, "utf8")
  );
  const nftSafes: SafeDetails[] = JSON.parse(
    fs.readFileSync(NFT_SAFES_FILE, "utf8")
  );

  // Process cards
  const cardsComplete = await processSafes(
    cardSafes,
    fakeGotchiCards.massMint,
    "cards",
    progress
  );

  // Process NFTs
  const nftsComplete = await processSafes(
    nftSafes,
    fakeGotchiNFTs.mintBatch,
    "nfts",
    progress
  );

  // Print final summary
  console.log("\nMinting Summary:");
  console.log("Cards:");
  console.log(`- Completed: ${progress.cards.completedSafes.length}`);
  console.log(`- Failed: ${progress.cards.failedSafes.length}`);
  console.log(`- Total Minted: ${progress.cards.totalMinted}`);
  console.log("\nNFTs:");
  console.log(`- Completed: ${progress.nfts.completedSafes.length}`);
  console.log(`- Failed: ${progress.nfts.failedSafes.length}`);
  console.log(`- Total Minted: ${progress.nfts.totalMinted}`);
  console.log(`\nOverall Success Rate: ${progress.analytics.successRate}%`);
  console.log(
    `Total Time: ${(
      (Date.now() - progress.analytics.startTime) /
      1000 /
      60
    ).toFixed(2)} minutes`
  );

  if (cardsComplete && nftsComplete) {
    console.log("\nAll minting completed successfully!");
  } else {
    console.log(
      "\nProcess incomplete. Run the script again to continue from where it left off."
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Error in main process:", error);
    process.exit(1);
  });
}

export { processSafes, MintingProgress };
