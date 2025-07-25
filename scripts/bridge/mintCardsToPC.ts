import fs from "fs";
import path from "path";
import { ethers } from "hardhat";
import { varsForNetwork } from "../../constants";
import { getRelayerSigner } from "../helperFunctions";
import { MINTED_DIR, PC_WALLET } from "./bridgeConstants";

/******************************************************
 * mintCardsToHolders.ts
 * ----------------------------------------------------
 * Aggregates all Fake Gotchi CARD balances contained in:
 *   – fakegotchiCardContractHolders.json
 *   – fakegotchiCardContractHoldersWithOwners.json
 * and mints the total supply of cardId 0 straight to the
 * PC_WALLET address in a single `FakeGotchisCardFacet.massMint` call.
 *
 * Resumable via processed/card_holder_mint_progress.json.
 ******************************************************/

// -----------------------------------------------------------------------------
// Constants & helper paths
// -----------------------------------------------------------------------------

const DATA_ROOT = path.join(__dirname, "cloneData", "FGCard");
const FILE_DIRECT = path.join(DATA_ROOT, "fakegotchiCardContractHolders.json");
const FILE_WITH_OWNER = path.join(
  DATA_ROOT,
  "fakegotchiCardContractHoldersWithOwners.json"
);

const PROGRESS_FILE = path.join(MINTED_DIR, "card_holder_mint_progress.json");

interface ProgressData {
  completed: boolean;
  mintedBalance: string; // balance minted (stringified number)
  txHash?: string;
}

function loadProgress(): ProgressData | null {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    } catch {
      /* empty */
    }
  }
  return null;
}

function saveProgress(data: ProgressData) {
  if (!fs.existsSync(MINTED_DIR)) fs.mkdirSync(MINTED_DIR, { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

// -----------------------------------------------------------------------------
// Types corresponding to JSON schemas
// -----------------------------------------------------------------------------

interface TokenBalance {
  tokenId: string;
  balance: number | string;
}

interface DirectEntry {
  ownerAddress: string;
  tokenBalances: TokenBalance[];
}

interface NestedEntry {
  contractOwner: string;
  tokens: {
    ownerAddress: string;
    tokenBalances: TokenBalance[];
  };
}

function loadJSON<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function bigIntAdd(acc: bigint, value: number | string): bigint {
  return acc + BigInt(value);
}

async function mintWithRetry(
  formattedBatch: any[],
  mintFn: Function,
  description: string,
  maxRetries = 3
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const tx = await mintFn(formattedBatch);
      const receipt = await tx.wait(1);
      if (receipt.status !== 1) throw new Error("Transaction reverted");
      console.log(`✅ ${description} – tx: ${receipt.transactionHash}`);
      return receipt.transactionHash;
    } catch (err) {
      console.warn(
        `⚠️  Attempt ${attempt}/${maxRetries} failed for ${description}:`,
        (err as any)?.reason || err
      );
      if (attempt === maxRetries) throw err;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
    }
  }
  throw new Error("mintWithRetry exceeded retries");
}

async function run() {
  // Check progress – exit early if already completed
  const existing = loadProgress();
  if (existing?.completed) {
    console.log(
      `🎉 Card holder mint already completed with balance ${existing.mintedBalance}. Tx: ${existing.txHash}`
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // 1. Aggregate balances across both files
  // ---------------------------------------------------------------------------
  let totalBalance = BigInt(0);

  if (fs.existsSync(FILE_DIRECT)) {
    const entries: DirectEntry[] = loadJSON(FILE_DIRECT);
    for (const entry of entries) {
      for (const tb of entry.tokenBalances) {
        totalBalance = bigIntAdd(totalBalance, tb.balance);
      }
    }
  }

  if (fs.existsSync(FILE_WITH_OWNER)) {
    const entries: NestedEntry[] = loadJSON(FILE_WITH_OWNER);
    for (const entry of entries) {
      for (const tb of entry.tokens.tokenBalances) {
        totalBalance = bigIntAdd(totalBalance, tb.balance);
      }
    }
  }

  if (totalBalance === BigInt(0)) {
    console.log("No card balances found – nothing to mint.");
    return;
  }

  console.log(
    `Total card balance to mint: ${totalBalance.toString()} to PC_WALLET (${PC_WALLET})`
  );

  // ---------------------------------------------------------------------------
  // 2. Prepare blockchain interaction
  // ---------------------------------------------------------------------------
  const contracts = await varsForNetwork(ethers);
  //@ts-ignore – hre injected
  const signer = await getRelayerSigner(hre);
  const fakeGotchiCards = await ethers.getContractAt(
    "FakeGotchisCardFacet",
    contracts.fakeGotchiCards,
    signer
  );

  const formatted = [
    {
      ownerAddress: PC_WALLET,
      tokenBalances: {
        tokenId: 0, // card ID is always 0 for first series
        balance: totalBalance.toString(),
      },
    },
  ];

  // ---------------------------------------------------------------------------
  // 3. Mint with retry and save progress
  // ---------------------------------------------------------------------------
  try {
    const txHash = await mintWithRetry(
      formatted,
      fakeGotchiCards.massMint,
      `${totalBalance.toString()} Cards to PC_WALLET`
    );

    saveProgress({
      completed: true,
      mintedBalance: totalBalance.toString(),
      txHash,
    });
    console.log(
      "🎉 Successfully minted cards to PC_WALLET and recorded progress."
    );
  } catch (err) {
    console.error("❌ Failed to mint cards to PC_WALLET", err);
    saveProgress({ completed: false, mintedBalance: totalBalance.toString() });
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error("Fatal error in mintCardsToHolders", err);
    process.exit(1);
  });
}

export { run as mintCardsToHolders };
