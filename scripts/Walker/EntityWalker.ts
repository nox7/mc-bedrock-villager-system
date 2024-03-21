import { Block, Entity, Vector3, system } from "@minecraft/server";
import AStar from "../NoxBedrockUtilities/Pathfinder/AStar";
import { VectorUtils } from "../NoxBedrockUtilities/Vector/VectorUtils";
import { AStarOptions } from "../NoxBedrockUtilities/Pathfinder/AStarOptions";
import { Vector3Utils } from "@minecraft/math";
import Debug from "../Debug/Debug";

/**
 * A walker class that will move an entity from one location to another.
 * 
 * TODO, will use A* and jump and stuff I guess
 */
export default class EntityWalker{

    private Entity: Entity;
    private IsWalking: boolean = false;
    private PathfindingOptions: AStarOptions;
    private CurrentSystemRunId: number | null = null;
    private CurrentMoveToPromiseResolveFunction: ((value: boolean) => void) | null = null;

    public constructor(entity: Entity, options: AStarOptions){
        this.Entity = entity;
        this.PathfindingOptions = options;
    }

    /**
     * Stops the current entity's movement that is due to this walker
     */
    public Stop(didReachDestination: boolean): void{
        if (this.IsWalking){
            this.IsWalking = false;
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
     * @param stopAtThreshold How far to stop at the final block instead. Use something less than 1 if you want the entity to physically be at the last block. Using 0 is not recommended.
     * @returns
     * @throws 
     */
    public async MoveTo(
        speed: number = 1 / 8,
        stopAtThreshold: number = 2.0
        ): Promise<boolean>
    {

        if (this.IsWalking){
            throw "Entity is currently walking. You must stop the move before calling MoveTo again.";
        }

        let aStar: AStar;
        try{
            aStar = new AStar(this.PathfindingOptions);
        }catch(e){
            // Failed to construct - start/end blocks probably not loaded
            return false;
        }

        Debug.Info("Finding path...");
        const blockPath: Block[] = await aStar.Pathfind();
        Debug.Info("Path found.");

        // Reverse the block path so the start is at the end 
        // The walker will pop the blocks off the end of the array and stop when there are no more
        blockPath.reverse();

        return new Promise(async resolve => {
            this.CurrentMoveToPromiseResolveFunction = resolve;
            const runId: number = system.runInterval(async () => {

                if (this.IsWalking){
                    return;
                }

                this.IsWalking = true;

                // blockPath is empty, no more blocks to walk
                if (blockPath.length === 0){
                    this.Stop(true);
                    return resolve(true);
                }

                const nextBlock: Block | undefined = blockPath.pop();
                // nextBlock?.setPermutation(BlockPermutation.resolve("red_wool"));

                // Cancel everything if this entity suddenly becomes invalid
                if (!this.Entity.isValid()){
                    Debug.Info("Entity is invalid. Stopping EntityWalker movement.");
                    this.Stop(false);
                    return resolve(false);
                }

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

                    // Repeatedly walk to nextBlock.location until we're about there
                    const maxLoops = 2500; // Max 2500 ticks before it gives up
                    let currentLoops = 0;
                    await new Promise<void>(innerResolve => {
                        let innerRunId = system.runInterval(() => {

                            ++currentLoops;
                            if (currentLoops >= maxLoops){
                                Debug.Warn("Stopped walker due to max loops hit");
                                this.Stop(false);
                                system.clearRun(innerRunId);
                                return innerResolve();
                            }

                            // Cancel everything if this entity suddenly becomes invalid
                            if (!this.Entity.isValid()){
                                Debug.Warn("Entity is invalid during movement. Stopping inner resolve. Maybe should be stopping outer resolve?");
                                this.Stop(false);
                                system.clearRun(innerRunId);
                                return innerResolve();
                            }

                            // End this inner walk when the entity is close enough to the targetLocation
                            // If this is the last block, then use stopAtThreshold instead
                            if ((isCurrentBlockTheLastBlock === true && Vector3Utils.distance(targetLocation, this.Entity.location) < stopAtThreshold)
                                || (isCurrentBlockTheLastBlock === false && Vector3Utils.distance(targetLocation, this.Entity.location) < 0.15)
                            ){
                                this.IsWalking = false;
                                system.clearRun(innerRunId);
                                return innerResolve();
                            }

                            const direction = VectorUtils.Unit({
                                x: targetLocation.x - this.Entity.location.x,
                                y: targetLocation.y - this.Entity.location.y,
                                z: targetLocation.z - this.Entity.location.z
                            });

                            this.Entity.teleport({
                                x: this.Entity.location.x + direction.x * speed,
                                y: this.Entity.location.y + direction.y * speed,
                                z: this.Entity.location.z + direction.z * speed
                                },
                                {
                                    facingLocation: targetLocation
                                }
                            );

                            Debug.Info(`Moving in direction ${Vector3Utils.toString(direction)}`);
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