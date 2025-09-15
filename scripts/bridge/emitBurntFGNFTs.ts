import fs from "fs";
import path from "path";
import axios from "axios";
import { ethers } from "hardhat";
import { varsForNetwork } from "../../constants";
import { FGNFTPATH, MINTED_DIR } from "./bridgeConstants";
import { getRelayerSigner } from "../helperFunctions";

interface BurnStat {
  metadata: { id: string };
  burned: string;
}

interface BurnProgress {
  emitted: boolean;
  ids?: number[];
  amounts?: number[];
  startingIds?: number[];
}

const SUBGRAPH_URL = process.env.SUBGRAPH_CORE_MATIC!;
const BURN_PROGRESS_FILE = path.join(MINTED_DIR, "burn_emit_progress.json");

function loadBurnProgress(): BurnProgress {
  if (fs.existsSync(BURN_PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(BURN_PROGRESS_FILE, "utf8"));
  }
  return { emitted: false };
}

function saveBurnProgress(p: BurnProgress) {
  fs.writeFileSync(BURN_PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function buildMetadataToFirstTokenIdMap(): Record<string, number> {
  const file = path.join(FGNFTPATH, "tokenMetadata.json");
  const arr = JSON.parse(fs.readFileSync(file, "utf8"));
  const map: Record<string, number> = {};
  arr.forEach((entry: { tokenId: number; metadataId: number }) => {
    const key = entry.metadataId.toString();
    if (map[key] === undefined || entry.tokenId < map[key]) {
      map[key] = entry.tokenId;
    }
  });
  return map;
}

async function fetchBurnStats(): Promise<{
  ids: number[];
  amounts: number[];
  startingIds: number[];
}> {
  const query = `{
    fakeGotchiStatistics(first: 1000, orderBy: metadata__timestamp) {
      metadata { id }
      burned
    }
  }`;

  const response = await axios.post(SUBGRAPH_URL, { query });
  const stats: BurnStat[] = response.data?.data?.fakeGotchiStatistics || [];
  const ids: number[] = [];
  const amounts: number[] = [];
  const startingIds: number[] = [];

  const metaToFirst = buildMetadataToFirstTokenIdMap();

  stats.forEach((s) => {
    const burnCount = Number(s.burned);

    const metadataId = Number(s.metadata.id);
    ids.push(metadataId);
    amounts.push(burnCount);
    startingIds.push(metaToFirst[metadataId] ?? 0);
  });

  return { ids, amounts, startingIds };
}

export async function emitBurntFGNFTs(): Promise<void> {
  const progress = loadBurnProgress();
  if (progress.emitted) {
    console.log("Burn stats already emitted – skipping.");
    return;
  }

  console.log("Fetching burn statistics from subgraph…");
  const { ids, amounts, startingIds } = await fetchBurnStats();

  //logout starting id for id 326
  console.log("Starting id for id 326:", startingIds[ids.indexOf(326)]);

  console.log(`Found ${ids.length} metadataIds with burns.`);

  if (ids.length === 0) {
    console.log("No burnt tokens – nothing to emit.");
    return;
  }

  //@ts-ignore
  const signer = await getRelayerSigner(hre);
  const contracts = await varsForNetwork(ethers);
  const metaFacet = await ethers.getContractAt(
    "MetadataFacet",
    contracts.fakeGotchiArt,
    signer
  );

  console.log("Emitting burn amounts…");
  const tx = await metaFacet.emitBurnedAmounts(ids, amounts, startingIds);
  console.log("Tx submitted:", tx.hash);
  await tx.wait(1);
  console.log("Tx confirmed.");

  progress.emitted = true;
  progress.ids = ids;
  progress.amounts = amounts;
  progress.startingIds = startingIds;
  saveBurnProgress(progress);
  console.log("Burn progress saved →", BURN_PROGRESS_FILE);
}

if (require.main === module) {
  emitBurntFGNFTs().catch((err) => {
    console.error("Fatal error in emitBurntFGNFTs", err);
    process.exit(1);
  });
}
