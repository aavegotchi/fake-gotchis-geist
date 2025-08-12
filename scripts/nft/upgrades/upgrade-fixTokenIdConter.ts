import { ethers, run } from "hardhat";
import { varsForNetwork } from "../../../constants";
import {
  convertFacetAndSelectorsToString,
  DeployUpgradeTaskArgs,
  FacetsAndAddSelectors,
} from "../../../tasks/deployUpgrade";
import { diamondOwner } from "../../helperFunctions";
import { MetadataFacet__factory } from "../../../typechain-types";
import { MetadataFacetInterface } from "../../../typechain-types/contracts/FakeGotchisNFTDiamond/facets/MetaDataFacet.sol/MetadataFacet";

export async function upgrade() {
  const facets: FacetsAndAddSelectors[] = [
    {
      facetName: "MetadataFacet",
      addSelectors: [
        `function setCurrentTokenId(uint256 _tokenIdCounter) external `,
        `function getCurrentTokenId() external view returns (uint256)`,
      ],
      removeSelectors: [],
    },
  ];

  // await mine();

  const joined = convertFacetAndSelectorsToString(facets);

  const c = await varsForNetwork(ethers);

  // console.log("c:", c);
  let iface: MetadataFacetInterface = new ethers.utils.Interface(
    MetadataFacet__factory.abi
  ) as MetadataFacetInterface;
  const calldata = iface.encodeFunctionData("setCurrentTokenId", [22788]);

  const args: DeployUpgradeTaskArgs = {
    diamondUpgrader: await diamondOwner(c.fakeGotchiArt, ethers),
    diamondAddress: c.fakeGotchiArt,
    facetsAndAddSelectors: joined,
    useLedger: true,
    useMultisig: false,
    useRelayer: false,
    initCalldata: calldata,
    initAddress: c.fakeGotchiArt,
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
