import { Block, BlockPermutation, Vector, Vector3, system } from "@minecraft/server";
import CuboidRegion from "../Utilities/Region/CuboidRegion";
import Debug from "../Debug/Debug";
import { IAStarOptions } from "./Interfaces/IAStarOptions";
import { VectorUtils } from "../Utilities/Vector/VectorUtils";
import { BlockSafetyCheckerUtility } from "./BlockSafetyChecker/BlockSafetyCheckerUtility";
import { BlockSafetyCheckerOptions } from "./BlockSafetyChecker/BlockSafetyCheckerOptions";
import { BlockSafetyCheckResult } from "./BlockSafetyChecker/BlockSafetyCheckResult";
import FencesList from "../Utilities/TypeIdLists/FencesList";
import WallsList from "../Utilities/TypeIdLists/WallsList";

interface IAStarNode {
    Block: Block;
    ParentNode: IAStarNode | null;
    FCost: number;
    GCost: number;
    HCost: number;
}

type ClosedAStarLocations = {[key: string]: IAStarNode};

/**
 * Implementation of the A* algorithm for Minecraft
 */
export default class AStar{

    private Options: IAStarOptions;
    private StartBlock: Block;
    private EndBlock: Block;

    public constructor(options: IAStarOptions){
        this.Options = options;

        let startBlock: Block | undefined;
        let endBlock: Block | undefined;
        try{
            startBlock = this.Options.Dimension.getBlock(this.Options.StartLocation);
            endBlock = this.Options.Dimension.getBlock(this.Options.GoalLocations);
        }catch(e){}
        
        if (startBlock !== undefined && endBlock !== undefined){
            this.StartBlock = startBlock;
            this.EndBlock = endBlock;
        }else{
            throw "Start and End must point to valid and loaded blocks.";
        }
    }

    /**
     * Performs A* pathfinding from the start to the end and returns a list of blocks to traverse to get there. Throws an exception if 
     * no path can be found or if the maximum number of nodes to consider was reached.
     * @throws
     */
    public async GetBlockPathFromStartToEnd(): Promise<Block[]>{
        return new Promise<Block[]>(async (resolve, reject) => {
            const openList: IAStarNode[] = [ 
                {
                    Block: this.StartBlock, 
                    ParentNode: null,
                    FCost: this.CalculateFCost(this.StartBlock),
                    GCost: this.CalculateGCost(this.StartBlock),
                    HCost: this.CalculateHHeuristic(this.StartBlock),
                }
            ];
            const closedListLocations: ClosedAStarLocations = {};
    
            let runId = system.runInterval(() => {
                if (openList.length == 0){
                    system.clearRun(runId);
                    return reject("No path could be found to the destination. All adjacent moveable nodes to consider has been exhausted.");
                }

                // Check if we have considered too many nodes and the path may be too difficult or impossible to get to
                if (Object.keys(closedListLocations).length >= this.Options.MaximumNodesToConsider){
                    system.clearRun(runId);
                    return reject("Maximum number of nodes considered. MaximumNodesToConsider limit option hit.");
                }

                const nextIndex: number = this.GetIndexOfNodeWithLowestFCost(openList);
                const nextNode: IAStarNode = openList[nextIndex];
                const locationHash: string = VectorUtils.GetAsString(nextNode.Block.location);
    
                // Check if the nextNode is the EndBlock
                if (VectorUtils.AreEqual(nextNode.Block, this.EndBlock)){
                    // We've hit the end
                    const blockPath: Block[] = [];
                    let currentNode: IAStarNode | null = nextNode;
                    while (currentNode !== null){
                        blockPath.push(currentNode.Block);
                        currentNode = currentNode.ParentNode;
                    }
    
                    system.clearRun(runId);
                    return resolve(blockPath.reverse());
                }
    
                // Remove the nextIndex from the open node list
                openList.splice(nextIndex, 1);
    
                // Add it to closed list locations
                closedListLocations[locationHash] = nextNode;

                nextNode.Block.above(7)?.setPermutation(BlockPermutation.resolve("light_blue_wool"));
    
                // Get all the adjacent locations surrounding the nextNode.Block
                const surroundingLocations: Vector3[] = CuboidRegion.FromCenterLocation(nextNode.Block.location, 1, true).GetAllLocationsInRegion();

                // From the adjacent locations, get a list of Blocks that can be walked to
                // These will be "safe" blocks that can be moved to. E.g., if one of the surroundingLocations is an air block
                // and the block below it is also air - we will check if the A* should "fall" safely down to that block
                // or if it's a possible cliff and we shouldn't go that way
                const surroundingBlocks: Block[] = [];

                const safetyCheckOptions = new BlockSafetyCheckerOptions();
                safetyCheckOptions.TagsToConsiderPassable = this.Options.TagsToConsiderPassable;
                safetyCheckOptions.TypeIdsToConsiderPassable = this.Options.TypeIdsToConsiderPassable;

                // By default, let's tell it fences and walls cannot be jumped over
                safetyCheckOptions.TypeIdsThatCannotBeJumpedOver = [...FencesList, ...WallsList];

                for (const location of surroundingLocations){
                    let blockAtLocation: Block | undefined;
                    try{
                        blockAtLocation = this.Options.Dimension.getBlock(location);
                    }catch(e){}
                    if (blockAtLocation !== undefined){
                        // Is it the block we're looking for?
                        if (VectorUtils.AreEqual(location, this.Options.GoalLocations)){
                            // Add it regardless of safety
                            surroundingBlocks.push(blockAtLocation);
                        }else{
                            // Check it is safe to move to, fall down from, or jump ontop of
                            const safetyCheckResult: BlockSafetyCheckResult = BlockSafetyCheckerUtility.RunBlockSafetyCheck(blockAtLocation, safetyCheckOptions);
                            if (safetyCheckResult.IsSafe){
                                // Check if it's safe to fall from
                                if (safetyCheckResult.CanSafelyFallFrom){
                                    // Use the block below blockAtLocation
                                    surroundingBlocks.push(<Block>blockAtLocation.below(1));
                                }else if (safetyCheckResult.CanSafelyJumpOnto){
                                    // Use the block above blockAtLocation
                                    surroundingBlocks.push(<Block>blockAtLocation.above(1));
                                }else{
                                    // The 'blockAtLocation' itself is fine
                                    surroundingBlocks.push(blockAtLocation);
                                }
                            }
                        }

                    }
                }

                // The surroundingBlocks array is now an array of blocks that can be walked to, jumped to, or fallen to - all safely
                for (const surroundingBlock of surroundingBlocks){
                    // Build the surrounding node from the surroundingBlock and set the parent as the current nextNode
                    const surroundingNode: IAStarNode = {
                        Block: surroundingBlock, 
                        ParentNode: nextNode,
                        FCost: this.CalculateFCost(surroundingBlock),
                        GCost: nextNode.GCost + 1,// this.CalculateGCost(surroundingBlock),
                        HCost: this.CalculateHHeuristic(surroundingBlock),
                    };
                    const surroundingBlockLocationHash: string = VectorUtils.GetAsString(surroundingBlock.location);

                    // Check if this block is the end block
                    if (VectorUtils.AreEqual(surroundingBlock, this.EndBlock)){
                        // Add the end block to the openList
                        openList.push(surroundingNode);
                        
                        // Break out of this for loop
                        break;
                    }

                    // Check if the block is in the closed list
                    if (surroundingBlockLocationHash in closedListLocations){
                        // Skip this block
                        continue;
                    }

                    // Check if the block is already in the open list
                    const indexOfExistingNodeInOpenList: number | null = this.GetIndexOfNodeIfInList(surroundingNode, openList);
                    if (indexOfExistingNodeInOpenList === null){
                        // It is not in the openList, add it to the open list
                        openList.push(surroundingNode);
                    }else{
                        // It's already in the openList
                        // Compare the existing openList index node value to the surroundingNode g cost value
                        // If the surroundingNode.gCost is less than the existing openList index node value, then
                        // modify the existing openLiset index node value to have the new gCost and fCost and parent to match surroundingNode's properties
                        if (openList[indexOfExistingNodeInOpenList].GCost > surroundingNode.GCost){
                            openList[indexOfExistingNodeInOpenList].GCost = surroundingNode.GCost;
                            openList[indexOfExistingNodeInOpenList].ParentNode = surroundingNode.ParentNode;
                        }
                    }
                }
            });
        });
    }

    /**
     * Checks if a node is present in the provided array of nodes by checking if the provided node's block matches any block locations 
     * in the listOfNodes array.
     * @param listOfBlocks
     * @param block 
     * @returns 
     */
    private GetIndexOfNodeIfInList(node: IAStarNode, listOfNodes: IAStarNode[]): number | null{
        for (const index in listOfNodes){
            const indexNumber: number = parseInt(index);
            const nodeInList: IAStarNode = listOfNodes[indexNumber];
            if (VectorUtils.AreEqual(node.Block, nodeInList.Block)){
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
    private GetIndexOfNodeWithLowestFCost(listOfNodes: IAStarNode[]): number{
        let currentLowestIndex = -1;
        let currentLowestFCost = -1;

        for (const index in listOfNodes){
            let indexNumber: number = parseInt(index);
            if (currentLowestIndex === -1){
                currentLowestFCost = this.CalculateFCost(listOfNodes[indexNumber].Block);
                currentLowestIndex = indexNumber;
            }else{
                const thisFCost = this.CalculateFCost(listOfNodes[indexNumber].Block);
                if (thisFCost < currentLowestFCost){
                    currentLowestFCost = thisFCost;
                    currentLowestIndex = indexNumber;
                }
            }
        }

        return currentLowestIndex;
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
        return Vector.distance(block.location, this.Options.StartLocation);
    }

    /**
     * Calculates the "H" heuristic of a node
     * @param block 
     * @returns 
     */
    private CalculateHHeuristic(block: Block): number{
        return Vector.distance(block.location, this.Options.GoalLocations);
    }
}