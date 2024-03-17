import { Entity, EntityComponentTypes, ItemStack, Player, world } from "@minecraft/server";
import NPC from "./NPC";
import Debug from "../Debug/Debug";
import { NPCHandler } from "../NPCHandler";
import { ActionFormData } from "@minecraft/server-ui";
import { Vector3Utils } from "@minecraft/math";
import { MinecraftBiomeTypes, MinecraftBlockTypes, MinecraftItemTypes } from "@minecraft/vanilla-data";

type PaydirtStackInPlayerInventory = {
    SlotIndex: number;
    Stack: ItemStack;
}

type Droptable = {
    Name: string;
    Chance: number;
    Items: DroptableItem[];
}

/**
 * To calculate, sort the droptable items in order from least to greatest. Compare with DICE_ROLL <= Chance
 */
type DroptableItem = {
    TypeId: string;
    Chance: number;
    Amount: number;
}

export class Smelter extends NPC{
    
    /**
     * Cache of known entities already loaded into the game.
     */
    public static Cache: Smelter[] = [];
    public static PaydirtTypeIds: string[] = [
        "nox:paydirt_land"
    ];

    public static LandPaydirtDropTables: Droptable[] = [
        {
            Name: "Stones",
            Chance: 1/3,
            Items: [
                {
                    TypeId: "minecraft:stone",
                    Chance: 1/5,
                    Amount: 1
                },
                {
                    TypeId: "minecraft:cobblestone",
                    Chance: 1/5,
                    Amount: 1
                },
                {
                    TypeId: "minecraft:diorite",
                    Chance: 1/10,
                    Amount: 1
                },
                {
                    TypeId: "minecraft:granite",
                    Chance: 1/10,
                    Amount: 1
                },
                {
                    TypeId: "minecraft:andesite",
                    Chance: 1/10,
                    Amount: 1
                },
                {
                    TypeId: "minecraft:gravel",
                    Chance: 1/15,
                    Amount: 1
                },
                {
                    TypeId: "minecraft:sand",
                    Chance: 1/30,
                    Amount: 1
                },
                {
                    TypeId: "minecraft:dirt",
                    Chance: 1/30,
                    Amount: 1
                },
            ]
        },
        {
            Name: "Ores",
            Chance: 1/5,
            Items: [
                {
                    TypeId: MinecraftItemTypes.Coal,
                    Chance: 1/5,
                    Amount: 1
                },
                {
                    TypeId: MinecraftItemTypes.RawIron,
                    Chance: 1/10,
                    Amount: 1
                },
                {
                    TypeId: MinecraftItemTypes.RawGold,
                    Chance: 1/50,
                    Amount: 1
                },
                {
                    TypeId: MinecraftItemTypes.Diamond,
                    Chance: 1/500,
                    Amount: 1
                },
                {
                    TypeId: MinecraftItemTypes.Redstone,
                    Chance: 1/75,
                    Amount: 1
                },
                {
                    TypeId: MinecraftItemTypes.LapisLazuli,
                    Chance: 1/75,
                    Amount: 1
                },
            ]
        }
    ]

    public static GetRandomInt(min: number, max: number): number{
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    public static GetRandomFloat(min: number, max: number): number{
        return Math.random() * (max - min) + min;
    }

    /**
     * Gets an item stacks from the droptables' provided items
     * @param droptables 
     */
    public static GetItemFromDropTables(droptables: Droptable[]): ItemStack{
        // Sort the drop tables ASC chance
        droptables.sort((a, b) => a.Chance > b.Chance ? 1 : -1);

        // Pick a droptable to get items from
        // Get the total chance of all the droptables
        const totalChance = droptables.reduce((accumulator, droptable) => accumulator + droptable.Chance, 0);
        const rolledDroptableChance = this.GetRandomFloat(0, totalChance);

        let runningValue = 0;
        let chosenDroptable: Droptable | undefined;
        for (const droptable of droptables){
            runningValue += droptable.Chance;
            if (rolledDroptableChance < runningValue){
                chosenDroptable = droptable;
                break;
            }
        }

        // Now, do the same for the items in the droptable
        if (chosenDroptable !== undefined){
            chosenDroptable.Items.sort((a, b) => a.Chance > b.Chance ? 1 : -1);
            const totalChanceForItem = chosenDroptable.Items.reduce((accumulator, droptableItem) => accumulator + droptableItem.Chance, 0);
            const rolledDroptableItemChance = this.GetRandomFloat(0, totalChanceForItem);
            let runningValueForItem = 0;
            for (const droptableItem of chosenDroptable.Items){
                runningValueForItem += droptableItem.Chance;
                if (rolledDroptableItemChance < runningValueForItem){
                    return new ItemStack(droptableItem.TypeId, droptableItem.Amount);
                }
            }

            throw `Error: Failed to get an item from droptable: ${chosenDroptable.Name}`;
        }else{
            throw "Error: Failed to select a droptable.";
        }
    }

    /**
     * Gets item stacks to drop for the player given an amount of rolls on the drop table
     * @param amount 
     */
    public static RollDroptableItemsForAmount(droptables: Droptable[], amount: number): ItemStack[]{
        const itemStacksByTypeId: {[key: string]: ItemStack} = {};
        for (let i = 0; i < amount; i++){
            const item: ItemStack = Smelter.GetItemFromDropTables(droptables);
            if (item.typeId in itemStacksByTypeId){
                itemStacksByTypeId[item.typeId].amount += item.amount;
            }else{
                itemStacksByTypeId[item.typeId] = item;
            }
        }

        return Object.values(itemStacksByTypeId);
    }

    public static GetFromCache(entity: Entity): Smelter | null{
        for (const miner of Smelter.Cache){
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

    public static OnDied(entity: Entity): void{
        for (const [index, miner] of Smelter.Cache.entries()){
            let entityId: number;

            try{
                entityId = miner.GetId();
            }catch(e){
                continue;
            }

            if (entityId === entity.getProperty("nox:id")){
                miner.NpcHandler.UnregisterNPC(miner);
                Smelter.RemoveIndexFromCache(index);
                break;
            }
        }
    }

    public static RemoveIndexFromCache(index: number): void{
        Smelter.Cache.splice(index, 1);
    }

    public static LoadFromExistingEntity(entity: Entity, npcHandler: NPCHandler): Smelter{
        Debug.Info("Loading quarry miner from existing entity.");
        const newNpc = new Smelter(entity, npcHandler);
        return newNpc;
    }

    public static AsNew(entity: Entity, npcHandler: NPCHandler): Smelter{
        const nextNpcId = <number>world.getDynamicProperty("nox:next_npc_id");
        world.setDynamicProperty("nox:next_npc_id", nextNpcId + 1);
        entity.setProperty("nox:id", nextNpcId);
        Debug.Info("Instantiating new quarry miner.");
        const newNpc = new Smelter(entity, npcHandler);
        return newNpc;
    }

    public IsReadyForStateChange: boolean = true;
    public NpcHandler: NPCHandler;
    private Entity: Entity;

    public constructor(entity: Entity, npcHandler: NPCHandler){
        super();
        this.Entity = entity;
        this.NpcHandler = npcHandler;
        this.SetState("NONE");
        npcHandler.RegisterNPC(this);
        Smelter.Cache.push(this);
    }

    public async OnGameTick(): Promise<void> {
        
    }

    public OnPlayerInteract(player: Player): void{
        this.OpenSmeltPaydirtUI(player);
    }

    public async OpenSmeltPaydirtUI(player: Player): Promise<void>{
        const paydirtStacks: PaydirtStackInPlayerInventory[] = this.GetAllPayDirtStacksFromPlayerInventory(player);
        if (paydirtStacks.length > 0){
            const actionForm = new ActionFormData();
            actionForm.title("Smelter");
            actionForm.body(`You have ${paydirtStacks.length} stacks of paydirt. I can process one stack at a time.`);
            actionForm.button("Process 1 stack");
            const response = await actionForm.show(player);

            if (response.selection !== undefined){
                const nextPaydirtStack = paydirtStacks[0];
                if (Smelter.PaydirtTypeIds.includes(nextPaydirtStack.Stack.typeId)){
                    player.playSound("drop.slot");
                    for (const itemStack of Smelter.RollDroptableItemsForAmount(Smelter.LandPaydirtDropTables, nextPaydirtStack.Stack.amount)){
                        player.dimension.spawnItem(
                            itemStack, 
                            Vector3Utils.add(
                                Vector3Utils.add(player.location, {x: 0, y: 1, z: 0}), 
                                Vector3Utils.scale(player.getViewDirection(), 1.5)
                                )
                        );
                    }
                    player.getComponent(EntityComponentTypes.Inventory)?.container?.setItem(nextPaydirtStack.SlotIndex, undefined);
                }
            }
        }else{
            player.sendMessage("You have no paydirt for the smelter to clean and smelt.");
        }
    }

    /**
     * Gets all paydirt stacks from the player's inventory
     * @param player 
     */
    private GetAllPayDirtStacksFromPlayerInventory(player: Player): PaydirtStackInPlayerInventory[]{
        const stacks: PaydirtStackInPlayerInventory[] = [];

        const inventory = player.getComponent(EntityComponentTypes.Inventory);
        if (inventory !== undefined){
            const container = inventory.container;
            if (container !== undefined){
                for (let i = 0; i < container.size; i++){
                    const itemStack = container.getItem(i);
                    if (itemStack !== undefined){
                        if (Smelter.PaydirtTypeIds.includes(itemStack.typeId)){
                            stacks.push({SlotIndex: i, Stack: itemStack});
                        }
                    }
                }
            }
        }

        return stacks;
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
}