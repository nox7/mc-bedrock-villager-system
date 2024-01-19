import { Block, BlockPermutation, Entity, Vector2, Vector3, system } from "@minecraft/server";
import Vector3Distance from "../Utilities/Vector3Distance";
import ToUnitVector3 from "../Utilities/ToUnitVector3";
import AStar from "./AStar";

/**
 * A walker class that will move an entity from one location to another.
 * 
 * TODO, will use A* and jump and stuff I guess
 */
export default class EntityWalker{

    private Entity: Entity;
    private IsWalking: boolean = false;
    private TargetLocation: Vector3 | null = null;
    private CurrentSystemRunId: number | null = null;
    private CurrentMoveToPromiseResolveFunction: ((value: boolean) => void) | null = null;

    public constructor(entity: Entity){
        this.Entity = entity;
    }

    /**
     * Stops the current entity's movement that is due to this walker
     */
    public Stop(didReachDestination: boolean): void{
        if (this.IsWalking){
            this.IsWalking = false;
            this.TargetLocation = null;
            this.CurrentSystemRunId = null;
            if (this.CurrentMoveToPromiseResolveFunction !== null){
                // Call the resolve function for the promise in the MoveTo method
                this.CurrentMoveToPromiseResolveFunction(didReachDestination);
                this.CurrentMoveToPromiseResolveFunction = null;
            }
        }

        if (this.CurrentSystemRunId !== null){
            system.clearRun(this.CurrentSystemRunId);
        }
    }

    /**
     * Uses A* to find a path to the target location from the entity's current location at the time of calling MoveTo.
     * If there is no path to the target, then false is returned. Otherwise, this method will walk the entity and return true
     * after the entity reaches the location.
     * @param location
     * @param stopAtThreshold How far to stop at the final block instead. Use something less than 1 if you want the entity to physically be at the last block. Using 0 is not recommended.
     * @param blockTypesToWhitelist A list of block TypeIds to provide to the A* pathfinder to tell are okay to be moved through in addition to the standard air blocks
     * @param blocksToWhitelist A liset of Minecraft Block instances to provide to the A* pathfinder to tell are okay to be moved through in addition to the standard air blocks
     * @returns 
     */
    public async MoveTo(location: Vector3, stopAtThreshold: number = 2.0, blockTypesToWhitelist: string[], blocksToWhitelist: Block[]): Promise<boolean>{
        if (this.IsWalking){
            throw "Entity is currently walking. You must stop the move before calling MoveTo again.";
        }

        const startLocation: Vector3 = this.Entity.location;
        this.TargetLocation = location;

        const aStar = new AStar(this.Entity.dimension, startLocation, this.TargetLocation, blockTypesToWhitelist, blocksToWhitelist);
        const blockPath: Block[] | null = await aStar.GetBlockPathFromStartToEnd();

        // if (blockPath !== null){
        //     for (const block of blockPath){
        //         console.warn(block.location.x, block.location.y, block.location.z);
        //     }
        // }

        if (blockPath === null){
            // There is not a path
            return false;
        }

        // Reverse the block path so the start is at the end 
        // The walker will pop the blocks off the end of the array and stop when there are no more
        blockPath.reverse();

        return new Promise(async resolve => {
            this.CurrentMoveToPromiseResolveFunction = resolve;
            const runId: number = system.runInterval(async () => {

                if (this.IsWalking){
                    return;
                }

                // blockPath is empty, no more blocks to walk
                if (blockPath.length === 0){
                    this.Stop(true);
                    return resolve(true);
                }

                const nextBlock: Block | undefined = blockPath.pop();
                // nextBlock?.setPermutation(BlockPermutation.resolve("red_wool"));

                let entityLocation: Vector3;
                try{
                    entityLocation = this.Entity.location;
                }catch(e){
                    // Failed to get location. Probably dead or unloaded
                    // Stop the walker
                    this.Stop(false);
                    return resolve(false);
                }

                if (nextBlock === undefined){
                    // nextBlock is undefined, no more blocks in the array
                    // IS THIS EVEN NEEDED? Since we check for array length at the start of the runInterval
                    this.Stop(true);
                    return resolve(true);
                }else{
                    const isCurrentBlockTheLastBlock = blockPath.length === 0;
                    const targetBlockCenterLocation: Vector3 = nextBlock.center();
                    const targetLocation = {x: targetBlockCenterLocation.x, y: targetBlockCenterLocation.y - 0.5, z: targetBlockCenterLocation.z};
                    this.IsWalking = true;

                    // Repeatedly walk to nextBlock.location until we're about there
                    await new Promise<void>(innerResolve => {
                        let innerRunId = system.runInterval(() => {
                            // End this inner walk when the entity is close enough to the targetLocation
                            // If this is the last block, then use stopAtThreshold instead
                            if ((isCurrentBlockTheLastBlock === true && Vector3Distance(targetLocation, this.Entity.location) < stopAtThreshold)
                                || (isCurrentBlockTheLastBlock === false && Vector3Distance(targetLocation, this.Entity.location) < 0.15)
                            ){
                                this.IsWalking = false;
                                system.clearRun(innerRunId);
                                return innerResolve();
                            }

                            const direction = ToUnitVector3({
                                x: targetLocation.x - this.Entity.location.x,
                                y: targetLocation.y - this.Entity.location.y,
                                z: targetLocation.z - this.Entity.location.z
                            });

                            this.Entity.teleport({
                                x: this.Entity.location.x + direction.x / 8,
                                y: this.Entity.location.y + direction.y / 8,
                                z: this.Entity.location.z + direction.z / 8
                                },
                                {
                                    facingLocation: targetLocation
                                }
                            );
                        });
                    });

                    // if (!isCurrentBlockTheLastBlock){
                    //     nextBlock?.setPermutation(BlockPermutation.resolve("minecraft:tallgrass"));
                    // }
                }
            });
            this.CurrentSystemRunId = runId;
        });
    }
}