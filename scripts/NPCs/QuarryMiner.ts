import { Block, Entity, EntityComponentTypes, ItemStack, Player, TicksPerSecond, Vector3, system, world } from "@minecraft/server";
import NPC from "./NPC";
import { NPCHandler } from "../NPCHandler";
import Debug from "../Debug/Debug";
import { FloodFillIteratorOptions } from "../NoxBedrockUtilities/Iterators/FloodFill/FloodFillIIteratorOptions";
import FloodFillIterator from "../NoxBedrockUtilities/Iterators/FloodFill/FloodFillIterator";
import { MinecraftBlockTypes } from "@minecraft/vanilla-data";
import { Vector3Utils } from "@minecraft/math";
import Wait from "../Utilities/Wait";
import { ActionFormData } from "@minecraft/server-ui";

export class QuarryMiner extends NPC{

    /**
     * Cache of known entities already loaded into the game.
     */
    public static Cache: QuarryMiner[] = [];
    public static MaxPayDirt: number = 64;

    public static GetFromCache(entity: Entity): QuarryMiner | null{
        for (const miner of QuarryMiner.Cache){
            let entityId: number;

            try{
                entityId = miner.GetId();
            }catch(e){
                continue;
            }

            if (entityId === entity.getProperty("nox:id")){
                return miner;
            }
        }

        return null;
    }

    public static OnMinerDied(entity: Entity): void{
        for (const [index, miner] of QuarryMiner.Cache.entries()){
            let entityId: number;

            try{
                entityId = miner.GetId();
            }catch(e){
                continue;
            }

            if (entityId === entity.getProperty("nox:id")){
                miner.NpcHandler.UnregisterNPC(miner);
                QuarryMiner.RemoveIndexFromCache(index);
                break;
            }
        }
    }

    public static RemoveIndexFromCache(index: number): void{
        QuarryMiner.Cache.splice(index, 1);
    }

    public static LoadFromExistingEntity(entity: Entity, npcHandler: NPCHandler): QuarryMiner{
        Debug.Info("Loading quarry miner from existing entity.");
        const newNpc = new QuarryMiner(entity, npcHandler);
        return newNpc;
    }

    public static AsNew(entity: Entity, npcHandler: NPCHandler): QuarryMiner{
        const nextNpcId = <number>world.getDynamicProperty("nox:next_npc_id");
        world.setDynamicProperty("nox:next_npc_id", nextNpcId + 1);
        entity.setProperty("nox:id", nextNpcId);
        Debug.Info("Instantiating new quarry miner.");
        const newNpc = new QuarryMiner(entity, npcHandler);
        return newNpc;
    }

    public IsReadyForStateChange: boolean = true;
    public NpcHandler: NPCHandler;
    private Entity: Entity;
    private CurrentTargetNode: Block | undefined;

    public constructor(entity: Entity, npcHandler: NPCHandler){
        super();
        this.Entity = entity;
        this.NpcHandler = npcHandler;
        this.SetState("NONE");
        npcHandler.RegisterNPC(this);
        QuarryMiner.Cache.push(this);
    }

    public async OnGameTick(): Promise<void> {
        if (!this.IsReadyForStateChange){
            return;
        }

        this.IsReadyForStateChange = false;

        let state: string | undefined;
        try{
            state = this.GetState();
        }catch(e){
            this.IsReadyForStateChange = false;
            await Wait(TicksPerSecond * 30);
            this.IsReadyForStateChange = true;
            return;
        }

        if (state === "NONE"){
            this.SetState("FINDING_NODE");
        }else if (state === "FINDING_NODE"){
            Debug.Info("Finding nearest quarry node.");
            const node = await this.FindNearestNodeCenter();
            if (node !== null){
                Debug.Info("Found it at " + Vector3Utils.toString(node.location));
                this.CurrentTargetNode = node;
                this.FaceTargetNode();
                this.SetState("MINING");
            }else{
                Debug.Info("No node found. Waiting 30 seconds.");
                await Wait(TicksPerSecond * 30);
            }
        }else if (state === "MINING"){
            this.FaceTargetNode();
            await Wait(TicksPerSecond * 30);
            if (this.GetPaydirtCarried() >= QuarryMiner.MaxPayDirt){
                this.SetState("FULL_PAYDIRT")
            }else{
                this.SetPaydirtCarried(this.GetPaydirtCarried() + 1);
            }
        }else if (state === "FULL_PAYDIRT"){
            Debug.Info("Full of paydirt. Waiting 15 seconds.");
            await Wait(TicksPerSecond * 15);
            const currentPaydirt = this.GetPaydirtCarried();
            if (currentPaydirt < QuarryMiner.MaxPayDirt){
                // It can mine again
                this.SetState("NONE");
                Debug.Info("Can mine again. Paydirt removed.");
            }
        }

        await Wait(1);
        this.IsReadyForStateChange = true;
    }

    public OnPlayerInteract(player: Player): void{
        this.OpenPaydirtUI(player);
    }

    public async OpenPaydirtUI(player: Player): Promise<void>{
        const paydirtCarried: number = this.GetPaydirtCarried();
        const actionForm = new ActionFormData();
        actionForm.title("Quarry Miner");
        actionForm.body(`This miner is carrying ${paydirtCarried} paydirt.`);
        actionForm.button("Collect Paydirt");
        const response = await actionForm.show(player);

        if (response.selection !== undefined){
            const currentPaydirtAfterSelection = this.GetPaydirtCarried();

            // Try to give to them
            const inventoryComponent = player.getComponent(EntityComponentTypes.Inventory);
            if (inventoryComponent !== undefined){
                const container = inventoryComponent.container;
                if (container !== undefined){
                    const stackLeft = container.addItem(new ItemStack("nox:paydirt_land", currentPaydirtAfterSelection));
                    if (stackLeft === undefined){
                        player.sendMessage(`Received ${currentPaydirtAfterSelection} paydirt.`);
                        this.SetPaydirtCarried(0);
                    }else{
                        if (stackLeft.amount < currentPaydirtAfterSelection){
                            player.sendMessage(`Received ${currentPaydirtAfterSelection - stackLeft.amount} paydirt.`);
                            this.SetPaydirtCarried(stackLeft.amount);
                        }else{
                            player.sendMessage("Your inventory is full.");
                        }
                    }

                }
            }

        }
    }

    public GetId(): number{
        if (this.Entity.isValid()){
            const noxIdProperty = this.Entity.getProperty("nox:id");
            if (noxIdProperty !== undefined){
                const id = parseInt(noxIdProperty.toString());
                if (!isNaN(id)){
                    return id;
                }
            }
            throw "nox:id property did not return a number.";
        }

        throw "(GetId) Entity is invalid.";
    }

    public GetPaydirtCarried(): number{
        if (this.Entity.isValid()){
            const property = this.Entity.getProperty("nox:paydirt_carried");
            if (property !== undefined){
                const propertyParsed = parseInt(property.toString());
                if (!isNaN(propertyParsed)){
                    return propertyParsed;
                }
            }
            throw "nox:paydirt_carried property did not return a number.";
        }

        throw "(GetPaydirtCarried) Entity is invalid.";
    }

    public SetPaydirtCarried(value: number): void{
        if (this.Entity.isValid()){
            this.Entity.setProperty("nox:paydirt_carried", value);
            return;
        }

        throw "(SetPaydirtCarried) Entity is invalid.";
    }

    private GetState(): string{
        if (this.Entity.isValid()){
            const stateProperty = this.Entity.getProperty("nox:state")
            if (stateProperty !== undefined){
                return stateProperty.toString();
            }
            throw "nox:state is undefined.";
        }
        throw "Entity is null.";
    }

    private SetState(state: string): void{
        if (this.Entity.isValid()){
            this.Entity.setProperty("nox:state", state);
            return;
        }
        throw "(SetState) Entity is invalid.";
    }

    private FaceTargetNode(): void{
        if (this.CurrentTargetNode !== undefined && this.CurrentTargetNode.isValid()){
            const targetRotation = Math.atan2(
                this.CurrentTargetNode.center().x - this.Entity.location.x, 
                this.CurrentTargetNode.center().z - this.Entity.location.z) * -57.2958;
            this.Entity.setRotation({
                x: 0,
                y: targetRotation
            });
        }
    }

    /**
     * Builds a mining node at the center location
     * @param center 
     */
    private GenerateNode(center: Vector3): void{

    }

    private async FindNearestNodeCenter(): Promise<Block | null>{
        if (this.Entity.isValid()){
            const floodFillOptions = new FloodFillIteratorOptions(this.Entity.location, this.Entity.dimension, 4);
            floodFillOptions.TypeIdsToConsiderPassable = [
                MinecraftBlockTypes.Air, 
                MinecraftBlockTypes.Stone, 
                MinecraftBlockTypes.Diorite, 
                MinecraftBlockTypes.Granite,
            ];
            floodFillOptions.TypeIdsToAlwaysIncludeInResult = ["nox:quarry_node_center"];
            return await new Promise<Block | null>(resolve => {
                system.runJob(this.IterateFloodFillForBlock(resolve, floodFillOptions));
            });
        }
        
        throw "(FindNearestNodeCenter) Entity property is invalid.";
    }

    private *IterateFloodFillForBlock(resolve: (block: Block | null) => void, options: FloodFillIteratorOptions){
        const floodFill = new FloodFillIterator(options);
        for (const block of floodFill.IterateLocations()){
            if (block !== null && block.isValid()){
                if (block.typeId === "nox:quarry_node_center"){
                    return resolve(block);
                }
            }
            yield;
        }

        return resolve(null);
    }

}