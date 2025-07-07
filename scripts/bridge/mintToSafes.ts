import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { varsForNetwork } from "../../constants";
import { deploySafe } from "./deploySafe";
import { DATA_DIR, MINTED_DIR } from "./bridgeConstants";
import { getRelayerSigner } from "../helperFunctions";

// File paths
const NFT_SAFES_FILE = path.join(DATA_DIR, "FGNFT", "gotchisNFTSafe.json");
const CARD_SAFES_FILE = path.join(DATA_DIR, "FGCard", "gotchiCardsSafe.json");
const PROGRESS_FILE = path.join(MINTED_DIR, "safe_minting_progress.json");
const FAILED_SAFES_FILE = path.join(
  MINTED_DIR,
  "failed_safes_with_assets.json"
);
const TOKEN_METADATA_FILE = path.join(DATA_DIR, "FGNFT", "tokenMetadata.json");

// Constants
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const NFT_CHUNK_SIZE = 50; // Maximum NFTs to mint in a single transaction

interface TokenBalance {
  tokenId: string;
  balance: string;
}

interface SafeDetails {
  safeAddress: string;
  tokenBalances: TokenBalance[];
}

interface FailedSafeData {
  cards: SafeDetails[];
  nfts: SafeDetails[];
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

function documentFailedSafe(safe: SafeDetails, type: "cards" | "nfts") {
  let failedSafesData: FailedSafeData = { cards: [], nfts: [] };

  if (fs.existsSync(FAILED_SAFES_FILE)) {
    try {
      const fileContent = fs.readFileSync(FAILED_SAFES_FILE, "utf8");
      if (fileContent) {
        failedSafesData = JSON.parse(fileContent);
      }
    } catch (error) {
      console.warn(
        `Could not parse ${FAILED_SAFES_FILE}. It will be overwritten.`
      );
    }
  }

  // Ensure arrays exist
  if (!failedSafesData.cards) failedSafesData.cards = [];
  if (!failedSafesData.nfts) failedSafesData.nfts = [];

  // Check for duplicates before adding
  const alreadyExists = failedSafesData[type].some(
    (s) => s.safeAddress === safe.safeAddress
  );

  if (!alreadyExists) {
    failedSafesData[type].push(safe);
    fs.writeFileSync(
      FAILED_SAFES_FILE,
      JSON.stringify(failedSafesData, null, 2)
    );
    console.log(
      `Documented failed safe ${safe.safeAddress} with its assets in ${FAILED_SAFES_FILE}.`
    );
  }
}

// Load and build tokenId -> metadataId map (same logic as mintFakeGotchiCardsAndNFTs.ts)
const tokenMetadataArr = JSON.parse(
  fs.readFileSync(TOKEN_METADATA_FILE, "utf8")
);
const tokenIdToMetadataId: { [tokenId: number]: number } = {};
for (const entry of tokenMetadataArr) {
  tokenIdToMetadataId[entry.tokenId] = entry.metadataId;
}

function getMetadataIdByTokenId(tokenId: number): number {
  const metadataId = tokenIdToMetadataId[tokenId];
  if (metadataId === undefined) {
    console.warn(`No metadataId found for tokenId ${tokenId}`);
    return -1;
  }
  return metadataId;
}

function splitNFTsIntoChunks(nfts: TokenBalance[], chunkSize: number) {
  const chunks = [];
  for (let i = 0; i < nfts.length; i += chunkSize) {
    chunks.push(nfts.slice(i, i + chunkSize));
  }
  return chunks;
}

async function mintWithRetry(
  safe: SafeDetails,
  mintFunction: Function,
  type: string,
  retryCount = 0
): Promise<boolean> {
  try {
    console.log(`Minting ${type} to safe ${safe.safeAddress}`);

    // Format tokenBalances for the contract
    let formattedBalances;
    if (type === "cards") {
      // For cards, each safe has a single token balance
      if (
        !safe.tokenBalances ||
        !Array.isArray(safe.tokenBalances) ||
        safe.tokenBalances.length === 0
      ) {
        throw new Error(
          `Invalid tokenBalances for cards: ${JSON.stringify(
            safe.tokenBalances
          )}`
        );
      }
      // Format according to MintData struct: { ownerAddress, tokenBalances: { tokenId: 0, balance } }
      formattedBalances = [
        {
          ownerAddress: safe.safeAddress,
          tokenBalances: {
            tokenId: 0, // Always 0 for cards
            balance: safe.tokenBalances[0].balance,
          },
        },
      ];

      // Uncomment to send transaction
      await mintFunction(formattedBalances);
      console.log(`Successfully minted ${type} to ${safe.safeAddress}`);
      return true;
    } else {
      // For NFTs, format all token balances
      if (!safe.tokenBalances || !Array.isArray(safe.tokenBalances)) {
        throw new Error(
          `Invalid tokenBalances for NFTs: ${JSON.stringify(
            safe.tokenBalances
          )}`
        );
      }

      // Split NFTs into chunks if there are too many
      const nftChunks = splitNFTsIntoChunks(safe.tokenBalances, NFT_CHUNK_SIZE);
      console.log(
        `Processing ${safe.tokenBalances.length} NFTs in ${nftChunks.length} chunks for safe ${safe.safeAddress}`
      );

      for (const [chunkIndex, chunk] of nftChunks.entries()) {
        console.log(
          `Processing chunk ${chunkIndex + 1}/${nftChunks.length} for safe ${
            safe.safeAddress
          }`
        );

        // Format according to MintBatchInput struct: { ownerAddress, tokenBalances: [{ tokenId, balance, metadataId }] }
        formattedBalances = [
          {
            ownerAddress: safe.safeAddress,
            tokenBalances: chunk.map((balance: TokenBalance) => {
              const metadataId = getMetadataIdByTokenId(
                Number(balance.tokenId)
              );
              if (metadataId === -1) {
                throw new Error(
                  `Missing metadataId for tokenId ${balance.tokenId}`
                );
              }
              return {
                tokenId: balance.tokenId,
                balance: balance.balance,
                metadataId,
              };
            }),
          },
        ];

        // Uncomment to send transaction
        await mintFunction(formattedBalances);
        console.log(
          `Successfully processed chunk ${chunkIndex + 1} for safe ${
            safe.safeAddress
          }`
        );
      }

      console.log(`Successfully minted all NFTs to ${safe.safeAddress}`);
      return true;
    }
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

  // First, try to process failed safes
  const failedSafes = safes.filter((safe) =>
    progress[type].failedSafes.includes(safe.safeAddress)
  );

  if (failedSafes.length > 0) {
    console.log(`\nRetrying ${failedSafes.length} failed safes for ${type}...`);
    for (const safe of failedSafes) {
      console.log(`\nRetrying safe ${safe.safeAddress}`);
      // Check/deploy safe first
      const deployedSafe = await deploySafe(safe.safeAddress);
      if (
        !deployedSafe &&
        network.name !== "localhost" &&
        network.name !== "hardhat"
      ) {
        console.log(
          `Safe deployment failed for ${safe.safeAddress}, skipping...`
        );
        // The safe is already in the failed list, but we ensure its assets are documented.
        documentFailedSafe(safe, type);
        continue;
      }

      // Proceed with minting
      const success = await mintWithRetry(safe, mintFunction, type);
      if (success) {
        // Remove from failed safes and add to completed
        progress[type].failedSafes = progress[type].failedSafes.filter(
          (addr) => addr !== safe.safeAddress
        );
        progress[type].completedSafes.push(safe.safeAddress);
        progress[type].totalMinted += safe.tokenBalances.length;
        updateProgress(progress, type, safe, true);
      }
    }
  }

  // Then process remaining safes
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
    if (
      !deployedSafe &&
      network.name !== "localhost" &&
      network.name !== "hardhat"
    ) {
      console.log(
        `Skipping ${type} minting for failed safe ${safe.safeAddress}`
      );
      documentFailedSafe(safe, type);
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
  //@ts-ignore
  const deployer = await getRelayerSigner(hre);
  const fakeGotchiCards = await ethers.getContractAt(
    "FakeGotchisCardFacet",
    contracts.fakeGotchiCards,
    deployer
  );
  const fakeGotchiNFTs = await ethers.getContractAt(
    "MetadataFacet",
    contracts.fakeGotchiArt,
    deployer
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
