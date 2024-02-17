import { Block, BlockPermutation, Dimension, Vector, Vector3 } from "@minecraft/server"
import Queue from "../DataStructures/Queue.js";
import { VectorUtils } from "../Utilities/Vector/VectorUtils.js";
import { FloodFillIteratorOptions } from "./FloodFillIIteratorOptions.js";
import Debug from "../Debug/Debug.js";

/**
 * Flood-fill style BFS iterator that will iterate over "empty" blocks starting at a center location. It will also iterate over any blocks
 * included in the list of BlockNamesToInclude. "Empty" blocks (defined by BlockNameToConsiderEmpty) are used to determine if an entity can
 * move to them.
 * 
 * Will return sets of blocks in maximum size of YieldedChunkSize. 
 * 
 * This iterator does not iterate up or down on the Y axis _unless_ the entity needs to jump up a block or jump down a block safely.
 */
export default class FloodFillIterator {

    private Queue: Queue<Block> = new Queue<Block>();
    private StartingBlock: Block;
    private Options: FloodFillIteratorOptions;
    private YieldedChunkSize: number = 8;

    /**
     * List of hashed locations (comma separated) that have already been considered/visited
     */
    private ClosedList: {[key: string]: boolean} = {};

    public constructor (options: FloodFillIteratorOptions) {
        this.Options = options;

        // Try to get the starting block
        let startingBlock: Block | undefined;
        try{
            startingBlock = options.Dimension.getBlock(options.StartLocation);
        }catch(e){
            throw "Could not use starting block. It is invalid.";
        }

        if (startingBlock !== undefined){
            this.StartingBlock = startingBlock;
        }else{
            throw "Could not use starting block. It is undefined.";
        }

        // Start by adding the LocationsToIgnore to the ClosedList
        for (const location of this.Options.LocationsToIgnore){
            this.AddLocationToClosedList(location);
        }

        // Enqueue the first blocks
        this.Queue.EnqueueList(this.GetAdjacentPassableBlocks(startingBlock));
    }

    /**
     * Determines if the provided block has already been added to this iterator's "closed" list of already-visited blocks.
     * @param block 
     * @returns 
     */
    private HasBlockLocationBeenClosed(block: Block): boolean{
        return VectorUtils.GetAsString(block.location) in this.ClosedList;
    }

    /**
     * Determines if the provided location has already been added to this iterator's "closed" list of already-visited blocks.
     * @param block 
     * @returns 
     */
    private HasLocationBeenClosed(location: Vector3): boolean{
        return VectorUtils.GetAsString(location) in this.ClosedList;
    }

    /**
     * Adds the Vector3 location, after fetching a hash for its Vector3 location, to this iterator's closed list
     * @param block 
     * @returns 
     */
    private AddLocationToClosedList(location: Vector3): void{
        this.ClosedList[VectorUtils.GetAsString(location)] = true;
    }

    /**
     * Checks if the provided block has any notion that the Options have ignored it
     * @param blockPermutation
     * @returns 
     */
    private IsBlockIgnored(block: Block): boolean {
        if (block.isValid()){
            // Check if the block has a tag that is ignored
            if (this.Options.TagsToIgnore.length > 0){
                const anyTagIsIgnored = block.getTags().some(tag => this.Options.TagsToIgnore.indexOf(tag) > -1);
                if (anyTagIsIgnored){
                    return true;
                }
            }

            // Check if the block's typeId is ignored
            if (this.Options.TypeIdsToIgnore.indexOf(block.typeId) > -1){
                return true;
            }

            // No need to check if the location is ignored,
            // as all ignored locations are added to the ClosedList when this iterator is instantiated
        }

        return false;
    }

    /**
     * Returns if the provided block is passable.
     * @param block 
     * @returns 
     */
    private IsBlockPassable(block: Block): boolean{
        if (block.isValid()){
            // Check if the block's typeId is passable
            if (this.Options.TypeIdsToConsiderPassable.indexOf(block.typeId) > -1){
                return true;
            }

            // Check if the block has any tags that are passable
            if (this.Options.TagsToConsiderPassable.length > 0){
                const blockTags: string[] = block.getTags();
                const anyTagsArePassable: boolean = this.Options.TagsToConsiderPassable.some(tag => blockTags.indexOf(tag) > -1);
                if (anyTagsArePassable){
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Returns if the provided block has been defined to always be included in a result set regardless if it is passable.
     * @param block 
     * @returns 
     */
    private IsBlockAlwaysIncluded(block: Block): boolean{
        if (block.isValid()){
            // Check if the block's typeId is included
            if (this.Options.TypeIdsToAlwaysIncludeInResult.indexOf(block.typeId) > -1){
                return true;
            }

            // Check if the block has any tags that are included
            if (this.Options.TagsToAlwaysIncludeInResult.length > 0){
                const blockTags: string[] = block.getTags();
                const anyTagsAreIncluded: boolean = this.Options.TagsToAlwaysIncludeInResult.some(tag => blockTags.indexOf(tag) > -1);
                if (anyTagsAreIncluded){
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Checks if the provided location is further than the MaxDistanceFromCenter would allow
     * @param location
     */
    private IsLocationOutOfBounds(location: Vector3): boolean{
        return Vector.distance(location, this.Options.StartLocation) > this.Options.MaxDistance;
    }

    /**
     * Returns the provided block if it is an empty block with ground beneath it.
     * 
     * Returns the block below if the provided block is passable, but so is the one beneath it and there is ground beneath the below block to stand on.
     * 
     * Returns the block above if the provided block is not passable, but there is space above it to go over that block.
     */
    private GetBlockIfPassableOrNearestVerticalPassableBlock(block: Block): Block | null{
        if (block.isValid()){

            if (this.IsBlockPassable(block)){

                // Check if the block below is passable
                let blockBelow: Block | undefined;
                try{
                    blockBelow = block.below(1);
                }catch(e){}

                if (blockBelow !== undefined){
                    if (this.IsBlockPassable(blockBelow)){
                        // Check if the block below this one is safe ground
                        let blockFurtherBelow: Block | undefined;
                        try{
                            blockFurtherBelow = blockBelow.below(1);
                        }catch(e){}
                        if (blockFurtherBelow !== undefined){
                            if (!this.IsBlockPassable(blockFurtherBelow)){
                                // Safe to move to blockBelow, as it has ground beneath it
                                if (!this.HasBlockLocationBeenClosed(blockBelow)){
                                    this.AddLocationToClosedList(blockBelow.location);
                                    return blockBelow;
                                }
                            }
                        }

                    }else{
                        // This is ground. "block" is a safe empty block to return
                        if (!this.HasBlockLocationBeenClosed(block)){
                            this.AddLocationToClosedList(block.location);
                            return block;
                        }
                    }
                }
            }else{
                // Check if the block passed can be jumped onto
                // It must have two free spaces of air above it
                let blockAbove: Block | undefined;
                let blockFurtherAbove: Block | undefined;
                try{
                    blockAbove = block.above(1);
                    blockFurtherAbove = block.above(2);
                }catch(e){}

                if (blockAbove !== undefined && blockFurtherAbove !== undefined){
                    if (this.IsBlockPassable(blockAbove)){
                        if (this.IsBlockPassable(blockFurtherAbove)){
                            // Both blocks above are free
                            // "blockAbove" is safe to move to
                            if (!this.HasBlockLocationBeenClosed(blockAbove)){
                                this.AddLocationToClosedList(blockAbove.location);
                                return blockAbove;
                            }
                        }
                    }
                }
            }
        }

        return null;
    }

    /**
     * Sets the yielded chunk size, which is the maximum number of blocks to return on one iteration
     * @param size
     */
    public SetYieldedChunkSize(size: number): void{
        this.YieldedChunkSize = size;
    }

    /**
     * Fetches all adjacent blocks to the provided fromBlock if they can be passed to. It may return a block above or below the adjacent space
     * if the adjacent space is "fallable" safely to a block below it, or if the adjacent space is a block that can be stood on.
     */
    public GetAdjacentPassableBlocks(fromBlock: Block): Block[]{
        const includedBlocks: Block[] = [];
        const fromBlockLocation: Vector3 = fromBlock.location;
        const adjacentPositions: Vector3[] = [
            {x: fromBlockLocation.x + 1, y: fromBlockLocation.y, z: fromBlockLocation.z},
            {x: fromBlockLocation.x + 1, y: fromBlockLocation.y, z: fromBlockLocation.z + 1},
            {x: fromBlockLocation.x + 1, y: fromBlockLocation.y, z: fromBlockLocation.z - 1},
            {x: fromBlockLocation.x, y: fromBlockLocation.y, z: fromBlockLocation.z + 1},
            {x: fromBlockLocation.x, y: fromBlockLocation.y, z: fromBlockLocation.z - 2},
            {x: fromBlockLocation.x - 1, y: fromBlockLocation.y, z: fromBlockLocation.z},
            {x: fromBlockLocation.x - 1, y: fromBlockLocation.y, z: fromBlockLocation.z + 1},
            {x: fromBlockLocation.x - 1, y: fromBlockLocation.y, z: fromBlockLocation.z - 1},
        ];

        for (const location of adjacentPositions){

            // If this location is too far, then skip it
            if (this.IsLocationOutOfBounds(location)){
                continue;
            }

            // Do not check or include locations already closed
            if (this.HasLocationBeenClosed(location)){
                continue;
            }

            let block: Block | undefined;
            try{
                block = this.Options.Dimension.getBlock(location);
            }catch(e){}
            
            if (block !== undefined){
                if (block.isValid()){

                    // Check if this block is always included
                    if (this.IsBlockAlwaysIncluded(block)){
                        includedBlocks.push(block);
                    }else{
                        // It's not always included, so
                        // get the nearest air block (vertically). It may be itself
                        const availableBlock: Block | null = this.GetBlockIfPassableOrNearestVerticalPassableBlock(block);
                        if (availableBlock !== null){
                            includedBlocks.push(availableBlock);
                        }
                    }
                    
                }
            }
        }

        return includedBlocks;
    }
  
    /**
     * Gets the next set of blocks in iteration.
     */
    public GetNext(): Block[] {
        if (!this.Queue.IsEmpty){
            const blocks: Block[] = this.Queue.DequeueChunk(this.YieldedChunkSize);
            
            // Queue up more
            for (const block of blocks){
                if (block.isValid()){
                    this.Queue.EnqueueList(this.GetAdjacentPassableBlocks(block));
                }
            }

            // Return the dequeued chunk of blocks
            return blocks;
        }

        return [];
    }
  }