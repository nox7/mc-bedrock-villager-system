import { Block, BlockInventoryComponent, BlockPermutation, BlockRaycastHit, BlockRaycastOptions, Dimension, Entity, ItemStack, Vector3, system, world } from "@minecraft/server";
import WoodcutterManagerBlock from "../BlockHandlers/WoodcutterManagerBlock";
import NPC from "./NPC";
import EntityWalker from "../Walker/EntityWalker";
import { WoodcutterState } from "./States/WoodcutterState";
import GetAllConnectedBlocksOfType from "../Utilities/GetAllConnectedBlocksOfType";
import Wait from "../Utilities/Wait";
import { NPCHandler } from "../NPCHandler";
import Debug from "../Debug/Debug";
import { BlockFinderOptions } from "../Utilities/BlockFinder/BlockFinderOptions";
import { BlockFinder } from "../Utilities/BlockFinder/BlockFinder";
import { VectorUtils } from "../Utilities/Vector/VectorUtils";
import { DarkOakSaplingLocationFinder } from "../Utilities/DarkOakSaplingLocationFinder";
import { SaplingRaycastPlanter } from "../Utilities/SaplingRaycastPlanter";
import WallsList from "../Utilities/TypeIdLists/WallsList";
import FencesList from "../Utilities/TypeIdLists/FencesList";

export default class Woodcutter extends NPC{

    public static ENTITY_NAME = "nox:woodcutter";

    /**
     * A cache of known Woodcutter instances in memory
     */
    public static Cache: Woodcutter[] = [];

    // Do not use "minecraft:log" as it matches all logs
    public static LOG_TYPE_IDS_TO_FIND = [
        "minecraft:oak_log", 
        "minecraft:birch_log", 
        "minecraft:spruce_log", 
        "minecraft:jungle_log", 
        "minecraft:acacia_log", 
        "minecraft:dark_oak_log",
        "minecraft:mangrove_log",
        "minecraft:mangrove_roots",
        "minecraft:cherry_log",
    ];

    // Do not use "minecraft:log" as it matches all logs
    // Cherry and mangrove have special scenarios and are not listed here
    public static LOG_NAMES_TO_SAPLING_NAMES_MAP: {[key: string]: string} = {
        "minecraft:oak_log": "oak",
        "minecraft:birch_log": "birch",
        "minecraft:spruce_log": "spruce",
        "minecraft:jungle_log": "mjungle",
        "minecraft:acacia_log": "acacia",
        "minecraft:dark_oak_log": "dark_oak",
    };

    public static LEAVES_NAMES = [
        "minecraft:leaves", "minecraft:leaves2", "minecraft:mangrove_leaves", 
        "minecraft:cherry_leaves", "minecraft:azalea_leaves", "minecraft:azalea_leaves_flowered"
    ];

    /**
     * Gets the permutation of the sapling related to a log provided a BlockPermutation
     * @returns 
     */
    public static GetSaplingPermuationFromLogPermutation(blockPermutation: BlockPermutation): BlockPermutation | null{
        for (const logName in Woodcutter.LOG_NAMES_TO_SAPLING_NAMES_MAP){
            if (blockPermutation.matches(logName)){
                return BlockPermutation.resolve("minecraft:sapling").withState("sapling_type", Woodcutter.LOG_NAMES_TO_SAPLING_NAMES_MAP[logName]);
            }
        }

        if (blockPermutation.matches("minecraft:cherry_log")){
            return BlockPermutation.resolve("minecraft:cherry_sapling");
        }

        if (blockPermutation.matches("minecraft:mangrove_log")){
            return BlockPermutation.resolve("minecraft:mangrove_propagule");
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
            const woodcutter = new Woodcutter(entity.dimension, null, npcHandlerInstance);
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
                }, 50);
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

    /**
     * Whenever a nox:woodcutter-manager block is broken. This checks all entities to see if any of them have that block
     * as their management block. It will remove the NPC if they do.
     */
    public static OnWoodcutterManagerBlockBroke(location: Vector3): void{
        // Keep track of a new Cache array with Woodcutters that were not removed
        const newCache: Woodcutter[] = [];

        for (const index in Woodcutter.Cache){
            const woodcutter = Woodcutter.Cache[index];
            const managerBlockLocation = woodcutter.GetLocatioNofWoodcutterManagerBlockFromProperties();
            if (managerBlockLocation !== null){
                if (VectorUtils.AreEqual(managerBlockLocation, location)){
                    // Remove him, his block was broken
                    woodcutter.Remove();
                }else{
                    newCache.push(woodcutter);
                }
            }else{
                // It's null
                // Remove this entity
                woodcutter.Remove();
            }
        }

        // Set the new cache with woodcutters that are not removed
        Woodcutter.Cache = newCache;
    }

    private Id: number | undefined;
    private Dimension: Dimension;
    private State: WoodcutterState;
    private Entity: Entity | null = null;
    private WoodcutterManagerBlock: WoodcutterManagerBlock | null;
    private TargetWoodBlock: Block | null = null;
    private BlocksCarrying: {[key: string]: number} = {};
    private MaxDistanceToSearchForWood: number = 11;
    private CurrentNumTimesTriedToWalkToTargetAndFailed = 0;
    private NPCHandlerInstance: NPCHandler;
    /**
     * The current Vector3 locations to ignore when seareching for a log. This is reset after a successful find of a log.
     */
    private CurrentLocationsToIgnoreWhenSearchingForLogs: Vector3[] = [];

    /**
     * Flag for if the Woodcutter class is currently being loaded
     */
    public IsLoading: boolean = false;

    /**
     * If this entity is ready for a state change on the next game tick
     */
    public IsReadyForStateChange: boolean = true;

    public constructor(
        dimension: Dimension, 
        woodcutterManagerBlockInstance: WoodcutterManagerBlock | null,
        npcHandlerInstance: NPCHandler
        ){
        super();
        this.State = WoodcutterState.NONE;
        this.Dimension = dimension;
        this.WoodcutterManagerBlock = woodcutterManagerBlockInstance;
        this.NPCHandlerInstance = npcHandlerInstance;
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
        if (this.Entity !== null){
            if (this.Entity.isValid()){
                this.Entity?.setProperty("nox:state_enum", WoodcutterState[enumState]);
            }
        }
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
     * Checks if a log is part of a valid tree - for most trees, it must be connected to some form of leaves
     * For dark oak, the provided log is assumed to be one of the bases and it must be surrounded by at least 3 other dark oak logs
     * @param log
     */
    private IsLogPartOfAValidTree(log: Block): boolean{
        const isDarkOak = log.typeId == "minecraft:dark_oak_log";
        const logsAndLeaves: Block[] = GetAllConnectedBlocksOfType(log, [log.typeId, ...Woodcutter.LEAVES_NAMES], 100);
        let numberOfConnectedLeaves: number = 0;

        for (const block of logsAndLeaves){
            if (Woodcutter.LEAVES_NAMES.indexOf(block.typeId) > -1){
                ++numberOfConnectedLeaves;
            }
        }

        // Check there are at least four leaves
        if (numberOfConnectedLeaves < 4){
            return false;
        }

        // TODO probably ignore dark oak requirements for now
        // the NPC will replant in the nearest 4 free spaces from where the original found log was on the ground
        if (isDarkOak){
            // Check there are at least 3 other dark oak logs in a 1 cuboid radius around the provided log
        }

        return true;
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
     * Gets the location of this Woodcutter's manager block from its properties. Returns null if it is not currently possible.
     */
    public GetLocatioNofWoodcutterManagerBlockFromProperties(): Vector3 | null{
        if (this.Entity?.isValid()){
            try{
                return {
                    x: Number(this.Entity?.getProperty("nox:woodcutter_manager_block_location_x")),
                    y: Number(this.Entity?.getProperty("nox:woodcutter_manager_block_location_y")),
                    z: Number(this.Entity?.getProperty("nox:woodcutter_manager_block_location_z"))
                };
            }catch(e){
                Debug.Warn(String(e));
                return null;
            }
        }

        return null;
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

        // If this entity is not ready to change states, go ahead and resolve the promise
        if (!this.IsReadyForStateChange){
            return;
        }

        return new Promise(resolve => {
            if (this.State === WoodcutterState.NONE){
                this.CurrentNumTimesTriedToWalkToTargetAndFailed = 0;
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
        Debug.Info("Woodcutter state changed to Searching.");
        const woodcutterManager = this.WoodcutterManagerBlock;

        if (woodcutterManager === null){
            this.Remove();
            return;
        }

        const woodcutterManagerBlock: Block = woodcutterManager.GetBlock();

        // Block is invalid. Wait 100 ticks and try again
        if (!woodcutterManagerBlock.isValid()){
            await Wait(100);
            this.SetState(WoodcutterState.NONE);
            this.IsReadyForStateChange = true;
            return;
        }

        // We need to keep track of locations to ignore in case they are not valid trees
        // E.g., a dark oak log on its own without 3 others around it is not a valid dark oak tree
        // or a few logs but with no leaves attached to them are probably not trees and may be part
        // of a player's home
        // This is done with this.CurrentLocationsToIgnoreWhenSearchingForLogs

        // Set up the finder options
        const blockFinderOptions: BlockFinderOptions = {
            StartLocation: woodcutterManagerBlock.location,
            Dimension: woodcutterManagerBlock.dimension,
            TypeIdsToFind: Woodcutter.LOG_TYPE_IDS_TO_FIND,
            TagsToFind: [],
            TagsToConsiderPassable: ["flowers", "small_flowers", "tall_flowers"],
            TypeIdsToConsiderPassable: ["minecraft:tallgrass", "minecraft:air", "minecraft:vine", "minecraft:leaves", "minecraft:sapling"],
            TagsToIgnore: [],
            TypeIdsToIgnore: [...WallsList, ...FencesList],
            LocationsToIgnore: this.CurrentLocationsToIgnoreWhenSearchingForLogs,
            MaxDistance: this.MaxDistanceToSearchForWood,
            MaxBlocksToFind: 1,
        };
        
        // Try to find an oak log
        Debug.Info("Searching for log blocks");
        const blocksFound: Block[] = await BlockFinder.FindBlocks(blockFinderOptions);
        Debug.Info("Search finished");

        if (blocksFound.length > 0){
            Debug.Info("Search found a block");
            // Found a block we wanted
            const blockFound: Block = blocksFound[0];
            if (blockFound.isValid()){
                Debug.Info("Checking if log found is part of a valid tree...");
                if (this.IsLogPartOfAValidTree(blockFound)){
                    // NPC is now ready to change states
                    this.TargetWoodBlock = blockFound;
                    this.IsReadyForStateChange = true;

                    // Reset the ignored locations
                    this.CurrentLocationsToIgnoreWhenSearchingForLogs = [];
                    return;
                }else{
                    // Add this location as a location we should not consider in further searches
                    Debug.Info("Found a log, but it doesn't appear to be part of a tree. So we're ignoring it.");
                    this.CurrentLocationsToIgnoreWhenSearchingForLogs.push(blockFound.location);

                    // Wait a bit, then reset the state
                    await Wait(100);
                    this.SetState(WoodcutterState.NONE);
                    this.IsReadyForStateChange = true;
                    return;
                }
            }
        }else{
            // Wait some time before resetting the state to try again
            Debug.Info("Search did not find a block. Waiting some time then resetting state.");
            await Wait(200);
            this.SetState(WoodcutterState.NONE);
            this.IsReadyForStateChange = true;
            return;
        }
    }

    /**
     * The state has been changed to WALKING_TO_WOOD
     * Walk to the target block
     */
    public async OnStateChangeToWalkingToWood(): Promise<void>{
        Debug.Info("Woodcutter state changed to WalkingToWood");
        if (this.TargetWoodBlock === null){
            // Revert state to searching for wood
            this.SetState(WoodcutterState.SEARCHING);
            this.IsReadyForStateChange = true;
        }else{
            Debug.Info(`Walking to ${this.TargetWoodBlock.location.x}, ${this.TargetWoodBlock.location.y}, ${this.TargetWoodBlock.location.z}`);
            const walker = new EntityWalker(this.Entity!);

            this.Entity?.setProperty("nox:is_moving", true);
            const didReachDestination = await walker.MoveTo(this.TargetWoodBlock, 2.0, ["minecraft:sapling", "minecraft:tallgrass", "minecraft:vine", ...Woodcutter.LEAVES_NAMES], []);

            if (!didReachDestination){
                // Try again
                ++this.CurrentNumTimesTriedToWalkToTargetAndFailed;

                if (this.CurrentNumTimesTriedToWalkToTargetAndFailed > 4){
                    // Tried too many times, reset to NONE and try again
                    Debug.Info("Failed to walk to the target too many times. Setting Woodcutter state back to NONE.");
                    this.CurrentNumTimesTriedToWalkToTargetAndFailed = 0;
                    this.SetState(WoodcutterState.NONE);
                }else{
                    Debug.Info("Failed to find a path. Trying again.");
                    this.SetState(WoodcutterState.SEARCHING);
                }
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
        Debug.Info("Woodcutter state changed to Woodcutting.");
        this.Entity?.setProperty("nox:is_chopping", true);
        
        if (this.TargetWoodBlock !== null && this.TargetWoodBlock.isValid()){
            const targetBlockTypeId = this.TargetWoodBlock.typeId;
            const targetBlockPermutation = this.TargetWoodBlock.permutation;
            const targetBlockLocation: Vector3 = this.TargetWoodBlock.location;
            const targetBlockDimension: Dimension = this.TargetWoodBlock.dimension;

            // Wait 100 ticks for normal trees
            // but 300 ticks for dark oak
            if (targetBlockTypeId !== "minecraft:dark_oak_log"){
                await Wait(100);
            }else{
                await Wait(300);
            }

            // Did the entity become invalid after waiting? If so, just reset the entire state
            if (!this.Entity?.isValid()){
                this.SetState(WoodcutterState.NONE)
                this.IsReadyForStateChange = true;
                return;
            }
            
            this.Entity?.setProperty("nox:is_chopping", false);
        

            Debug.Info("Getting all connected log blocks from target block.");
            // Chop all the wood
            let connectedBlocks: Block[] | undefined = undefined;
            try{
                connectedBlocks = GetAllConnectedBlocksOfType(this.TargetWoodBlock, Woodcutter.LOG_TYPE_IDS_TO_FIND, 75);
            }catch(e){}

            // Was there an error (Probably unloaded chunk error) when fetching all connected blocks?
            if (connectedBlocks === undefined){
                // Revert the stage
                Debug.Info("Couldn't get all connected logs. Reverting state to 'Woodcutting'")
                this.SetState(WoodcutterState.WOODCUTTING);
                this.IsReadyForStateChange = true;
                await Wait(100);
                return;
            }

            // Add the logs to this NPC's inventory
            this.AddBlockToCarryingStack(targetBlockPermutation.type.id, connectedBlocks.length);

            // If this is a dark oak log, then we must (before chopping it down)
            // try and calculate the _original_ root position of the tree
            // so that the Woodcutter can replant it where it originally grew from
            let darkOakSaplingPositions: Vector3[] = [];
            if (targetBlockTypeId === "minecraft:dark_oak_log"){
                Debug.Info("This is a dark oak log being chopped down. Calculating where it will be replanted before chopping it down.");
                const darkOakSaplingFinder = new DarkOakSaplingLocationFinder(this.TargetWoodBlock!);
                try{
                    darkOakSaplingPositions = darkOakSaplingFinder.GetSaplingLocationsForReplanting();
                }catch(e){
                    Debug.Info("Got error from dark oak sapling finder: " + String(e));
                }
            }

            Debug.Info("Chopping down all logs.");
            let iteratorCount = 0;
            for (const block of connectedBlocks){
                if (block.isValid()){
                    ++iteratorCount;
                    block.setPermutation(BlockPermutation.resolve("minecraft:air"));
                }
            }

            if (targetBlockTypeId !== "minecraft:dark_oak_log"){
                Debug.Info("Raycasting down from target block to plant sapling.");
                // Get the dirt block that should/was under the tree
                const raycastOptions: BlockRaycastOptions = {
                    includeLiquidBlocks: false,
                    includePassableBlocks: false,
                    maxDistance: 5
                };

                const blockRaycastHit: BlockRaycastHit | undefined = targetBlockDimension.getBlockFromRay(targetBlockLocation, {x: 0, y:-1, z:0}, raycastOptions);
                if (blockRaycastHit !== undefined){
                    Debug.Info("Hit a block. Checking if valid and if it is dirt or grass.");
                    const blockHit = blockRaycastHit.block;
                    if (blockHit.isValid()){
                        if (blockHit.typeId ==="minecraft:dirt" || blockHit.typeId === "minecraft:grass"){
                            Debug.Info("Planting the sapling on the block hit from the raycast.");
                            // Place a sapling
                            const saplingToPlace: BlockPermutation | null = Woodcutter.GetSaplingPermuationFromLogPermutation(targetBlockPermutation);
                            if (saplingToPlace !== null){
                                let blockAboveLocation: Block | undefined;
                                try{
                                    blockAboveLocation = blockHit.above(1);
                                }catch(e){}

                                if (blockAboveLocation !== undefined){
                                    blockAboveLocation.setPermutation(saplingToPlace);
                                }
                            }
                        }
                    }
                }
            }else{
                Debug.Info("Handling dark oak sapling");
                if (darkOakSaplingPositions.length > 0){
                    const darkOakSaplingPermutation: BlockPermutation | null = Woodcutter.GetSaplingPermuationFromLogPermutation(BlockPermutation.resolve("minecraft:dark_oak_log"));
                    if (darkOakSaplingPermutation !== null){
                        const saplingRaycastPlanter = new SaplingRaycastPlanter();
                        const blocksToReplantTreeAt: Block[] = saplingRaycastPlanter.GetPlantableAirBlocksFromLocations(targetBlockDimension, darkOakSaplingPositions);
                        // Check to make sure it returned the same number of plantable blocks as sapling locations we need
                        if (blocksToReplantTreeAt.length === darkOakSaplingPositions.length){
                            for (const airBlock of blocksToReplantTreeAt){
                                if (airBlock.isValid()){
                                    airBlock.setPermutation(darkOakSaplingPermutation);
                                }
                            }
                        }else{
                            Debug.Warn("Can't replant dark oak tree. The SaplingRaycastPlanter did not return 4 plantable air blocks. It only returned: " + String(blocksToReplantTreeAt.length));
                        }
                    }else{
                        Debug.Warn("Failed to get the permuation of the permutation minecraft:dark_oak_log. Not replanting.");
                    }
                }else{
                    Debug.Warn("Not replanting the dark oak tree. When calculating the sapling locations prior to cutting down the tree, the calculations failed to find a valid set of locations to replant the tree.");
                }
            }

            Debug.Info("Done chopping down wood and replanting the sapling.");
        }else{
            // Target block is now out of bounds I guess
            // Restart everything
            this.SetState(WoodcutterState.NONE)
            this.IsReadyForStateChange = true;
            return;
        }


        this.IsReadyForStateChange = true;
    }

    /**
     * When the state has changed for the woodcutter to walk back to the chest adjacent to his manager block
     */
    public async OnStateChangedToWalkingToChest(): Promise<void>{
        Debug.Info("Woodcutter state changed to WalkingToChest.");
        const chestToWalkTo: Block | null = this.WoodcutterManagerBlock!.GetAdjacentChest();
        if (chestToWalkTo !== null){
            const chestInventory: BlockInventoryComponent | undefined = chestToWalkTo.getComponent("minecraft:inventory");
            const walker = new EntityWalker(this.Entity!);
            this.Entity?.setProperty("nox:is_moving", true);
            await walker.MoveTo(chestToWalkTo.location, 2, ["minecraft:sapling", ...Woodcutter.LEAVES_NAMES], []);

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
                    if (amount > 0){
                        const itemStack: ItemStack = new ItemStack(typeId, amount);
                        try{
                            chestInventory.container?.addItem(itemStack);
                        }catch(e){}
                    }
                }
            }

            // Clear inventory
            this.BlocksCarrying = {};

            this.IsReadyForStateChange = true;
        }else{
            Debug.Info("No chest to walk to.");
            // No chest? Wait some time then try again
            await Wait(200);
            // Revert to previous state, but flag that the state is ready to change (to rerun this state change function)
            this.SetState(WoodcutterState.WOODCUTTING);
            this.IsReadyForStateChange = true;
        }
    }

    /**
     * Removes this entity entirely
     */
    public Remove(): void{
        if (this.Entity !== null){
            if (this.Entity.isValid()){
                this.Entity.kill();
            }
        }
        this.NPCHandlerInstance.UnregisterNPC(this);
    }
}