import { Block, Vector2, Vector3, world } from "@minecraft/server";
import EmptySpaceFinder from "../Utilities/EmptySpaceFinder";
import CuboidRegion from "../Utilities/Region/CuboidRegion";
import Woodcutter from "../NPCs/Woodcutter";

export default class WoodcutterManagerBlock{

    public static Cache: WoodcutterManagerBlock[] = [];

    private Block: Block;
    private WoodcutterNPC: Woodcutter | null = null;

    public constructor(block: Block){
        this.Block = block;
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
    public SpawnWoodcutter(): Woodcutter | null{
        const cuboidRegionAroundSpawn = CuboidRegion.FromCenterLocation(this.Block.location, 1, true);
        const emptySpaceFinder: EmptySpaceFinder = new EmptySpaceFinder(cuboidRegionAroundSpawn, this.Block.dimension);
        const emptyLocations: Vector3[] = emptySpaceFinder.GetAllEmptyLocations();
        if (emptyLocations.length > 0){
            const location: Vector3 = emptyLocations[Math.floor(Math.random() * (emptyLocations.length - 1))];
            this.WoodcutterNPC = new Woodcutter(this.Block.dimension, this);
            this.WoodcutterNPC.CreateEntity(location);
            return this.WoodcutterNPC;
        }else{
            // Error...
            console.warn("No empty space. Cannot spawn woodcutter.");
        }

        return null;
    }
}