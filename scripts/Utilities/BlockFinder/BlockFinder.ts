import { Block, BlockPermutation, Vector3, system, world } from "@minecraft/server";
import { BlockFinderOptions } from "./BlockFinderOptions";
import { BlockFinderRequest } from "./BlockFinderRequest";
import Queue from "../../DataStructures/Queue";
import FloodFillIterator from "../../Iterators/FloodFillIterator";
import { VectorUtils } from "../Vector/VectorUtils";
import { FloodFillIteratorOptions } from "../../Iterators/FloodFillIIteratorOptions";
import { FinishedWineBarrelBlock } from "../../BlockHandlers/FinishedWineBarrelBlock";

export class BlockFinder{
    /**
     * The maximum number of concurrent find requests happening
     */
    private static MaximumConcurrentFinds = 2;

    /**
     * How often to run the next iteration of the current find requests. E.g., 2 = iterate the next set of blocks every 2 ticks for each find request.
     */
    private static TicksDelta = 5;

    /**
     * The find requests in the queue waiting to be processed
     */
    private static QueuedFindRequests: Queue<BlockFinderRequest> = new Queue<BlockFinderRequest>();

    /**
     * The current find requests being processed
     */
    private static CurrentFindRequests: BlockFinderRequest[] = [];

    /**
     * The current Id of the interval running for the finder. Will be null if there is no interval running - this means the finder is not currently looking for blocks.
     */
    private static CurrentFinderRunId: number | null = null;

    /**
     * 
     * @param options
     */
    public static async FindBlocks(options: BlockFinderOptions): Promise<Block[]> {
        return await new Promise<Block[]>((resolve, reject) => {
            // Set up the request's flood fill iterator
            const floodFillIterator = BlockFinder.GetFloodFillIteratorFromOptions(options);
            const finderRequest = new BlockFinderRequest(resolve, reject, options, floodFillIterator);
            BlockFinder.QueuedFindRequests.Enqueue(finderRequest);

            BlockFinder.StartIntervalIfNotStarted();
        });
    }

    /**
     * Creates a FloodFillIterator for a given BlockFinderOptions object
     * @param options 
     * @returns 
     */
    private static GetFloodFillIteratorFromOptions(options: BlockFinderOptions): FloodFillIterator{
        const floodFillOptions: FloodFillIteratorOptions = {
            StartLocation: options.StartLocation,
            Dimension: options.Dimension,
            MaxDistance: options.MaxDistance,
            LocationsToIgnore: options.LocationsToIgnore,
            TagsToConsiderPassable: options.TagsToIgnore,
            TypeIdsToConsiderPassable: options.TypeIdsToIgnore,
            TypeIdsToAlwaysIncludeInResult: options.TypeIdsToFind,
            TagsToAlwaysIncludeInResult: options.TagsToFind,
            TagsToIgnore: [],
            TypeIdsToIgnore: []
        };
        const floodFillIterator = new FloodFillIterator(floodFillOptions);

        return floodFillIterator;
    }

    /**
     * If there is currently no running interval, this starts one to process the queue
     */
    private static StartIntervalIfNotStarted(): void{
        if (BlockFinder.CurrentFinderRunId === null){
            BlockFinder.CurrentFinderRunId = system.runInterval(() => {
                // Add more to the current processing list if it is under the maximum concurrent finds
                if (BlockFinder.QueuedFindRequests.Length > 0){
                    if (BlockFinder.CurrentFindRequests.length < BlockFinder.MaximumConcurrentFinds){
                        const numberNeeded = BlockFinder.MaximumConcurrentFinds - BlockFinder.CurrentFindRequests.length;
                        for (let i = 0; i < numberNeeded; i++){
                            if (BlockFinder.QueuedFindRequests.Length > 0){
                                BlockFinder.CurrentFindRequests.push(BlockFinder.QueuedFindRequests.Dequeue());
                            }
                        }
                    }
                }

                // Close this run interval if there are no more queued and no more processing
                if (BlockFinder.QueuedFindRequests.Length === 0 && BlockFinder.CurrentFindRequests.length === 0){
                    if (BlockFinder.CurrentFinderRunId !== null){
                        system.clearRun(BlockFinder.CurrentFinderRunId);
                        BlockFinder.CurrentFinderRunId = null;
                        return;
                    }
                }

                // Have a separate array of requests to iterate over
                // So they can be removed from CurrentFindRequests without affecting the for loop iterator
                // if we were to iterate directly over BlockFinder.CurrentFindRequests
                const currentFindRequests: BlockFinderRequest[] = [];
                for (const findRequest of BlockFinder.CurrentFindRequests){
                    currentFindRequests.push(findRequest);
                }

                // Iterate over all the current find requests
                for (const findRequest of currentFindRequests){
                    // Tick each find requests' iterator

                    // Get the next iterator result
                    let nextSetOfBlocks: Block[] = findRequest.FloodFillIterator.GetNext();

                    // Is this iterator done?
                    if (nextSetOfBlocks.length === 0){
                        BlockFinder.ResolveRequest(findRequest);

                        // Move to the next in the loop
                        continue;
                    }

                    // Iterate over the blocks found
                    for (const nextBlock of nextSetOfBlocks){
                        if (nextBlock.isValid()){
                            // nextBlock.setPermutation(BlockPermutation.resolve("minecraft:stone"));
                            if (BlockFinder.IsBlockAllowedFromOptions(nextBlock, findRequest.BlockFinderOptions)){
                                // Add it to the finder blocks
                                findRequest.BlocksFound.push(nextBlock);

                                // Check we are not at the max blocks
                                if (findRequest.BlocksFound.length >= findRequest.BlockFinderOptions.MaxBlocksToFind){
                                    BlockFinder.ResolveRequest(findRequest);
                                    break;
                                }
                            }
                        }
                    }

                }
            }, BlockFinder.TicksDelta);
        }
    }

    /**
     * Checks if a given block is allowed by the defined finder request options
     * @param options
     */
    private static IsBlockAllowedFromOptions(block: Block, options: BlockFinderOptions): boolean{
        const blockTypeId: string = block.typeId;
        const blockTags: string[] = block.getTags();
        const blockLocation: Vector3 = block.location;

        // Check that the block's location is not part of the ignore locations
        const doesLocationExistInIgnoreList: boolean = options.LocationsToIgnore.some(location => VectorUtils.AreEqual(location, blockLocation));
        if (doesLocationExistInIgnoreList){
            // It is not allowed to be considered
            return false;
        }

        // Check if it's allowed by the type Ids
        if (options.TypeIdsToFind.indexOf(blockTypeId) > - 1){
            return true;
        }

        // Check if it's allowed by the tags to find
        const anyTagIdMatch: boolean = options.TagsToFind.some(tag => blockTags.indexOf(tag) > - 1);
        if (anyTagIdMatch){
            return true;
        }

        return false;
    }

    private static FailRequest(request: BlockFinderRequest, rejectionMessage: string): void{
        // Remove it from the
        BlockFinder.RemoveRequestFromCurrentFindRequests(request);
        request.PromiseRejectCallback(rejectionMessage);
    }

    private static ResolveRequest(request: BlockFinderRequest): void{
        // Remove it from the
        BlockFinder.RemoveRequestFromCurrentFindRequests(request);
        request.PromiseResolveCallback(request.BlocksFound);
    }

    private static RemoveRequestFromCurrentFindRequests(request: BlockFinderRequest): void{
        for (const index in BlockFinder.CurrentFindRequests){
            if (BlockFinder.CurrentFindRequests[index] === request){
                BlockFinder.CurrentFindRequests.splice(parseInt(index), 1);
                break;
            }
        }
    }
}