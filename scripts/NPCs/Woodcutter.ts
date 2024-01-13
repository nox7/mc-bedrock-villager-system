import { Block, Dimension, Entity, Vector3, system } from "@minecraft/server";
import WoodcutterManagerBlock from "../BlockHandlers/WoodcutterManagerBlock";
import NPC from "./NPC";
import BlockFinder from "../Utilities/BlockFinder";
import EntityWalker from "../Walker/EntityWalker";
import { WoodcutterState } from "./States/WoodcutterState";

export default class Woodcutter extends NPC{

    public static ENTITY_NAME = "nox:woodcutter";
    public static LOG_NAMES_TO_FIND = ["minecraft:log"];

    // public static FromExistingEntity(
    //     entity: Entity, 
    //     dimension: Dimension, 
    //     location: Vector3){
    //     const woodcutter = new Woodcutter(dimension, location);
    //     woodcutter.CreateEntity(location);
    // }

    private Dimension: Dimension;
    private State: WoodcutterState;
    private Entity: Entity | null = null;
    private WoodcutterManagerBlock: WoodcutterManagerBlock;
    private TargetWoodBlock: Block | null = null;

    /**
     * If this entity is ready for a state change on the next game tick
     */
    public IsReadyForStateChange: boolean = true;

    public constructor(dimension: Dimension, woodcutterManagerBlockInstance: WoodcutterManagerBlock){
        super();
        this.State = WoodcutterState.NONE;
        this.Dimension = dimension;
        this.WoodcutterManagerBlock = woodcutterManagerBlockInstance;
    }

    /**
     * Creates a new entity and sets the Entity property
     */
    public CreateEntity(location: Vector3): void{
        this.Entity = this.Dimension.spawnEntity(Woodcutter.ENTITY_NAME, location);
    }

    /**
     * Returns the Entity property
     * @returns
     */
    public GetEntity(): Entity | null{
        return this.Entity;
    }

    /**
     * Called by the NPC handler. Avoid ever calling this manually
     */
    public override async OnGameTick(): Promise<void>{
        return new Promise(resolve => {

            // If this entity is not ready to change states, go ahead and resolve the promise
            if (!this.IsReadyForStateChange){
                return resolve();
            }

            if (this.State === WoodcutterState.NONE){
                this.State = WoodcutterState.SEARCHING;
                this.IsReadyForStateChange = false;
                this.OnStateChangeToSearching();
                return resolve();
            }else if (this.State === WoodcutterState.SEARCHING){
                this.State = WoodcutterState.WALKING_TO_WOOD;
                this.IsReadyForStateChange = false;
                this.OnStateChangeToWalkingToWood();
                return resolve();
            }else if (this.State === WoodcutterState.WALKING_TO_WOOD){
                // Not implemented
                this.State = WoodcutterState.WOODCUTTING;
                this.IsReadyForStateChange = false;
                return resolve();
            }
        });
    }

    /**
     * The state has been changed to SEARCHING
     * Find wood
     */
    public async OnStateChangeToSearching(): Promise<void>{
        const blockFinder: BlockFinder = new BlockFinder();
        const nearestOakLog: Block | null = await blockFinder.FindFirstBlockMatchingPermutation(
            this.Entity!.location,
            15,
            Woodcutter.LOG_NAMES_TO_FIND,
            this.Entity!.dimension
        );

        if (nearestOakLog === null){
            // Couldn't find an oak log. Wait 10 seconds to try again
            await new Promise<void>(resolve => {
                setTimeout(() => {
                    return resolve();
                }, 1000 * 10);
            });

            // Revert state backwards
            this.State = WoodcutterState.NONE;
            this.IsReadyForStateChange = true;
        }else{
            this.TargetWoodBlock = nearestOakLog;
            // NPC is now ready to change states
            this.IsReadyForStateChange = true;
        }
    }

    /**
     * The state has been changed to WALKING_TO_WOOD
     * Walk to the target block
     */
    public async OnStateChangeToWalkingToWood(): Promise<void>{
        if (this.TargetWoodBlock === null){
            // Revert state to searching for wood
            this.State = WoodcutterState.SEARCHING;
            this.IsReadyForStateChange = true;
        }else{
            const walker = new EntityWalker(this.Entity!);
            await walker.MoveTo(this.TargetWoodBlock);
            let attackTime = 0;
            let increments = Math.PI / 32;
            let loops = 0;
            this.Entity?.setProperty("nox:is_chopping", true);
            await new Promise<void>(resolve => {
                system.runTimeout(() => {
                    resolve();
                }, 100);
            });
            this.Entity?.setProperty("nox:is_chopping", false);
            this.IsReadyForStateChange = true;
        }
    }
}