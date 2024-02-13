import { Block, BlockPermutation, Dimension, Vector, Vector3 } from "@minecraft/server"
import Queue from "../DataStructures/Queue.js";
import Vector3Distance from "../Utilities/Vector3Distance.js";
import TryGetBlock from "../Utilities/TryGetBlock.js";

/**
 * Flood-fill style BFS iterator that will iterate over "empty" blocks starting at a center location. It will also iterate over any blocks
 * included in the list of BlockNamesToInclude. "Empty" blocks (defined by BlockNameToConsiderEmpty) are used to determine if an entity can
 * move to them.
 * 
 * Will return sets of blocks in maximum size of YieldedChunkSize. 
 * 
 * This iterator does not iterate up or down on the Y axis _unless_ the entity needs to jump up a block or jump down a block safely.
 */
export default class FloodFillIterator implements Iterable<Block[]> {

    private BlockNamesToConsiderEmpty: string[] = ["minecraft:air"];
    private CenterLocation: Vector3;
    private LocationsToIgnore: Vector3[] = [];
    private MaxDistanceFromCenter: number;
    private World: Dimension;
    private YieldedChunkSize: number = 8;

    /**
     * List of block names to allow in the iterator
     */
    private BlockNamesToInclude: string[];

    /**
     * List of hashed locations (comma separated) that have already been considered/visited
     */
    private ClosedList: {[key: string]: boolean} = {};

    public constructor (
      centerLocation: Vector3,
      maxDistanceFromCenter: number,
      world: Dimension,
      blockNamesToInclude: string[],
      locationsToIgnore: Vector3[]
    ) {
        this.CenterLocation = centerLocation;
        this.MaxDistanceFromCenter = maxDistanceFromCenter;
        this.World = world;
        this.BlockNamesToInclude = blockNamesToInclude;
        this.LocationsToIgnore = locationsToIgnore;

        // Start by adding the LocationsToIgnore to the ClosedList
        for (const location of locationsToIgnore){
            this.AddLocationToClosedList(location);
        }
    }

    /**
     * Sets the list of block type Ids to consider empty and passable
     * @param listOfBlockNames
     */
    public SetBlockNamesToConsiderEmpty(listOfBlockNames: string[]){
        this.BlockNamesToConsiderEmpty = listOfBlockNames;
    }

    /**
     * Gets a basic string to represent the Vector3 location in a hash map
     * @param location
     * @returns 
     */
    private GetHashForLocation(location: Vector3): string{
        return `${location.x}, ${location.y}, ${location.z}`;
    }

    /**
     * Determines if the provided block has already been added to this iterator's "closed" list of already-visited blocks.
     * @param block 
     * @returns 
     */
    private HasBlockLocationBeenClosed(block: Block): boolean{
        return this.GetHashForLocation(block.location) in this.ClosedList;
    }

    /**
     * Adds the Vector 3location, after fetching a hash for its Vector3 location, to this iterator's closed list
     * @param block 
     * @returns 
     */
    private AddLocationToClosedList(location: Vector3): void{
        this.ClosedList[this.GetHashForLocation(location)] = true;
    }

    /**
     * Adds the block's location, after fetching a hash for its Vector3 location, to this iterator's closed list
     * @param block 
     * @returns 
     */
    private AddBlockLocationToClosedList(block: Block): Block{
        this.AddLocationToClosedList(block.location);
        return block;
    }

    /**
     * Checks if the provided permutation is included in the iterators match
     * @param blockPermutation
     * @returns 
     */
    private IsBlockPermutationIncluded(blockPermutation: BlockPermutation): boolean{
        for (const blockName of this.BlockNamesToInclude){
            if (blockPermutation.matches(blockName)){
                return true;
            }
        }

        return false;
    }

    /**
     * Checks if the provided location is further than the MaxDistanceFromCenter would allow
     * @param location
     */
    private IsLocationOutOfBounds(location: Vector3): boolean{
        return Vector3Distance(location, this.CenterLocation) > this.MaxDistanceFromCenter;
    }

    /**
     * Returns the provided block if it is air and has ground beneath it. If there is air beneath it, then checks for the block -2 beneath the provided block for ground.
     * If the block at y - 2 is ground, then returns the block that is y - 1 the provided block.
     * 
     * If the provided block is not air, then checks if the block above the provided block (y + 1) is air. If
     */
    private GetBlockIfAirOrAboveBlockIfAboveIsAir(block: Block): Block | null{
        if (block.permutation.matches(this.BlockNameToConsiderEmpty)){
            const locationBelow: Vector3 = {
                x: block.location.x,
                y: block.location.y - 1,
                z: block.location.z
            }

            if (this.IsLocationOutOfBounds(locationBelow)){
                return null;
            }

            const blockBelow: Block | undefined = TryGetBlock(this.World, locationBelow);
            if (blockBelow?.permutation.matches(this.BlockNameToConsiderEmpty)){
                // Block below 'block' is also air - is the block y - 2 non-air? If so, we can fall to it safely
                const locationFurtherBelow: Vector3 = {
                    x: block.location.x,
                    y: block.location.y - 2,
                    z: block.location.z
                }

                if (this.IsLocationOutOfBounds(locationFurtherBelow)){
                    return null;
                }

                const blockFurtherBelow: Block | undefined = TryGetBlock(this.World, locationFurtherBelow);
                if (blockFurtherBelow?.permutation.matches(this.BlockNameToConsiderEmpty)){
                    // We cannot use this 'block'
                    return null;
                }else{
                    // We can safely drop down to block at 'blockBelow'
                    return this.HasBlockLocationBeenClosed(blockBelow) ? null : this.AddBlockLocationToClosedList(blockBelow);
                }
            }else{
                // 'block' is air, and beneath it is non-air
                // We can move to 'block' safely
                return this.HasBlockLocationBeenClosed(block) ? null : this.AddBlockLocationToClosedList(block);
            }
        }else{
            const locationAbove: Vector3 = {
                x: block.location.x,
                y: block.location.y + 1,
                z: block.location.z
            };

            if (this.IsLocationOutOfBounds(locationAbove)){
                return null;
            }

            const blockAbove = TryGetBlock(this.World, locationAbove);
            if (blockAbove?.permutation.matches(this.BlockNameToConsiderEmpty)){
                // TODO, check if blockFurtherAbove (y+2) is also air, so we can jump to it
                return this.HasBlockLocationBeenClosed(blockAbove) ? null : this.AddBlockLocationToClosedList(blockAbove);
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
     * Fetches the blocks adjacent to the provided block.
     * If an adjacent block is a non-air block, but the block above it is air - then the air block above is returned instead as 
     * it's possible that block can be traversed if the entity jumps.
     */
    public GetAdjacentAirOrIncludedBlocks(fromBlock: Block): Block[]{
        const includedBlocks: Block[] = [];
        const fromBlockLocation: Vector3 = fromBlock.location;
        const adjacentPositions: Vector3[] = [
            {x: fromBlockLocation.x + 1, y: fromBlockLocation.y, z: fromBlockLocation.z},
            {x: fromBlockLocation.x - 1, y: fromBlockLocation.y, z: fromBlockLocation.z},
            {x: fromBlockLocation.x, y: fromBlockLocation.y, z: fromBlockLocation.z + 1},
            {x: fromBlockLocation.x, y: fromBlockLocation.y, z: fromBlockLocation.z - 1},
        ];

        for (const location of adjacentPositions){

            // If this location is too far, then skip it
            if (this.IsLocationOutOfBounds(location)){
                continue;
            }

            let block: Block | undefined;
            try{
                block = this.World.getBlock(location);
            }catch(e){}
            
            if (block !== undefined){

                // Check if this block is one of the blocks the requester wants to include in all cases
                if (this.IsBlockPermutationIncluded(block.permutation)){
                    includedBlocks.push(block);
                }

                const airBlock: Block | null = this.GetBlockIfAirOrAboveBlockIfAboveIsAir(block);
                if (airBlock !== null){
                    includedBlocks.push(airBlock);
                }
            }
        }

        return includedBlocks;
    }
  
    /**
     * Iterates the cuboid in chunks
     */
    public *[Symbol.iterator](): IterableIterator<Block[]> {
      const visited: {[key: string]: boolean} = {};
      const startingBlock: Block | undefined = TryGetBlock(this.World, this.CenterLocation);

      if (startingBlock === undefined){
        throw "Starting location for FloodFillIterator cannot resolve to an undefined block.";
      }

      // Hashmap of locations that have already been 
      const closedList: {[key: string]: boolean} = {};
      const queue = new Queue<Block>();
      queue.EnqueueList(this.GetAdjacentAirOrIncludedBlocks(startingBlock));

      while (!queue.IsEmpty){
        const blocks: Block[] = queue.DequeueChunk(this.YieldedChunkSize);
        yield blocks;
        for (const block of blocks){
            queue.EnqueueList(this.GetAdjacentAirOrIncludedBlocks(block));
        }
      }
    }
  }