import { Block, BlockPermutation, BlockRaycastHit, BlockRaycastOptions, Dimension, Entity, Vector3, system } from "@minecraft/server";
import WoodcutterManagerBlock from "../BlockHandlers/WoodcutterManagerBlock";
import NPC from "./NPC";
import BlockFinder from "../Utilities/BlockFinder";
import EntityWalker from "../Walker/EntityWalker";
import { WoodcutterState } from "./States/WoodcutterState";
import GetAllConnectedBlocksOfType from "../Utilities/GetAllConnectedBlocksOfType";

export default class Woodcutter extends NPC{

    public static ENTITY_NAME = "nox:woodcutter";
    public static LOG_NAMES_TO_FIND = [
        "minecraft:oak_log", "minecraft:birch_log", "minecraft:spruce_log", "minecraft:jungle_log", 
        "minecraft:acacia_log", "minecraft:dark_oak_log",
    ];

    public static LOG_NAMES_TO_SAPLING_NAMES_MAP: {[key: string]: string} = {
        "minecraft:oak_log": "oak",
        "minecraft:birch_log": "birch",
        "minecraft:spruce_log": "spruce",
        "minecraft:jungle_log": "mjungle",
        "minecraft:acacia_log": "acacia",
        "minecraft:dark_oak_log": "dark_oak", // Will need special treatment, because it places four
    };

    /**
     * Gets the name of the sapling related to a log provided a BlockPermutation
     * @returns 
     */
    public static GetSaplingPermuationFromLogPermutation(blockPermutation: BlockPermutation): BlockPermutation | null{
        for (const logName in Woodcutter.LOG_NAMES_TO_SAPLING_NAMES_MAP){
            if (blockPermutation.matches(logName)){
                console.warn(logName, "matches sapling", Woodcutter.LOG_NAMES_TO_SAPLING_NAMES_MAP[logName]);
                return BlockPermutation.resolve("minecraft:sapling").withState("sapling_type", Woodcutter.LOG_NAMES_TO_SAPLING_NAMES_MAP[logName]);
            }
        }

        return null;
    }

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
                this.State = WoodcutterState.WOODCUTTING;
                this.IsReadyForStateChange = false;
                this.OnStateChangeToWoodcutting();
                return resolve();
            }else if (this.State === WoodcutterState.WOODCUTTING){
                this.State = WoodcutterState.WALKING_TO_CHEST
                this.IsReadyForStateChange = false;
                // this.OnStateChangeToWoodcutting();
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
            this.IsReadyForStateChange = true;
        }
    }

    /**
     * The state has been changed to WOODCUTTING
     * Chop down the TargetWoodBlock
     */
    public async OnStateChangeToWoodcutting(): Promise<void>{
        this.Entity?.setProperty("nox:is_chopping", true);
        
        await new Promise<void>(resolve => {
            system.runTimeout(() => {
                resolve();
            }, 100);
        });
        
        this.Entity?.setProperty("nox:is_chopping", false);
        
        if (this.TargetWoodBlock !== null){
            const targetBlockPermutation = this.TargetWoodBlock.permutation;
            const targetBlockLocation: Vector3 = this.TargetWoodBlock.location;
            const targetBlockDimension: Dimension = this.TargetWoodBlock.dimension;
            console.warn(this.TargetWoodBlock.type.id);
            console.warn(this.TargetWoodBlock.typeId);
            console.warn(this.TargetWoodBlock.permutation.type.id);

            // Chop all the wood
            const connectedBlocks: Block[] = GetAllConnectedBlocksOfType(this.TargetWoodBlock, Woodcutter.LOG_NAMES_TO_FIND);
            for (const block of connectedBlocks){
                block.setPermutation(BlockPermutation.resolve("minecraft:air"));
            }

            // Get the dirt block that should/was under the tree
            const raycastOptions: BlockRaycastOptions = {
                includeLiquidBlocks: false,
                includePassableBlocks: false,
                maxDistance: 5
            };

            const blockRaycastHit: BlockRaycastHit | undefined = targetBlockDimension.getBlockFromRay(targetBlockLocation, {x: 0, y:-1, z:0}, raycastOptions);
            if (blockRaycastHit !== undefined){
                const blockHit = blockRaycastHit.block;
                if (blockHit.permutation.matches("minecraft:dirt") || blockHit.permutation.matches("minecraft:grass")){
                    // Place a sapling
                    const saplingToPlace: BlockPermutation | null = Woodcutter.GetSaplingPermuationFromLogPermutation(targetBlockPermutation);
                    if (saplingToPlace !== null){
                        const blockAboveLocation: Block | undefined = blockHit.above(1);
                        if (blockAboveLocation !== undefined){
                            blockAboveLocation.setPermutation(saplingToPlace);
                        }
                    }
                }
            }
        }


        this.IsReadyForStateChange = true;
    }
}