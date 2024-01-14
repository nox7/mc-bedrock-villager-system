import { Block } from "@minecraft/server";
import CuboidRegion from "./Region/CuboidRegion";

/**
 * Gets a list of all Blocks that are connected to fromBlock and any blocks of the same type recursively.
 * @param fromBlock
 */
export default function(fromBlock: Block, blockIdentifiers: string[], maxBlocksToReturn = 20): Block[]{
    const blocks: Block[] = [];
    const blocksToIterate: Block[] = [fromBlock];
    const iteratedPositions: {[key: string]: boolean} = {};

    while (blocksToIterate.length > 0){
        const next: Block | undefined = blocksToIterate.pop();
        if (next !== undefined){

            // Safe-guard against massive loops
            // Or protect in the case a player's trees touch their house
            // so this doesn't magically delete too many of their blocks if that case happens
            if (blocks.length >= maxBlocksToReturn){
                break;
            }

            const locationHashOfNext = `${next.location.x},${next.location.y},${next.location.z},`
            iteratedPositions[locationHashOfNext] = true;

            for (const blockIdentifier of blockIdentifiers){
                // Is the current `next` block a match for the blockIdentifiers?
                if (next.permutation.matches(blockIdentifier)){
                    blocks.push(next);
                    break;
                }
            }

            const cuboidRegionAroundBlock: CuboidRegion = CuboidRegion.FromCenterLocation(next.location, 1, false);
            for (const location of cuboidRegionAroundBlock.GetAllLocationsInRegion()){
                const locationHashOfBlock: string = `${location.x},${location.y},${location.z},`;
                if (!(locationHashOfBlock in iteratedPositions)){
                    try{
                        const block: Block | undefined = fromBlock.dimension.getBlock(location);
                        if (block !== undefined){
                            // Is this block one of the matches we need?
                            for (const blockIdentifier of blockIdentifiers){
                                if (block.permutation.matches(blockIdentifier)){
                                    blocks.push(next);
                                    blocksToIterate.push(block);
                                    break;
                                }
                            }
                        }
                    }catch(e){}
                }
            }
        }
    }

    return blocks;
}