import path from "path";
import fs from "fs";

export const BRIDGE_DIR = __dirname;
export const DATA_DIR = path.join(BRIDGE_DIR, "cloneData");
export const MINTED_DIR = path.join(BRIDGE_DIR, "processed");
export const FGNFTPATH = path.join(DATA_DIR, "FGNFT");
export const FGCARDPATH = path.join(DATA_DIR, "FGCard");
export const MISC_FILE = path.join(MINTED_DIR, "miscProgress.json");

interface MiscFlags {
  writeFGNFTMetadata: boolean;
}

export type miscType = keyof MiscFlags;

export function writeMiscProgress(type: miscType, value: boolean) {
  //create file if it doesn't exist
  if (!fs.existsSync(MISC_FILE)) {
    fs.writeFileSync(MISC_FILE, JSON.stringify({}));
  }
  const progress: MiscFlags = JSON.parse(fs.readFileSync(MISC_FILE, "utf8"));
  progress[type] = value;
  fs.writeFileSync(MISC_FILE, JSON.stringify(progress, null, 2));
}

export function ensureMiscProgress(type: miscType) {
  //ensure it has not been minted
  //read file
  //create file if it doesn't exist
  if (!fs.existsSync(MISC_FILE)) {
    fs.writeFileSync(MISC_FILE, JSON.stringify({}));
  }
  const progress: MiscFlags = JSON.parse(fs.readFileSync(MISC_FILE, "utf8"));
  if (!progress[type]) {
    throw new Error(`${type} has not been written`);
  }
}
