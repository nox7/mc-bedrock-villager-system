import { Block, BlockInventoryComponent, BlockPermutation, BlockRaycastHit, BlockRaycastOptions, Dimension, Entity, ItemStack, Vector3, system, world } from "@minecraft/server";
import WoodcutterManagerBlock from "../BlockHandlers/WoodcutterManagerBlock";
import NPC from "./NPC";
import BlockFinder from "../Utilities/BlockFinder";
import EntityWalker from "../Walker/EntityWalker";
import { WoodcutterState } from "./States/WoodcutterState";
import GetAllConnectedBlocksOfType from "../Utilities/GetAllConnectedBlocksOfType";
import Wait from "../Utilities/Wait";
import NPCHandler from "../NPCHandler";

export default class Woodcutter extends NPC{

    public static ENTITY_NAME = "nox:woodcutter";

    /**
     * A cache of known Woodcutter instances in memory
     */
    public static Cache: Woodcutter[] = [];

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

    public static LEAVES_NAMES = [
        "minecraft:leaves", "minecraft:leaves2", "minecraft:mangrove_leaves", 
        "minecraft:cherry_leaves", "minecraft:azalea_leaves", "minecraft:azalea_leaves_flowered"
    ];

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

    /**
     * Clears a Woodcutter instance from the cache and also deletes the entity from the world
     * @param woodcutter
     */
    public static ClearFromCache(woodcutter: Woodcutter): void{
        for (const woodcutterInstanceIndex in Woodcutter.Cache){
            if (Woodcutter.Cache[woodcutterInstanceIndex] === woodcutter){
                Woodcutter.Cache[woodcutterInstanceIndex].Entity?.remove();
                Woodcutter.Cache.slice(parseInt(woodcutterInstanceIndex), 1);
                break;
            }
        }
    }

    /**
     * Fetches a Woodcutter class instance by an Entity object. If it is not registered in the cache, then null is returned.
     * @param entity 
     */
    public static GetFromCache(entity: Entity): Woodcutter | null{
        for (const woodcutterInstance of Woodcutter.Cache){
            const noxId = woodcutterInstance.Id;
            if (noxId !== undefined){
                const noxIdFromEntity = entity.getProperty("nox:id");
                if (noxIdFromEntity !== undefined){
                    if (noxId === noxIdFromEntity){
                        return woodcutterInstance;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Loads a Woodcutter instance from an existing Entity that is not yet registered in the server memory with the Woodcutter.Cache property
     * @param entity
     */
    public static async LoadFromExistingEntity(entity: Entity, npcHandlerInstance: NPCHandler): Promise<Woodcutter | null>{
        const managerBlockLocationX = entity.getProperty("nox:woodcutter_manager_block_location_x");
        const managerBlockLocationY = entity.getProperty("nox:woodcutter_manager_block_location_y");
        const managerBlockLocationZ = entity.getProperty("nox:woodcutter_manager_block_location_z");

        if (managerBlockLocationX === undefined || managerBlockLocationY === undefined || managerBlockLocationZ === undefined){
            // Cannot load this entity - no saved manager block. Just delete them
            entity.remove();
        }else{
            // Instantiate the Woodcutter
            const woodcutter = new Woodcutter(entity.dimension, null);
            woodcutter.IsLoading = true;
            woodcutter.SetEntity(entity);
            
            // Find the block
            const locationOfManagerBlock: Vector3 = {
                x: Number(managerBlockLocationX),
                y: Number(managerBlockLocationY),
                z: Number(managerBlockLocationZ),
            }

            let blockFromLocation: Block | undefined;
            
            await new Promise<void>(resolve => {
                let runId = system.runInterval(() => {
                    // Throws an exception if the block is in an unloaded chunk
                    try{
                        blockFromLocation = entity.dimension.getBlock(locationOfManagerBlock);
                    }catch(e){}

                    if (blockFromLocation !== undefined){
                        // Found it
                        system.clearRun(runId);
                        return resolve();
                    }
                }, 10);
            });

            // blockFromLocation is no longer undefined here
            if (blockFromLocation !== undefined){
                if (blockFromLocation?.typeId === WoodcutterManagerBlock.BlockTypeId){
                    // This is the management block
                    const managementBlock = new WoodcutterManagerBlock(blockFromLocation);
                    woodcutter.SetWoodcutterManagerBlock(managementBlock);
                    woodcutter.IsLoading = false;

                    // Register the NPC
                    npcHandlerInstance.RegisterNPC(woodcutter);
                }else{
                    // The block at the stored location is no longer a manager block
                    // Remove this entity
                    Woodcutter.ClearFromCache(woodcutter);
                }

            }else{
                // How did we get here?
                throw "Unreachable code got reached in Woodcutter.js somehow";
            }
            
            
            return woodcutter;
        }

        return null;
    }

    private Id: number | undefined;
    private Dimension: Dimension;
    private State: WoodcutterState;
    private Entity: Entity | null = null;
    private WoodcutterManagerBlock: WoodcutterManagerBlock | null;
    private TargetWoodBlock: Block | null = null;
    private BlocksCarrying: {[key: string]: number} = {};

    /**
     * Flag for if the Woodcutter class is currently being loaded
     */
    public IsLoading: boolean = false;

    /**
     * If this entity is ready for a state change on the next game tick
     */
    public IsReadyForStateChange: boolean = true;

    public constructor(dimension: Dimension, woodcutterManagerBlockInstance: WoodcutterManagerBlock | null){
        super();
        this.State = WoodcutterState.NONE;
        this.Dimension = dimension;
        this.WoodcutterManagerBlock = woodcutterManagerBlockInstance;
        Woodcutter.Cache.push(this);
    }
    
    /**
     * Gets the nox:id stored in memory that was loaded from the Entity
     */
    public GetId(): number | undefined{
        return this.Id
    }

    /**
     * Gets the nox:id of the Entity, or undefined if it doesn't exist
     */
    public GetIdFromEntity(): number | undefined{
        const noxId = this.Entity?.getDynamicProperty("nox:id");
        if (noxId !== undefined){
            return Number(noxId);
        }

        return undefined;
    }

    /**
     * Sets the enum state of this NPC by the name of the enum as a string
     * @param enumState
     */
    public SetState(enumState: WoodcutterState): void{
        this.State = enumState;
        this.Entity?.setProperty("nox:state_enum", WoodcutterState[enumState]);
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
     * Creates a new entity and sets the Entity property of this class. The new entity is assigned a unique Id for this world.
     */
    public CreateEntity(location: Vector3): void{
        const nextWoodcutterId = world.getDynamicProperty("nox:next_woodcutter_id");
        if (nextWoodcutterId !== undefined){
            // Increment the world's next_woodcutter_id
            world.setDynamicProperty("nox:next_woodcutter_id", Number(nextWoodcutterId) + 1);
    
            this.Entity = this.Dimension.spawnEntity(Woodcutter.ENTITY_NAME, location);
            this.Entity.setProperty("nox:id", Number(nextWoodcutterId));
            this.Entity.setProperty("nox:woodcutter_manager_block_location_x", this.WoodcutterManagerBlock!.GetBlock().location.x);
            this.Entity.setProperty("nox:woodcutter_manager_block_location_y", this.WoodcutterManagerBlock!.GetBlock().location.y);
            this.Entity.setProperty("nox:woodcutter_manager_block_location_z", this.WoodcutterManagerBlock!.GetBlock().location.z);

            // Set the state (will set the Entity property nox:state_enum) to the currently loaded state in memory
            this.SetState(this.State);
        }
    }

    /**
     * Returns the Entity property
     * @returns
     */
    public GetEntity(): Entity | null{
        return this.Entity;
    }

    public SetEntity(entity: Entity): void{
        this.Entity = entity;
    }

    public SetWoodcutterManagerBlock(managerBlockInstance: WoodcutterManagerBlock): void{
        this.WoodcutterManagerBlock = managerBlockInstance;
    }

    /**
     * Called by the NPC handler. Avoid ever calling this manually
     */
    public override async OnGameTick(): Promise<void>{
        if (this.IsLoading){
            return;
        }

        // Do nothing if the entity is invalid
        if (!this.Entity?.isValid()){
            return;
        }

        return new Promise(resolve => {

            // If this entity is not ready to change states, go ahead and resolve the promise
            if (!this.IsReadyForStateChange){
                return resolve();
            }

            if (this.State === WoodcutterState.NONE){
                this.SetState(WoodcutterState.SEARCHING);
                this.IsReadyForStateChange = false;
                this.OnStateChangeToSearching();
                return resolve();
            }else if (this.State === WoodcutterState.SEARCHING){
                this.SetState(WoodcutterState.WALKING_TO_WOOD);
                this.IsReadyForStateChange = false;
                this.OnStateChangeToWalkingToWood();
                return resolve();
            }else if (this.State === WoodcutterState.WALKING_TO_WOOD){
                this.SetState(WoodcutterState.WOODCUTTING);
                this.IsReadyForStateChange = false;
                this.OnStateChangeToWoodcutting();
                return resolve();
            }else if (this.State === WoodcutterState.WOODCUTTING){
                this.SetState(WoodcutterState.WALKING_TO_CHEST);
                this.IsReadyForStateChange = false;
                this.OnStateChangedToWalkingToChest();
                return resolve();
            }else if (this.State === WoodcutterState.WALKING_TO_CHEST){
                // Done. Restart everything
                this.SetState(WoodcutterState.NONE);
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

        let nearestOakLog: Block | null;
        try{
            nearestOakLog = await blockFinder.FindFirstBlockMatchingPermutation(
                this.Entity!.location,
                15,
                Woodcutter.LOG_NAMES_TO_FIND,
                this.Entity!.dimension
            );
        }catch(e){
            // Exception happened while searching for a block - most likely the starting location is
            // undefined or unloaded
            // Wait a bit and then reset this Woodcutter's state to NONE for now
            await Wait(100);
            this.SetState(WoodcutterState.NONE);
            this.IsReadyForStateChange = true;
            return;
        }

        if (nearestOakLog === null){
            // Couldn't find an oak log. Wait 100 ticks and try again
            await Wait(100);

            // Revert state backwards
            this.SetState(WoodcutterState.NONE);
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
            this.SetState(WoodcutterState.SEARCHING);
            this.IsReadyForStateChange = true;
        }else{
            const walker = new EntityWalker(this.Entity!);

            this.Entity?.setProperty("nox:is_moving", true);
            const didReachDestination = await walker.MoveTo(this.TargetWoodBlock, 2.0, Woodcutter.LEAVES_NAMES, []);

            if (!didReachDestination){
                // Try again
                this.SetState(WoodcutterState.SEARCHING);
            }

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
        
        await Wait(100);

        // Did the entity become invalid after waiting? If so, just reset the entire state
        if (!this.Entity?.isValid()){
            this.SetState(WoodcutterState.NONE)
            this.IsReadyForStateChange = true;
            return;
        }
        
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
        const chestToWalkTo: Block | null = this.WoodcutterManagerBlock!.GetAdjacentChest();
        if (chestToWalkTo !== null){
            const chestInventory: BlockInventoryComponent | undefined = chestToWalkTo.getComponent("minecraft:inventory");
            const walker = new EntityWalker(this.Entity!);
            this.Entity?.setProperty("nox:is_moving", true);
            await walker.MoveTo(chestToWalkTo.location, 2, [], []);

            // Did the entity become invalid after waiting/walking? If so, just reset the entire state
            if (!this.Entity?.isValid()){
                this.SetState(WoodcutterState.NONE)
                this.IsReadyForStateChange = true;
                return;
            }

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
            this.SetState(WoodcutterState.WOODCUTTING);
            this.IsReadyForStateChange = true;
        }
    }
}