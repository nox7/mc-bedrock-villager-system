import { Block, BlockInventoryComponent, BlockPermutation, BlockRaycastHit, BlockRaycastOptions, Dimension, Entity, ItemStack, Vector3, system } from "@minecraft/server";
import WoodcutterManagerBlock from "../BlockHandlers/WoodcutterManagerBlock";
import NPC from "./NPC";
import BlockFinder from "../Utilities/BlockFinder";
import EntityWalker from "../Walker/EntityWalker";
import { WoodcutterState } from "./States/WoodcutterState";
import GetAllConnectedBlocksOfType from "../Utilities/GetAllConnectedBlocksOfType";
import Wait from "../Utilities/Wait";

export default class Woodcutter extends NPC{

    public static ENTITY_NAME = "nox:woodcutter";

    // Do not use "minecraft:log" as it matches all logs
    public static LOG_NAMES_TO_FIND = [
        "minecraft:oak_log", "minecraft:birch_log", "minecraft:spruce_log", "minecraft:jungle_log", 
        "minecraft:acacia_log", "minecraft:dark_oak_log",
    ];

    // Do not use "minecraft:log" as it matches all logs
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
                return BlockPermutation.resolve("minecraft:sapling").withState("sapling_type", Woodcutter.LOG_NAMES_TO_SAPLING_NAMES_MAP[logName]);
            }
        }

        return null;
    }

    private Dimension: Dimension;
    private State: WoodcutterState;
    private Entity: Entity | null = null;
    private WoodcutterManagerBlock: WoodcutterManagerBlock;
    private TargetWoodBlock: Block | null = null;
    private BlocksCarrying: {[key: string]: number} = {};

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
     * Adds a block to this Woodcutter's carrying inventory
     * @param typeId 
     * @param amount 
     */
    private AddBlockToCarryingStack(typeId: string, amount: number){
        if (!(typeId in this.BlocksCarrying)){
            this.BlocksCarrying[typeId] = 0;
        }

        this.BlocksCarrying[typeId] += amount;
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
                this.OnStateChangedToWalkingToChest();
                return resolve();
            }else if (this.State === WoodcutterState.WALKING_TO_CHEST){
                // Done. Restart everything
                this.State = WoodcutterState.NONE;
                this.IsReadyForStateChange = true;
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
            // Couldn't find an oak log. Wait 50 ticks and try again
            await Wait(50);

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

            // TODO
            // Return a value for "didReachDestination" and if it false, try walking again
            this.Entity?.setProperty("nox:is_moving", true);
            await walker.MoveTo(this.TargetWoodBlock);
            this.Entity?.setProperty("nox:is_moving", false);
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

            // Chop all the wood
            const connectedBlocks: Block[] = GetAllConnectedBlocksOfType(this.TargetWoodBlock, Woodcutter.LOG_NAMES_TO_FIND);

            // Add the logs to this NPC's inventory
            this.AddBlockToCarryingStack(targetBlockPermutation.type.id, connectedBlocks.length);

            let iteratorCount = 0;
            for (const block of connectedBlocks){
                ++iteratorCount;
                block.setPermutation(BlockPermutation.resolve("minecraft:air"));
                // await Wait(2);
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

    /**
     * When the state has changed for the woodcutter to walk back to the chest adjacent to his manager block
     */
    public async OnStateChangedToWalkingToChest(): Promise<void>{
        const chestToWalkTo: Block | null = this.WoodcutterManagerBlock.GetAdjacentChest();
        if (chestToWalkTo !== null){
            const chestInventory: BlockInventoryComponent | undefined = chestToWalkTo.getComponent("minecraft:inventory");
            const walker = new EntityWalker(this.Entity!);
            this.Entity?.setProperty("nox:is_moving", true);
            await walker.MoveTo(chestToWalkTo.location, 2);
            this.Entity?.setProperty("nox:is_moving", false);

            // Deposit items
            for (const typeId in this.BlocksCarrying){
                const amount: number = this.BlocksCarrying[typeId];
                if (chestInventory !== undefined){
                    const itemStack: ItemStack = new ItemStack(typeId, amount);
                    chestInventory.container?.addItem(itemStack);
                }
            }

            // Clear inventory
            this.BlocksCarrying = {};

            this.IsReadyForStateChange = true;
        }else{
            // No chest? Wait some time then try again
            await Wait(200);
            // Revert to previous state, but flag that the state is ready to change (to rerun this state change function)
            this.State = WoodcutterState.WOODCUTTING;
            this.IsReadyForStateChange = true;
        }
    }
}