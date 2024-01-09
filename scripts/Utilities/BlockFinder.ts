import { world, system, Block, Dimension, Vector3 } from "@minecraft/server";
import FloodFillIterator from "../Iterators/FloodFillIterator.js";

export default class BlockFinder{

    /**
     * TODO Add this to system interval?
     * Uses an iterator to iterate all blocks in an octahedron around the starting location for a maxDistance. Returns all blocks with permuations
     * matching any blockNamesToMatch provided that exist in the dimension provided.
     * @param startingLocation
     * @param maxDistance 
     * @returns 
     */
    public async FindBlocksMatchingPermuations(
        startingLocation: Vector3, 
        maxDistance: number,
        blockNamesToMatch: string[],
        dimension: Dimension,
        endOnFirstMatch: boolean = false
        ): Promise<Block[]>{
        const blocksFound: Block[] = [];
        const floodFillIterator = new FloodFillIterator(
            startingLocation, 
            maxDistance, 
            dimension,
            blockNamesToMatch
            );
        const iterator = floodFillIterator[Symbol.iterator]();
        const iteratedBlocks: Block[] = [];
        
        return new Promise(async resolve => {
            let runId = system.runInterval(async () => {
                let nextBlocksIteration = iterator.next();

                // If this iteration marks the end, then clear the run interval and resolve the promise
                if (nextBlocksIteration.done == true){
                    system.clearRun(runId);

                    // For debugging only, ignore
                    // for (const block of iteratedBlocks){
                    //     if (Math.random() < 0.15){
                    //         await new Promise(resolve2 => {
                    //             system.runTimeout(() => {
                    //                 block.setPermutation(BlockPermutation.resolve("minecraft:stone"));
                    //                 resolve2(null);
                    //             }, 1);
                    //         });
                    //     }else{
                    //         block.setPermutation(BlockPermutation.resolve("minecraft:stone"));
                    //     }
                    // }

                    resolve(blocksFound);
                }
                
                if (nextBlocksIteration.value !== undefined){
                    for (const nextBlock of nextBlocksIteration.value){
                        iteratedBlocks.push(nextBlock);
                    
                        // Delete this later
                        // nextBlock.setPermutation(BlockPermutation.resolve("minecraft:stone"));
                        
                        for (const blockName of blockNamesToMatch){
                            if (nextBlock.permutation.matches(blockName)){

                                if (endOnFirstMatch){
                                    system.clearRun(runId);
                                    resolve([nextBlock]);
                                }else{
                                    blocksFound.push(nextBlock);
                                    break;
                                }
                            }
                        }
                    }
                }
            });
        });
    }

    /**
     * Calls FindFirstBlockMatchingPermutation, but with the endOnFirstMatch set to true. Returns the block that was found, or null if none. 
     * @param startingLocation 
     * @param maxDistance 
     * @param blockNamesToMatch 
     * @param dimension 
     * @returns 
     */
    public async FindFirstBlockMatchingPermutation(
        startingLocation: Vector3, 
        maxDistance: number,
        blockNamesToMatch: string[],
        dimension: Dimension,
    ): Promise<Block | null>{
        const blocks: Block[] = await this.FindBlocksMatchingPermuations(startingLocation, maxDistance, blockNamesToMatch, dimension, true);
        if (blocks.length === 1){
            return blocks[0];
        }

        return null;
    }
}