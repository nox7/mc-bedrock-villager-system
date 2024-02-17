import { Block, Vector2, Vector3, world } from "@minecraft/server";
import EmptySpaceFinder from "../Utilities/EmptySpaceFinder";
import CuboidRegion from "../Utilities/Region/CuboidRegion";
import Woodcutter from "../NPCs/Woodcutter";
import TryGetBlock from "../Utilities/TryGetBlock";
import { NPCHandler } from "../NPCHandler";

export default class WoodcutterManagerBlock{

    public static BlockTypeId = "nox:woodcutter-manager";
    public static Cache: WoodcutterManagerBlock[] = [];

    private Block: Block;
    private BlockLocationX: number;
    private BlockLocationY: number;
    private BlockLocationZ: number;
    private WoodcutterNPC: Woodcutter | null = null;

    public constructor(block: Block){
        this.Block = block;
        this.BlockLocationX = block.location.x;
        this.BlockLocationY = block.location.y;
        this.BlockLocationZ = block.location.z;
        WoodcutterManagerBlock.Cache.push(this);
    }

    /**
     * Returns the current minecraft Block
     * @returns
     */
    public GetBlock(): Block{
        return this.Block;
    }

    /**
     * Finds an empty space around the placed block and spawns a woodcutter at that empty space
     */
    public SpawnWoodcutter(npcHandler: NPCHandler): Woodcutter | null{
        const cuboidRegionAroundSpawn = CuboidRegion.FromCenterLocation(this.Block.location, 1, true);
        const emptySpaceFinder: EmptySpaceFinder = new EmptySpaceFinder(cuboidRegionAroundSpawn, this.Block.dimension);
        const emptyLocations: Vector3[] = emptySpaceFinder.GetAllEmptyLocations();
        if (emptyLocations.length > 0){
            const location: Vector3 = emptyLocations[Math.floor(Math.random() * (emptyLocations.length - 1))];
            this.WoodcutterNPC = new Woodcutter(this.Block.dimension, this, npcHandler);
            this.WoodcutterNPC.CreateEntity(location);
            return this.WoodcutterNPC;
        }else{
            // Error...
            console.warn("No empty space. Cannot spawn woodcutter.");
        }

        return null;
    }

    /**
     * Finds a chest that is adjacent to this manager block, if there is one
     */
    public GetAdjacentChest(): Block | null{

        // Block isn't loaded in
        if (!this.Block.isValid()){
            return null;
        }

        // Vertically flat
        const cuboidRegionAroundSpawn: CuboidRegion = CuboidRegion.FromCenterLocation(this.Block.location, 1, true);
        const locations: Vector3[] = cuboidRegionAroundSpawn.GetAllLocationsInRegion();
        for (const location of locations){
            const block: Block | undefined = TryGetBlock(this.Block.dimension, location);
            if (block !== undefined){
                if (block.typeId === "minecraft:chest"){
                    return block;
                }
            }
        }

        return null;
    }
}