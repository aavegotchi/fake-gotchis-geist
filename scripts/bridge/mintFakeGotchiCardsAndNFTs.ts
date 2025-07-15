import fs from "fs";
import path from "path";
import { varsForNetwork } from "../../constants";
import { ethers } from "hardhat";
import {
  DATA_DIR,
  MINTED_DIR,
  FGNFTPATH,
  ensureMiscProgress,
} from "./bridgeConstants";
import { getRelayerSigner } from "../helperFunctions";

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
// Maximum NFTs to mint in a single transaction – keep comfortably below block gas limits
const NFT_CHUNK_SIZE = 100;
const NFT_TRACKER_FILE = path.join(MINTED_DIR, "nft_minted_addresses.json");
const CARDS_FILE = path.join(DATA_DIR, "FGCard/fakegotchiCardHolders.json");
const NFTS_FILE = path.join(FGNFTPATH, "fakeGotchisNFTHolders.json");
const PROGRESS_FILE = path.join(MINTED_DIR, "minting_progress.json");
const MINTED_TOKEN_IDS_FILE = path.join(MINTED_DIR, "minted_token_ids.json");
const TOKEN_METADATA_FILE = path.join(FGNFTPATH, "tokenMetadata.json");

// NEW: Unified detailed progress tracking for both Cards and NFTs
// ---------------------------------------------------------------------------

const COMBINED_PROGRESS_FILE = path.join(MINTED_DIR, "fg_minting_details.json");

interface AddressNFTProgress {
  tokenIds: string[];
  timestamp: number;
}

interface AddressCardProgress {
  balance: string; // amount of card tokens minted (tokenId 0)
  timestamp: number;
}

interface CombinedProgress {
  nftAddresses: Record<string, AddressNFTProgress>;
  cardAddresses: Record<string, AddressCardProgress>;
  startTime: number;
}

function loadCombinedProgress(): CombinedProgress {
  try {
    if (fs.existsSync(COMBINED_PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(COMBINED_PROGRESS_FILE, "utf8"));
    }
  } catch (e) {
    console.warn("⚠️  Could not parse combined progress file – starting fresh");
  }
  return { nftAddresses: {}, cardAddresses: {}, startTime: Date.now() };
}

function saveCombinedProgress(progress: CombinedProgress) {
  if (!fs.existsSync(MINTED_DIR)) fs.mkdirSync(MINTED_DIR, { recursive: true });
  fs.writeFileSync(COMBINED_PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function updateCombinedNFT(
  owner: string,
  tokenIds: string[],
  progress: CombinedProgress
) {
  const lower = owner.toLowerCase();
  if (!progress.nftAddresses[lower]) {
    progress.nftAddresses[lower] = { tokenIds: [], timestamp: Date.now() };
  }
  const set = new Set(progress.nftAddresses[lower].tokenIds);
  tokenIds.forEach((id) => set.add(id));
  progress.nftAddresses[lower].tokenIds = Array.from(set);
  progress.nftAddresses[lower].timestamp = Date.now();
  saveCombinedProgress(progress);
}

function updateCombinedCard(
  owner: string,
  balance: string,
  progress: CombinedProgress
) {
  const lower = owner.toLowerCase();
  progress.cardAddresses[lower] = { balance, timestamp: Date.now() };
  saveCombinedProgress(progress);
}

interface TokenBalance {
  tokenId: string;
  balance: string;
}

interface OwnerBalances {
  ownerAddress: string;
  tokenBalances: TokenBalance[];
  metadataId: number;
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

interface NFTMintingTracker {
  mintedAddresses: {
    address: string;
    nfts: TokenBalance[];
    mintedNFTs: string[];
  }[];
  lastProcessedIndex: number;
}

interface TokenStatus {
  trueOwner: string;
  isMinted: boolean;
}

function loadJSON<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function saveJSON(file: string, data: any) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getMetadataIdByTokenId(tokenId: number): number {
  const tokenMetadataArr = JSON.parse(
    fs.readFileSync(TOKEN_METADATA_FILE, "utf8")
  );
  const tokenIdToMetadataId: { [tokenId: number]: number } = {};
  for (const entry of tokenMetadataArr) {
    tokenIdToMetadataId[entry.tokenId] = entry.metadataId;
  }
  const metadataId = tokenIdToMetadataId[tokenId];
  if (metadataId === undefined) {
    console.warn(`No metadataId found for tokenId ${tokenId}`);
    return -1;
  }
  return metadataId;
}

function loadNFTTracker(): NFTMintingTracker {
  if (fs.existsSync(NFT_TRACKER_FILE))
    return loadJSON<NFTMintingTracker>(NFT_TRACKER_FILE);
  return { mintedAddresses: [], lastProcessedIndex: 0 };
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
      const tx = await mintFunction(batch);
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error("Transaction reverted");
      console.log(`Successfully minted ${type} batch ${batchNumber}`);
      return true;
    } catch (error) {
      retries++;
      if (retries > 1 && batch && batch.length > 0) {
        // Debug: log current mintedNFTs and ids about to be minted
        const aboutToMint = batch.flatMap((b: any) =>
          b.tokenBalances.map((nft: any) => nft.tokenId)
        );
        // Try to get mintedNFTs from tracker if available
        let mintedNFTs: string[] = [];
        if (batch[0] && batch[0].ownerAddress) {
          try {
            const tracker = loadNFTTracker();
            const entry = tracker.mintedAddresses.find(
              (m) => m.address === batch[0].ownerAddress
            );
            mintedNFTs = entry?.mintedNFTs || [];
          } catch {}
        }
        console.warn(
          `DEBUG: Retry #${retries} for batch. Minted IDs for address ${batch[0].ownerAddress}:`,
          mintedNFTs
        );
        console.warn(
          `DEBUG: IDs about to be minted in this batch:`,
          aboutToMint
        );
      }
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

function loadMintedTokenIds(): Set<string> {
  if (fs.existsSync(MINTED_TOKEN_IDS_FILE)) {
    return new Set(JSON.parse(fs.readFileSync(MINTED_TOKEN_IDS_FILE, "utf8")));
  }
  return new Set();
}

function saveMintedTokenIds(tokenIds: Set<string>) {
  fs.writeFileSync(
    MINTED_TOKEN_IDS_FILE,
    JSON.stringify([...tokenIds], null, 2)
  );
}

// Add this function to find duplicates in the JSON
function findDuplicateTokenIds(
  holderData: HolderBalances
): Map<string, string[]> {
  const tokenOccurrences = new Map<string, string[]>();

  for (const [address, data] of Object.entries(holderData)) {
    for (const token of data.tokenBalances) {
      const tokenId = token.tokenId;
      if (!tokenOccurrences.has(tokenId)) {
        tokenOccurrences.set(tokenId, [address]);
      } else {
        tokenOccurrences.get(tokenId)!.push(address);
      }
    }
  }

  // Filter to only keep tokens that appear more than once
  const duplicates = new Map<string, string[]>();
  for (const [tokenId, owners] of tokenOccurrences.entries()) {
    if (owners.length > 1) {
      duplicates.set(tokenId, owners);
    }
  }

  return duplicates;
}

async function cleanHolderDataWithTrueOwners(
  holderData: HolderBalances,
  duplicateTokenMap: Map<string, TokenStatus>,
  duplicateTokens: Map<string, string[]>
): Promise<HolderBalances> {
  // Deep copy to avoid mutating original
  const cleanedData: HolderBalances = JSON.parse(JSON.stringify(holderData));

  for (const [tokenId, status] of duplicateTokenMap.entries()) {
    const trueOwner = status.trueOwner;
    const jsonOwners = duplicateTokens.get(tokenId) || [];
    for (const owner of jsonOwners) {
      if (owner !== trueOwner) {
        // Remove token from non-true owners
        if (cleanedData[owner]) {
          cleanedData[owner].tokenBalances = cleanedData[
            owner
          ].tokenBalances.filter((tb) => tb.tokenId !== tokenId);
        }
      }
    }
    // Ensure token is present for true owner
    if (trueOwner && cleanedData[trueOwner]) {
      const alreadyPresent = cleanedData[trueOwner].tokenBalances.some(
        (tb) => tb.tokenId === tokenId
      );
      if (!alreadyPresent) {
        // Find the tokenBalance object from any jsonOwner
        let tokenObj = null;
        for (const owner of jsonOwners) {
          const found = holderData[owner]?.tokenBalances.find(
            (tb) => tb.tokenId === tokenId
          );
          if (found) {
            tokenObj = found;
            break;
          }
        }
        if (tokenObj) {
          cleanedData[trueOwner].tokenBalances.push(tokenObj);
        }
      }
    }
  }
  return cleanedData;
}

async function processNFTHolders(
  holderData: HolderBalances,
  mintFunction: Function,
  progress: MintingProgress
) {
  ensureDir(MINTED_DIR);
  let mintedTokenIds = loadMintedTokenIds();
  // Combined detailed progress object
  const combinedProgress = loadCombinedProgress();
  const contracts = await varsForNetwork(ethers);

  // Connect to Polygon network for owner checks using a read-only provider
  const polygonProvider = new ethers.providers.JsonRpcProvider(
    process.env.MATIC_URL
  );
  const fakeGotchiNFTsPolygon = new ethers.Contract(
    "0xA4E3513c98b30d4D7cc578d2C328Bd550725D1D0",
    ["function ownerOf(uint256 tokenId) view returns (address)"],
    polygonProvider
  );

  // Find duplicate tokens in the JSON
  console.log("Checking for duplicate token IDs in holders data...");
  const duplicateTokens = findDuplicateTokenIds(holderData);
  console.log(`Found ${duplicateTokens.size} duplicate token IDs`);

  // Create mapping for duplicate tokens and their true owners
  const duplicateTokenMap = new Map<string, TokenStatus>();

  // Verify true owners of duplicate tokens on Polygon
  console.log("Verifying true owners of duplicate tokens on Polygon...");
  for (const [tokenId, jsonOwners] of duplicateTokens.entries()) {
    try {
      const owner = await fakeGotchiNFTsPolygon.ownerOf(tokenId);
      duplicateTokenMap.set(tokenId, {
        trueOwner: owner,
        isMinted: owner !== ethers.constants.AddressZero,
      });
      console.log(
        `Token ${tokenId}: JSON owners: ${jsonOwners.join(
          ", "
        )}, Polygon owner: ${owner}`
      );
    } catch (error) {
      // If ownerOf reverts, token is not minted on Polygon
      duplicateTokenMap.set(tokenId, {
        trueOwner: jsonOwners[0], // Default to first owner in JSON
        isMinted: false,
      });
      console.log(
        `Token ${tokenId}: Not minted on Polygon yet, will mint to ${jsonOwners[0]}`
      );
    }
  }

  // Save duplicate token status for reference
  const duplicateStatusFile = path.join(
    MINTED_DIR,
    "duplicate_token_status.json"
  );
  const statusReport = {
    totalDuplicates: duplicateTokenMap.size,
    tokens: Array.from(duplicateTokenMap.entries()).map(
      ([tokenId, status]) => ({
        tokenId,
        trueOwner: status.trueOwner,
        isMinted: status.isMinted,
        jsonOwners: duplicateTokens.get(tokenId),
      })
    ),
  };
  fs.writeFileSync(duplicateStatusFile, JSON.stringify(statusReport, null, 2));
  console.log(`Duplicate token status saved to ${duplicateStatusFile}`);

  // Clean up the holder data so only true owners have the duplicate tokens
  const cleanedHolderData = await cleanHolderDataWithTrueOwners(
    holderData,
    duplicateTokenMap,
    duplicateTokens
  );
  const cleanedJsonPath = path.join(
    FGNFTPATH,
    "fakeGotchisNFTHolders.cleaned.json"
  );
  fs.writeFileSync(cleanedJsonPath, JSON.stringify(cleanedHolderData, null, 2));
  console.log(`Cleaned holders JSON saved to ${cleanedJsonPath}`);

  // Get the contract for minting (on the current network)

  // Use cleanedHolderData for all further processing
  // Create a list of address-tokenCount pairs for smart batching
  const addressTokenCounts = await Promise.all(
    Object.entries(cleanedHolderData).map(async ([addr, data]) => {
      const unmintedTokens = data.tokenBalances.filter((nft) => {
        // Skip if already minted in our tracking
        if (mintedTokenIds.has(nft.tokenId)) return false;

        // Handle duplicate tokens
        if (duplicateTokenMap.has(nft.tokenId)) {
          const status = duplicateTokenMap.get(nft.tokenId)!;
          // Skip if already minted on-chain
          if (status.isMinted) return false;
          // Only include if this address is the true owner
          return status.trueOwner === addr;
        }

        return true;
      });

      return {
        address: addr,
        tokenCount: unmintedTokens.length,
        tokens: unmintedTokens,
        chunks: Math.ceil(unmintedTokens.length / NFT_CHUNK_SIZE),
      };
    })
  );

  // Filter out addresses with no remaining tokens to mint
  const validAddressTokenCounts = addressTokenCounts.filter(
    (addr) => addr.tokenCount > 0
  );

  // Sort by token count in descending order
  validAddressTokenCounts.sort((a, b) => b.tokenCount - a.tokenCount);

  let currentIndex = 0;
  while (currentIndex < validAddressTokenCounts.length) {
    const batch: { address: string; tokens: TokenBalance[] }[] = [];
    let currentBatchTokenCount = 0;

    // Build batch based on total token count
    while (currentIndex < validAddressTokenCounts.length) {
      const nextAddress = validAddressTokenCounts[currentIndex];

      // For addresses with more than NFT_CHUNK_SIZE tokens, process in chunks
      if (nextAddress.tokenCount > NFT_CHUNK_SIZE) {
        // If we have a partial batch, process it first
        if (batch.length > 0) {
          break;
        }

        // Process this address's tokens in chunks
        for (
          let chunkIndex = 0;
          chunkIndex < nextAddress.chunks;
          chunkIndex++
        ) {
          const start = chunkIndex * NFT_CHUNK_SIZE;
          const end = Math.min(
            start + NFT_CHUNK_SIZE,
            nextAddress.tokens.length
          );
          const chunk = nextAddress.tokens.slice(start, end);

          console.log(
            `Processing chunk ${chunkIndex + 1}/${
              nextAddress.chunks
            } for address ${nextAddress.address} (${chunk.length} tokens)`
          );

          const batchData = [
            {
              ownerAddress: nextAddress.address,
              tokenBalances: chunk.map((nft) => ({
                tokenId: nft.tokenId,
                balance: nft.balance,
                metadataId: getMetadataIdByTokenId(Number(nft.tokenId)),
              })),
            },
          ];

          const success = await mintBatchWithRetry(
            batchData,
            mintFunction,
            "NFTs",
            chunkIndex + 1,
            nextAddress.chunks
          );

          if (success) {
            // Update both tracking systems
            const mintedThisChunk = chunk.map((nft) => nft.tokenId);
            mintedThisChunk.forEach((tokenId) => {
              mintedTokenIds.add(tokenId);
              if (duplicateTokenMap.has(tokenId)) {
                duplicateTokenMap.get(tokenId)!.isMinted = true;
              }
            });
            // Record in combined progress
            updateCombinedNFT(
              nextAddress.address,
              mintedThisChunk,
              combinedProgress
            );
            saveMintedTokenIds(mintedTokenIds);
            console.log(
              `Successfully minted chunk ${chunkIndex + 1}/${
                nextAddress.chunks
              } for address ${nextAddress.address}`
            );
          } else {
            console.error(
              `Failed to mint chunk ${chunkIndex + 1} for address ${
                nextAddress.address
              }`
            );
          }
        }

        currentIndex++;
        continue;
      }

      // For normal addresses, try to combine them into batches
      if (currentBatchTokenCount + nextAddress.tokenCount > NFT_CHUNK_SIZE) {
        break;
      }

      batch.push({ address: nextAddress.address, tokens: nextAddress.tokens });
      currentBatchTokenCount += nextAddress.tokenCount;
      currentIndex++;
    }

    if (batch.length === 0) continue;

    console.log(
      `Processing batch of ${batch.length} addresses with total ${currentBatchTokenCount} tokens`
    );

    // Process the batch
    const batchData = [];
    for (const { address, tokens } of batch) {
      batchData.push({
        ownerAddress: address,
        tokenBalances: tokens.map((nft) => ({
          tokenId: nft.tokenId,
          balance: nft.balance,
          metadataId: getMetadataIdByTokenId(Number(nft.tokenId)),
        })),
      });
    }

    if (batchData.length === 0) continue;

    // Validate batch data
    try {
      batchData.forEach((holder) => {
        holder.tokenBalances.forEach((nft) => {
          if (!nft.tokenId || !nft.balance || nft.metadataId === undefined) {
            throw new Error(
              `Invalid NFT data before mint: ${JSON.stringify(
                nft
              )} for address ${holder.ownerAddress}`
            );
          }
        });
      });
    } catch (error) {
      console.error(`Validation failed for batch:`, error);
      continue;
    }

    const batchNumber = Math.floor(currentIndex / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(validAddressTokenCounts.length / BATCH_SIZE);

    const success = await mintBatchWithRetry(
      batchData,
      mintFunction,
      "NFTs",
      batchNumber,
      totalBatches
    );

    if (success) {
      // Update both tracking systems
      for (const batchItem of batchData) {
        const mintedNow = batchItem.tokenBalances.map((nft) => nft.tokenId);
        mintedNow.forEach((tokenId) => {
          mintedTokenIds.add(tokenId);
          if (duplicateTokenMap.has(tokenId)) {
            duplicateTokenMap.get(tokenId)!.isMinted = true;
          }
        });
        updateCombinedNFT(batchItem.ownerAddress, mintedNow, combinedProgress);
      }
      saveMintedTokenIds(mintedTokenIds);
      console.log(`Successfully minted batch of ${batch.length} addresses`);
    } else {
      console.error(
        `Failed to mint batch starting at index ${currentIndex - batch.length}`
      );
      // Don't break, continue with next batch
    }
  }

  // Post-minting check: ensure all minted tokens are tracked
  const allTokenIds = new Set<string>();
  const tokenIdToOwner: Record<string, string> = {};
  for (const owner of Object.keys(cleanedHolderData)) {
    for (const nft of cleanedHolderData[owner].tokenBalances) {
      allTokenIds.add(nft.tokenId);
      tokenIdToOwner[nft.tokenId] = owner;
    }
  }
  const missingFromMinted = Array.from(allTokenIds).filter(
    (id) => !mintedTokenIds.has(id)
  );
  if (missingFromMinted.length > 0) {
    console.warn(
      `WARNING: The following tokenIds are present in the cleaned holders JSON but missing from minted_token_ids.json:`
    );
    console.warn(missingFromMinted);
    // Final catch-all minting pass
    // Group missing tokens by owner
    const missingByOwner: Record<string, string[]> = {};
    for (const tokenId of missingFromMinted) {
      const owner = tokenIdToOwner[tokenId];
      if (!missingByOwner[owner]) missingByOwner[owner] = [];
      missingByOwner[owner].push(tokenId);
    }
    // Mint in batches
    const owners = Object.keys(missingByOwner);
    for (let i = 0; i < owners.length; i += BATCH_SIZE) {
      const batchOwners = owners.slice(i, i + BATCH_SIZE);
      const batchData = [];
      for (const owner of batchOwners) {
        const tokenIds = missingByOwner[owner];
        // Split tokens into chunks if there are too many
        for (let j = 0; j < tokenIds.length; j += NFT_CHUNK_SIZE) {
          const chunk = tokenIds.slice(j, j + NFT_CHUNK_SIZE);
          batchData.push({
            ownerAddress: owner,
            tokenBalances: chunk.map((tokenId) => ({
              tokenId,
              balance: "1",
              metadataId: getMetadataIdByTokenId(Number(tokenId)),
            })),
          });
        }
      }
      if (batchData.length === 0) continue;
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(owners.length / BATCH_SIZE);
      console.log(
        `Catch-all minting: Processing batch ${batchNumber}/${totalBatches} with ${batchData.length} chunks`
      );
      const success = await mintBatchWithRetry(
        batchData,
        mintFunction,
        "NFTs (catch-all)",
        batchNumber,
        totalBatches
      );
      if (success) {
        for (const batchItem of batchData) {
          const newlyMinted = batchItem.tokenBalances.map((nft) => nft.tokenId);
          newlyMinted.forEach((id) => mintedTokenIds.add(id));
          updateCombinedNFT(
            batchItem.ownerAddress,
            newlyMinted,
            combinedProgress
          );
        }
        saveMintedTokenIds(mintedTokenIds);
        console.log(`Catch-all: Successfully minted batch ${batchNumber}`);
      } else {
        console.error(
          `Catch-all: Failed to mint batch starting at owner index ${i}`
        );
      }
    }
    // Re-check after catch-all
    const stillMissing = Array.from(allTokenIds).filter(
      (id) => !mintedTokenIds.has(id)
    );
    if (stillMissing.length > 0) {
      console.error(
        "After catch-all minting, the following tokenIds are STILL missing from minted_token_ids.json:"
      );
      console.error(stillMissing);
    } else {
      console.log(
        "After catch-all minting, all tokenIds in the cleaned holders JSON are present in minted_token_ids.json."
      );
    }
  } else {
    console.log(
      "All tokenIds in the cleaned holders JSON are present in minted_token_ids.json."
    );
  }

  return true;
}

async function processCardHolders(
  holderData: CardHolderBalances,
  mintFunction: Function,
  progress: MintingProgress
) {
  ensureDir(MINTED_DIR);
  const combinedProgress = loadCombinedProgress();
  const remainingData = Object.entries(holderData).reduce(
    (acc: Record<string, any>, [key, value]: [string, any]) => {
      const index = parseInt(key);
      const batchNumber = Math.floor(index / BATCH_SIZE);
      if (!progress.cards.completedBatches.includes(batchNumber))
        acc[key] = value;
      return acc;
    },
    {} as Record<string, any>
  );
  const totalAddresses = Object.values(remainingData).length;
  const totalBatches = Math.ceil(totalAddresses / BATCH_SIZE);
  for (
    let i = progress.cards.lastProcessedIndex;
    i < totalAddresses;
    i += BATCH_SIZE
  ) {
    const batchNumber = Math.floor(i / BATCH_SIZE);
    if (progress.cards.completedBatches.includes(batchNumber)) continue;
    const start = i;
    const end = Math.min(start + BATCH_SIZE, totalAddresses);
    const batch = Object.values(remainingData)
      .slice(start, end)
      .map((item) => ({
        ownerAddress: item.ownerAddress,
        tokenBalances: {
          tokenId: item.tokenBalances[0].tokenId,
          balance: item.tokenBalances[0].balance,
        },
      }));
    const success = await mintBatchWithRetry(
      batch,
      mintFunction,
      "cards",
      batchNumber + 1,
      totalBatches
    );
    if (success) {
      progress.cards.completedBatches.push(batchNumber);
      progress.cards.lastProcessedIndex = i + BATCH_SIZE;
      saveJSON(PROGRESS_FILE, progress);

      // Record per-address balances in combined progress
      batch.forEach((b) => {
        updateCombinedCard(
          b.ownerAddress,
          b.tokenBalances.balance,
          combinedProgress
        );
      });
    } else {
      console.error(
        `Failed to process cards batch starting at index ${i}. Stopping.`
      );
      break;
    }
  }
  return progress.cards.lastProcessedIndex >= totalAddresses;
}

async function main() {
  // Ensure metadata has been generated before minting NFTs
  ensureMiscProgress("writeFGNFTMetadata");

  //@ts-ignore
  const deployer = await getRelayerSigner(hre);
  const contracts = await varsForNetwork(ethers);

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

  ensureDir(DATA_DIR);

  let progress: MintingProgress = {
    cards: { completedBatches: [], lastProcessedIndex: 0 },
    nfts: { completedBatches: [], lastProcessedIndex: 0 },
  };

  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      progress = loadJSON<MintingProgress>(PROGRESS_FILE);
      console.log("Resuming from previous run");
    } catch (err) {
      console.warn("Could not parse progress file – starting fresh", err);
    }
  }

  const cardData: CardHolderBalances = loadJSON(CARDS_FILE);
  const cardsComplete = await processCardHolders(
    cardData,
    fakeGotchiCards.massMint,
    progress
  );

  const nftData: HolderBalances = loadJSON(NFTS_FILE);
  const nftsComplete = await processNFTHolders(
    nftData,
    fakeGotchiNFTs.mintBatch,
    progress
  );

  const mintedTokenIds = loadMintedTokenIds();
  console.log(`Total NFT tokenIds minted: ${mintedTokenIds.size}`);

  if (cardsComplete && nftsComplete) {
    console.log("All minting completed successfully!");
  } else {
    console.log("Process incomplete. Re-run script to continue.");
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error in minting script", err);
    process.exit(1);
  });
}
