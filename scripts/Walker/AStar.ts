import { Block, BlockPermutation, Dimension, Vector3, system } from "@minecraft/server";
import Vector3Distance from "../Utilities/Vector3Distance";
import CuboidRegion from "../Utilities/Region/CuboidRegion";

interface AStarNode {
    block: Block;
    parent: AStarNode | null;
    fCost: number;
    gCost: number;
    hCost: number;
}

/**
 * Implementation of the A* algorithm for Minecraft
 */
export default class AStar{

    private Start: Vector3;
    private StartBlock: Block;
    private End: Vector3;
    private EndBlock: Block;
    private Dimension: Dimension;

    /**
     * Additional block typeIds provided by the caller that can be considered "okay" to move through
     */
    private BlockTypeIdsToWhitelist: string[] = [];

    /**
     * Additional Minecraft Block instances provided by the caller that can be considered "okay" to move through
     */
    private BlocksToWhitelist: Block[] = [];

    /**
     * This is the maximum nodes that can be in the A* closed list before it give sup
     */
    private MaximumNodesToConsider: number = 100;

    /**
     * List of blocks that A* can consider moveable
     */
    private CanMoveThroughBlocks: string[] = [
        "minecraft:air",
        "minecraft:tallgrass",
        "minecraft:double_plant",
        "minecraft:sapling",
        "minecraft:yellow_flower",
        "minecraft:red_flower",
        "minecraft:double_plant",
        "minecraft:torchflower",
        "minecraft:pitcher_plant",
        "minecraft:wither_rose",
        "minecraft:brown_mushroom",
        "minecraft:red_mushroom",
        "minecraft:spore_blossom",
        "minecraft:glass",
        "minecraft:red_stained_glass",
    ];

    /**
     * List of blocks that could be 1-unit high but cannot be jumped over
     */
    private CannotJumpOver: string[] = [
        "minecraft:oak_fence",
        "minecraft:oak_fence_gate",
        "minecraft:spruce_fence",
        "minecraft:spruce_fence_gate",
        "minecraft:birch_fence",
        "minecraft:birch_fence_gate",
        "minecraft:jungle_fence",
        "minecraft:jungle_fence_gate",
        "minecraft:acacia_fence",
        "minecraft:acacia_fence_gate",
        "minecraft:dark_oak_fence",
        "minecraft:dark_oak_fence_gate",
        "minecraft:mangrove_fence",
        "minecraft:mangrove_fence_gate",
        "minecraft:cherry_fence",
        "minecraft:cherry_fence_gate",
        "minecraft:bamboo_fence",
        "minecraft:bamboo_fence_gate",
        "minecraft:crimson_fence",
        "minecraft:crimson_fence_gate",
        "minecraft:warped_fence",
        "minecraft:warped_fence_gate",
        "minecraft:nether_brick_fence",
        "minecraft:nether_brick_fence_gate",
        "minecraft:cobblestone_wall",
        "minecraft:blackstone_wall",
        "minecraft:polished_blackstone_wall",
        "minecraft:polished_blackstone_brick_wall",
        "minecraft:cobbled_deepslate_wall",
        "minecraft:polished_deepslate_wall",
        "minecraft:deepslate_brick_wall",
        "minecraft:deepslate_tile_wall",
        "minecraft:mud_brick_wall",
    ];

    public constructor(dimension: Dimension,startLocation: Vector3, endLocation: Vector3, blockTypesToWhitelist: string[], blocksToWhitelist: Block[]){
        this.Dimension = dimension;
        this.Start = startLocation;
        this.End = endLocation;
        this.BlockTypeIdsToWhitelist = blockTypesToWhitelist;
        this.BlocksToWhitelist = blocksToWhitelist;

        let startBlock: Block | undefined;
        let endBlock: Block | undefined;

        try{
            startBlock = dimension.getBlock(startLocation);
            endBlock = dimension.getBlock(endLocation);
        }catch(e){}

        if (startBlock !== undefined && endBlock !== undefined){
            this.StartBlock = startBlock;
            this.EndBlock = endBlock;
        }else{
            throw "Start and End must point to valid and loaded blocks.";
        }
    }

    /**
     * Performs A* pathfinding from the start to the end and returns a list of blocks to traverse to get there. Returns null if no path exists
     */
    public async GetBlockPathFromStartToEnd(): Promise<Block[] | null>{
        return new Promise<Block[] | null>(async resolve => {
            const openList: AStarNode[] = [ 
                {
                    block: this.StartBlock, 
                    parent: null,
                    fCost: this.CalculateFCost(this.StartBlock),
                    gCost: this.CalculateGCost(this.StartBlock),
                    hCost: this.CalculateHHeuristic(this.StartBlock),
                }
            ];
            const closedListLocations: {[key: string]: AStarNode} = {};
    
            let runId = system.runInterval(() => {
                if (openList.length == 0){
                    system.clearRun(runId);
                    return resolve(null);
                }

                // Check if we have considered too many nodes and the path may be too difficult or impossible to get to
                if (Object.keys(closedListLocations).length >= this.MaximumNodesToConsider){
                    system.clearRun(runId);
                    return resolve(null);
                }

                const nextIndex = this.GetIndexOfNodeWithLowestFCost(openList);
                const nextNode = openList[nextIndex];
                const locationHash = this.GetHashOfLocation(nextNode.block.location);
    
                // Check if the nextNode is the EndBlock
                if (this.DoBlocksHaveSameLocation(nextNode.block, this.EndBlock)){
                    // We've hit the end
                    const blockPath: Block[] = [];
                    let currentNode: AStarNode | null = nextNode;
                    while (currentNode !== null){
                        blockPath.push(currentNode.block);
                        currentNode = currentNode.parent;
                    }
    
                    system.clearRun(runId);
                    return resolve(blockPath.reverse());
                }
    
                // Remove from openList
                openList.splice(nextIndex, 1);
                // nextNode.block.setPermutation(BlockPermutation.resolve("minecraft:red_stained_glass"));
    
                // Add it to closed list locations
                closedListLocations[locationHash] = nextNode;
    
                // Get all the adjacent locations
                const surroundingLocations: Vector3[] = CuboidRegion.FromCenterLocation(nextNode.block.location, 1, true).GetAllLocationsInRegion();

                // From the adjacent locations, get a list of Blocks that can be walked to
                const surroundingBlocks: Block[] = this.MutateSurroundingLocationsToCheckForJumpableLocations(surroundingLocations);

                for (const surroundingBlock of surroundingBlocks){
                    // Build the surrounding node from the surroundingBlock and set the parent as the current nextNode
                    const surroundingNode: AStarNode = {
                        block: surroundingBlock, 
                        parent: nextNode,
                        fCost: this.CalculateFCost(surroundingBlock),
                        gCost: nextNode.gCost + 1,// this.CalculateGCost(surroundingBlock),
                        hCost: this.CalculateHHeuristic(surroundingBlock),
                    };
                    const surroundingBlockLocationHash: string = this.GetHashOfLocation(surroundingBlock.location);

                    // Check if this block is the end block
                    if (this.DoBlocksHaveSameLocation(surroundingBlock, this.EndBlock)){
                        // Add the end block to the openList
                        openList.push(surroundingNode);
                        
                        // Break out of this for loop
                        break;
                    }

                    // EDIT: All blocks provided should already have been checked for walkability by the call to MutateSurroundingLocationsToCheckForJumpableLocations
                    // Check if it is not walkable
                    // if (!this.IsBlockInCanMoveList(surroundingBlock)){
                    //     // Skip this block
                    //     continue;
                    // }

                    // Check if the block is in the closed list
                    if (surroundingBlockLocationHash in closedListLocations){
                        // Skip this block
                        continue;
                    }

                    // Check if the block is already in the open list
                    const indexOfExistingNodeInOpenList: number | null = this.GetIndexOfNodeIfInList(surroundingNode, openList);
                    if (indexOfExistingNodeInOpenList === null){
                        // It is not in the openList, add it to the open list
                        // surroundingNode.block.setPermutation(BlockPermutation.resolve("minecraft:glass"));
                        openList.push(surroundingNode);
                    }else{
                        // It's already in the openList
                        // Compare the existing openList index node value to the surroundingNode g cost value
                        // If the surroundingNode.gCost is less than the existing openList index node value, then
                        // modify the existing openLiset index node value to have the new gCost and fCost and parent to match surroundingNode's properties
                        if (openList[indexOfExistingNodeInOpenList].gCost > surroundingNode.gCost){
                            openList[indexOfExistingNodeInOpenList].gCost = surroundingNode.gCost;
                            openList[indexOfExistingNodeInOpenList].parent = surroundingNode.parent;
                        }
                    }
                }
            });
        });
    }

    /**
     * Takes a list of locations that are expected to be vertically flat (as in, the CuboidRegion was given a request for surrounding block
     * and requested them to be vertically flat), then checks if any of them are _not_ walkable. If they are not, will check if the block
     * above is walkable. If so, the block above is considered walkable.
     * 
     * All walkable blocks are then added to a new array and that array is returned.
     * @param cuboidLocations 
     */
    private MutateSurroundingLocationsToCheckForJumpableLocations(cuboidLocations: Vector3[]): Block[]{
        const newWalkableBlocks: Block[] = [];

        for (const location of cuboidLocations){
            let blockAtLocation: Block | undefined;
            try{
                blockAtLocation = this.Dimension.getBlock(location);
            }catch(e){}

            if (blockAtLocation !== undefined){

                // Check if it is the end block
                if (this.DoBlocksHaveSameLocation(this.EndBlock, blockAtLocation)){
                    // Add and exit the entire loop
                    newWalkableBlocks.push(blockAtLocation);
                    break;
                }

                if (!this.IsBlockInCanMoveList(blockAtLocation)){
                    // Check block above, only if the current block could be jumped over
                    if (this.CanBlockBeJumpedOver(blockAtLocation)){
                        let blockAbove: Block | undefined;
                        try{
                            blockAbove = blockAtLocation.above(1);
                        }catch(e){}
    
                        if (blockAbove !== undefined){
                            if (this.IsBlockInCanMoveList(blockAbove)){
                                // This block can be added to the walkable blocks if it can be stood on
                                if (this.CanBlockBeStoodOn(blockAbove)){
                                    newWalkableBlocks.push(blockAbove);
                                }else{
                                }
                            }
                        }
                    }
                }else{
                    // This block is already walkable
                    // Check if there is a walkable block beneath it, if so then use that block if it is safe to drop down to
                    let blockBelow: Block | undefined;
                    try{
                        blockBelow = blockAtLocation.below(1);
                    }catch(e){}

                    if (blockBelow !== undefined){
                        // Is it walkable?
                        if (!this.IsBlockInCanMoveList(blockBelow)){
                            // No, so that means blockAtLocation is our best move if it can be stood on
                            if (this.CanBlockBeStoodOn(blockAtLocation)){
                                newWalkableBlocks.push(blockAtLocation);
                            }else{
                            }
                        }else{
                            // Yes, that means we need to drop down to it if it's safe
                            let blockFurtherBelow: Block | undefined;
                            try{
                                blockFurtherBelow = blockBelow.below(1);
                            }catch(e){}
                            if (blockFurtherBelow !== undefined){
                                // Can we drop down to this block?
                                if (!this.IsBlockInCanMoveList(blockFurtherBelow)){
                                    // We can drop down to blockBelow, because blockFurtherBelow is considered unpassable and solid
                                    newWalkableBlocks.push(blockBelow);
                                }else{
                                    // No, we cannot drop down to it
                                }
                            }
                        }
                    }
                }
            }
        }

        return newWalkableBlocks;
    }

    /**
     * Checks if a block could be jumped over (not a fence/wall)
     * @param block 
     */
    private CanBlockBeJumpedOver(block: Block): boolean{
        for (const typeId of this.CannotJumpOver){
            if (block.typeId === typeId){
                return false;
            }
        }

        return true;
    }

    /**
     * Returns if a given moveable block has a moveable block above it - and thus space to be stood on
     * @param block 
     */
    private CanBlockBeStoodOn(block: Block): boolean{
        let blockAbove: Block | undefined;
        try{
            blockAbove = block.above(1);
        }catch(e){}

        if (blockAbove !== undefined){
            if (this.IsBlockInCanMoveList(blockAbove)){
                return true;
            }
        }

        return false;
    }

    /**
     * Checks if a block is allowed in our can-move list
     * @param block 
     */
    private IsBlockInCanMoveList(block: Block): boolean{
        for (const typeId of this.CanMoveThroughBlocks){
            if (
                block.typeId === typeId
                || this.BlockTypeIdsToWhitelist.indexOf(block.typeId) > -1
                || this.BlocksToWhitelist.indexOf(block) > -1
                ){
                return true;
            }
        }

        return false;
    }

    /**
     * Checks if two blocks have the same location
     * @param block1 
     * @param block2 
     * @returns 
     */
    private DoBlocksHaveSameLocation(block1: Block, block2: Block): boolean{
        return block1.location.x === block2.location.x
            && block1.location.y === block2.location.y
            && block1.location.z === block2.location.z
    }

    /**
     * Checks if a node is present in the provided array of nodes by checking if the provided node's block matches any block locations in the listOfNodes array.
     * @param listOfBlocks
     * @param block 
     * @returns 
     */
    private GetIndexOfNodeIfInList(node: AStarNode, listOfNodes: AStarNode[]): number | null{
        for (const index in listOfNodes){
            const indexNumber: number = parseInt(index);
            const nodeInList: AStarNode = listOfNodes[indexNumber];
            if (this.DoBlocksHaveSameLocation(node.block, nodeInList.block)){
                return indexNumber;
            }
        }

        return null;
    }

    /**
     * Gets the index of the block with the lowest calculated F cost from a list of nodes
     * @param listOfNodes 
     * @returns 
     */
    private GetIndexOfNodeWithLowestFCost(listOfNodes: AStarNode[]): number{
        let currentLowestIndex = -1;
        let currentLowestFCost = -1;

        for (const index in listOfNodes){
            let indexNumber: number = parseInt(index);
            if (currentLowestIndex === -1){
                currentLowestFCost = this.CalculateFCost(listOfNodes[indexNumber].block);
                currentLowestIndex = indexNumber;
            }else{
                const thisFCost = this.CalculateFCost(listOfNodes[indexNumber].block);
                if (thisFCost < currentLowestFCost){
                    currentLowestFCost = thisFCost;
                    currentLowestIndex = indexNumber;
                }
            }
        }

        return currentLowestIndex;
    }

    private GetHashOfLocation(location: Vector3): string{
        return `${location.x},${location.y},${location.z}`;
    }

    /**
     * Calculates the "F" cost of a node, which is F = G + H
     * @param Block
     */
    private CalculateFCost(block: Block): number{
        return this.CalculateGCost(block) + this.CalculateHHeuristic(block);
    }

    /**
     * Calculates the "G" cost of a node
     * @param block 
     * @returns 
     */
    private CalculateGCost(block: Block): number{
        return Vector3Distance(block.location, this.Start);
    }

    /**
     * Calculates the "H" heuristic of a node
     * @param block 
     * @returns 
     */
    private CalculateHHeuristic(block: Block): number{
        return Vector3Distance(block.location, this.End);
    }
}