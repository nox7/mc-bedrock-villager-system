import { Block, BlockPermutation, Dimension, Vector3 } from "@minecraft/server"
import Queue from "../DataStructures/Queue.js";
import Vector3Distance from "../Utilities/Vector3Distance.js";

export default class FloodFillIterator implements Iterable<Block[]> {

    private BlockNameToConsiderEmpty: string = "minecraft:air";
    private CenterLocation: Vector3;
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
      blockNamesToInclude: string[]
    ) {
        this.CenterLocation = centerLocation;
        this.MaxDistanceFromCenter = maxDistanceFromCenter;
        this.World = world;
        this.BlockNamesToInclude = blockNamesToInclude;
    }

    private GetHashForLocation(location: Vector3): string{
        return `${location.x}, ${location.y}, ${location.z}`;
    }

    private HasBlockLocationBeenClosed(block: Block): boolean{
        return this.GetHashForLocation(block.location) in this.ClosedList;
    }

    private AddBlockLocationToClosedList(block: Block): Block{
        this.ClosedList[this.GetHashForLocation(block.location)] = true;
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
    private GetBlockIfAirOrAboveBlocKIfAboveIsAir(block: Block): Block | null{
        if (block.permutation.matches(this.BlockNameToConsiderEmpty)){
            const locationBelow: Vector3 = {
                x: block.location.x,
                y: block.location.y - 1,
                z: block.location.z
            }

            if (this.IsLocationOutOfBounds(locationBelow)){
                return null;
            }

            const blockBelow = this.World.getBlock(locationBelow);
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

                const blockFurtherBelow = this.World.getBlock(locationFurtherBelow);
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

            const blockAbove = this.World.getBlock(locationAbove);
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

            const block: Block | undefined = this.World.getBlock(location);
            if (block !== undefined){

                // Check if this block is one of the blocks the requester wants to include in all cases
                if (this.IsBlockPermutationIncluded(block.permutation)){
                    includedBlocks.push(block);
                }

                const airBlock: Block | null = this.GetBlockIfAirOrAboveBlocKIfAboveIsAir(block);
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
      const startingBlock: Block | undefined = this.World.getBlock(this.CenterLocation);

      if (startingBlock === undefined){
        throw "Starting location for GroundBlockIterator cannot resolve to an undefined block.";
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