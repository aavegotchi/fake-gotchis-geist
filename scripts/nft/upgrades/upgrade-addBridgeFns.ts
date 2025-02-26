import { ethers, run } from "hardhat";
import { varsForNetwork } from "../../../constants";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../../tasks/deployUpgrade";
import { diamondOwner } from "../../helperFunctions";
export const FakeGotchiNFTBalances = `tuple(uint256 tokenId, uint256 balance)`;
export const MintBatchinput = `tuple(
     address ownerAddress,
     ${FakeGotchiNFTBalances}[] tokenBalances,
     )`;

export const Metadata = `(
        address,
            uint16[2],
            uint16,
            uint32,
            uint32,
            address,
            uint40,
            uint8,
            bool,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string
        )`;

export async function upgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "MetadataFacet",
      addSelectors: [
        `function mintBatch((address,(uint256,uint256)[])[])`,
        `function batchWriteMetadata(uint256[],${Metadata}[])`,
      ],
      removeSelectors: [],
    },
  ];
  const joined = convertFacetAndSelectorsToString(facets);

  const c = await varsForNetwork(ethers);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: await diamondOwner(c.fakeGotchiArt, ethers),
    diamondAddress: c.fakeGotchiArt,
    facetsAndAddSelectors: joined,
    useLedger: false,
    useMultisig: false,
  };

  await run("deployUpgrade", args);
}

if (require.main === module) {
  upgrade()
    .then(() => process.exit(0))
    // .then(() => console.log('upgrade completed') /* process.exit(0) */)
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
