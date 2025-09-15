import { upgrade as upgradeNFT } from "./nft/upgrades/upgrade-addBridgeFns";
import { upgrade as upgradeCard } from "./card/upgrades/upgrade-addBridgeFns";

async function main() {
  console.log("Starting NFT Diamond upgrade...");
  await upgradeNFT();
  console.log("NFT Diamond upgrade completed");

  console.log("\nStarting Card Diamond upgrade...");
  await upgradeCard();
  console.log("Card Diamond upgrade completed");

  console.log("\nAll upgrades completed successfully!");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Error in upgrade process:", error);
      process.exit(1);
    });
}
