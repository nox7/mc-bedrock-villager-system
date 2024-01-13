import { Entity, Vector2, Vector3, system } from "@minecraft/server";
import Vector3Distance from "../Utilities/Vector3Distance";
import ToUnitVector3 from "../Utilities/ToUnitVector3";

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
    private CurrentMoveToPromiseResolveFunction: (() => void) | null = null;

    public constructor(entity: Entity){
        this.Entity = entity;
    }

    /**
     * Stops the current entity's movement that is due to this walker
     */
    public Stop(): void{
        if (this.IsWalking){
            this.IsWalking = false;
            this.TargetLocation = null;
            this.CurrentSystemRunId = null;
            if (this.CurrentMoveToPromiseResolveFunction !== null){
                // Call the resolve function for the promise in the MoveTo method
                this.CurrentMoveToPromiseResolveFunction();
                this.CurrentMoveToPromiseResolveFunction = null;
            }
        }

        if (this.CurrentSystemRunId !== null){
            system.clearRun(this.CurrentSystemRunId);
        }
    }

    public MoveTo(location: Vector3, stopAtThreshold: number = 2.0): Promise<void>{
        if (this.IsWalking){
            throw "Entity is currently walking. You must stop the move before calling MoveTo again.";
        }

        this.TargetLocation = location;
        return new Promise(resolve => {
            this.CurrentMoveToPromiseResolveFunction = resolve;
            const runId: number = system.runInterval( () => {

                let entityLocation: Vector3;
                try{
                    entityLocation = this.Entity.location;
                }catch(e){
                    // Failed to get location. Probably dead or unloaded
                    // Stop the walker
                    this.Stop();
                    return resolve();
                }

                if (Vector3Distance(entityLocation!, location) < stopAtThreshold){
                    this.Stop();
                    return resolve();
                }else{
                    const direction = ToUnitVector3({
                        x: location.x - entityLocation!.x,
                        y: location.y - entityLocation!.y,
                        z: location.z - entityLocation!.z
                    });
        
                    this.Entity.teleport({
                        x: entityLocation!.x + direction.x / 8,
                        y: entityLocation!.y + direction.y / 8,
                        z: entityLocation!.z + direction.z / 8
                        },
                    {
                        facingLocation: location
                    });
                }
            });
            this.CurrentSystemRunId = runId;
        });
    }
}