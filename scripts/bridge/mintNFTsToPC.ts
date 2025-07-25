import fs from "fs";
import path from "path";
import { ethers } from "hardhat";
import { varsForNetwork } from "../../constants";
import { getRelayerSigner } from "../helperFunctions";
import { MINTED_DIR, PC_WALLET } from "./bridgeConstants";

/******************************************************
 * mintNFTsToHolders.ts
 * ----------------------------------------------------
 * One-off helper that mints Fake Gotchi NFTs directly
 * to the holder addresses listed in:
 *   – fakeGotchisNFTContractHolders.json
 *   – fakeGotchisNFTContractHoldersWithOwners.json
 *
 * Both JSON files live under scripts/bridge/cloneData/FGNFT/
 * and contain an array of entries.  The first file has:
 *   { ownerAddress, tokenBalances: [{ tokenId, balance }] }
 * The second file nests the relevant data under the "tokens"
 * key: { contractOwner, tokens: { ownerAddress, tokenBalances[] } }
 *
 * The script reads them, merges the data, removes duplicate
 * tokenIds per address, chunks large mints to avoid OOG, and
 * calls MetadataFacet.mintBatch with retries.
 ******************************************************/

// -----------------------------------------------------------------------------
// Constants & helper paths
// -----------------------------------------------------------------------------

const DATA_ROOT = path.join(__dirname, "cloneData", "FGNFT");
const FILE_DIRECT = path.join(DATA_ROOT, "fakeGotchisNFTContractHolders.json");
const FILE_WITH_OWNER = path.join(
  DATA_ROOT,
  "fakeGotchisNFTContractHoldersWithOwners.json"
);

const TOKEN_METADATA_FILE = path.join(DATA_ROOT, "tokenMetadata.json");

const NFT_CHUNK_SIZE = 100; // Max NFTs per tx to stay within gas limits
const MAX_RETRIES = 3;

// Progress file to enable resumability & detailed reporting
const PROGRESS_FILE = path.join(MINTED_DIR, "holder_mint_progress.json");

interface AddressProgress {
  mintedNFTs: string[]; // tokenIds already minted for this address
}

interface ProgressData {
  addresses: Record<string, AddressProgress>;
}

function loadProgress(): ProgressData {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    } catch (e) {
      console.warn("⚠️  Could not parse progress file, starting fresh");
    }
  }
  return { addresses: {} };
}

function saveProgress(data: ProgressData) {
  if (!fs.existsSync(MINTED_DIR)) fs.mkdirSync(MINTED_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

// -----------------------------------------------------------------------------
// Type helpers
// -----------------------------------------------------------------------------

interface TokenBalance {
  tokenId: string;
  balance: string; // always "1" for NFTs but keep type generic
}

interface HolderEntryDirect {
  ownerAddress: string;
  tokenBalances: TokenBalance[];
}

interface HolderEntryNested {
  contractOwner: string; // not used for minting
  tokens: {
    ownerAddress: string;
    tokenBalances: TokenBalance[];
  };
}

// Map ownerAddress → tokenBalances[]
type HolderMap = Record<string, TokenBalance[]>;

// -----------------------------------------------------------------------------
// Utility functions
// -----------------------------------------------------------------------------

function loadJSON<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getMetadataIdMap(): Record<number, number> {
  const arr: { tokenId: number; metadataId: number }[] =
    loadJSON(TOKEN_METADATA_FILE);
  const map: Record<number, number> = {};
  for (const { tokenId, metadataId } of arr) {
    map[tokenId] = metadataId;
  }
  return map;
}

function splitIntoChunks<T>(arr: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

// -----------------------------------------------------------------------------
// Core logic
// -----------------------------------------------------------------------------

async function mintWithRetry(
  formattedBatch: any[],
  mintFn: Function,
  description: string
) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mintFn(formattedBatch);
      console.log(`✅ Minted ${description}`);
      return;
    } catch (err) {
      console.warn(
        `⚠️  Attempt ${attempt}/${MAX_RETRIES} failed for ${description}:`,
        (err as any)?.reason || err
      );
      if (attempt === MAX_RETRIES) throw err;
      // simple exponential back-off
      await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
    }
  }
}

async function run() {
  // ---------------------------------------------------------------------------
  // 1. Build holder → tokens map
  // ---------------------------------------------------------------------------
  const holderMap: HolderMap = { [PC_WALLET]: [] };

  const tokenAssigned = new Set<string>();

  // helper to add tokens while deduplicating tokenIds across the entire batch
  function addTokensToPCWallet(tokens: TokenBalance[]) {
    for (const tb of tokens) {
      if (tokenAssigned.has(tb.tokenId)) continue; // skip duplicates across all sources
      tokenAssigned.add(tb.tokenId);
      holderMap[PC_WALLET].push(tb);
    }
  }

  // a) direct file
  if (fs.existsSync(FILE_DIRECT)) {
    const directEntries: HolderEntryDirect[] = loadJSON(FILE_DIRECT);
    for (const { tokenBalances } of directEntries) {
      addTokensToPCWallet(tokenBalances);
    }
  }

  // b) nested file
  if (fs.existsSync(FILE_WITH_OWNER)) {
    const nestedEntries: HolderEntryNested[] = loadJSON(FILE_WITH_OWNER);
    for (const entry of nestedEntries) {
      const { tokenBalances } = entry.tokens;
      addTokensToPCWallet(tokenBalances);
    }
  }

  // c) GBM file intentionally ignored in this variant – comment out if needed

  // Deduplicate tokenIds per address
  for (const [addr, balances] of Object.entries(holderMap)) {
    const seen = new Set<string>();
    holderMap[addr] = balances.filter((tb) => {
      if (seen.has(tb.tokenId)) return false;
      seen.add(tb.tokenId);
      return true;
    });
  }

  console.log(
    `Loaded ${holderMap[PC_WALLET].length} unique tokenIds destined for PC_WALLET (${PC_WALLET})`
  );

  // ---------------------------------------------------------------------------
  // 2. Prepare blockchain stuff
  // ---------------------------------------------------------------------------
  const contracts = await varsForNetwork(ethers);
  //@ts-ignore – hre is injected by Hardhat at runtime
  const signer = await getRelayerSigner(hre);

  const fakeGotchiNFTs = await ethers.getContractAt(
    "MetadataFacet",
    contracts.fakeGotchiArt,
    signer
  );

  const metadataMap = getMetadataIdMap();

  // ---------------------------------------------------------------------------
  // 2a. Load existing progress for resumability
  // ---------------------------------------------------------------------------
  const progress = loadProgress();

  // ---------------------------------------------------------------------------
  // 3. Iterate over holders and mint
  // ---------------------------------------------------------------------------
  let processed = 0;
  for (const [address, tokens] of Object.entries(holderMap)) {
    // Skip tokens that have already been minted to this address according to progress
    const alreadyMinted = new Set(
      progress.addresses[address]?.mintedNFTs || []
    );
    const pendingTokens = tokens.filter((tb) => !alreadyMinted.has(tb.tokenId));

    if (pendingTokens.length === 0) {
      // Nothing left to mint for this address
      continue;
    }

    // split into manageable chunks
    const chunks = splitIntoChunks(pendingTokens, NFT_CHUNK_SIZE);

    for (const [idx, chunk] of chunks.entries()) {
      const formatted = [
        {
          ownerAddress: address,
          tokenBalances: chunk.map((tb) => ({
            tokenId: tb.tokenId,
            balance: tb.balance,
            metadataId: metadataMap[Number(tb.tokenId)],
          })),
        },
      ];

      const desc = `${chunk.length} NFTs to ${address} (chunk ${idx + 1}/$${
        chunks.length
      })`;
      await mintWithRetry(formatted, fakeGotchiNFTs.mintBatch, desc);

      // Update progress after successful chunk mint
      if (!progress.addresses[address])
        progress.addresses[address] = { mintedNFTs: [] };
      progress.addresses[address].mintedNFTs.push(
        ...chunk.map((tb) => tb.tokenId)
      );
      // Deduplicate in case of retry weirdness
      progress.addresses[address].mintedNFTs = Array.from(
        new Set(progress.addresses[address].mintedNFTs)
      );
      saveProgress(progress);
    }

    processed++;
    if (processed % 10 === 0)
      console.log(`Processed ${processed}/${Object.keys(holderMap).length}`);
  }

  console.log("🎉 All holder mints processed successfully");
}

if (require.main === module) {
  run().catch((err) => {
    console.error("Fatal error in mintNFTsToHolders", err);
    process.exit(1);
  });
}

export { run as mintNFTsToHolders };
