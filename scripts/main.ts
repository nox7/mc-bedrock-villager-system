/**
 * NOTE: This main.ts is currently a mess and is not structurted. Code is WIP and will be more class-OOPed or whatever the hell later.
 */

import {
    world,
    system,
    ItemUseOnBeforeEvent,
    Player,
    PlayerPlaceBlockAfterEvent,
    Block,
    Vector3,
    Entity,
    EntityLoadAfterEvent,
    ScriptEventCommandMessageAfterEvent,
    EntityEquippableComponent,
    PlayerInteractWithBlockAfterEvent,
    EquipmentSlot,
    BlockPermutation,
    EntityInventoryComponent,
    ItemStack,
    PlayerBreakBlockBeforeEvent,
    PlayerInteractWithBlockBeforeEvent,
    ContainerSlot,
    ChatSendAfterEvent,
    Dimension,
    EntitySpawnAfterEvent,
    EntityDieAfterEvent,
    PlayerInteractWithEntityAfterEvent,
    ItemUseOnAfterEvent,
} from "@minecraft/server";
import WoodcutterManagerBlock from "./BlockHandlers/WoodcutterManagerBlock.js";
import Woodcutter from "./NPCs/Woodcutter.js";
import Debug from "./Debug/Debug.js";
import { LogLevel } from "./Debug/LogLevel.js";
import { UVFilterBlock } from "./BlockHandlers/UVFilterBlock.js";
import { OpenWineBarrelBlock } from "./BlockHandlers/OpenWineBarrelBlock.js";
import { PlayerDebounceManager } from "./Utilities/PlayerDebounceManager.js";
import { ClosedWineBarrelBlock } from "./BlockHandlers/ClosedWineBarrelBlock.js";
import { FinishedWineBarrelBlock } from "./BlockHandlers/FinishedWineBarrelBlock.js";
import { NPCHandler } from "./NPCHandler.js";
import { AutoSortActivatorBlock } from "./BlockHandlers/AutoSortActivatorBlock.js";
import { BiomeHelper } from "./Utilities/Biomes/BiomeHelper.js";
import { RadiusFinder } from "./BlockFinders/RadiusFinder.js";
import { SingleBedManager } from "./SingleBedManager.js";
import { FloodFillIteratorOptions } from "./NoxBedrockUtilities/Iterators/FloodFill/FloodFillIIteratorOptions.js";
import FloodFillIterator from "./NoxBedrockUtilities/Iterators/FloodFill/FloodFillIterator.js";
import { VectorUtils } from "./NoxBedrockUtilities/Vector/VectorUtils.js";
import { QuarryMiner } from "./NPCs/QuarryMiner.js";
import { Smelter } from "./NPCs/Smelter.js";
import { Vector3Utils } from "@minecraft/math";

Debug.LogLevel = LogLevel.All;

const npcHandler = new NPCHandler();
system.runInterval(() => {
    npcHandler.OnGameTick();
});

system.afterEvents.scriptEventReceive.subscribe((event: ScriptEventCommandMessageAfterEvent) => {
    if (event.id === "nox:uv-block-tick") {
        system.run(() => {
            if (event.sourceBlock !== undefined) {
                if (event.sourceBlock.isValid()) {
                    UVFilterBlock.OnBlockTick(event.sourceBlock);
                }
            }
        });
    } else if (event.id === "nox:open-wine-barrel-step-on") {
        if (event.sourceBlock !== undefined) {
            if (event.sourceBlock.isValid()) {
                //if (event.sourceEntity !== undefined){
                OpenWineBarrelBlock.OnBlockSteppedOn(event.sourceBlock);
                //}
            }
        }
    } else if (event.id === "nox:closed-wine-barrel-tick") {
        if (event.sourceBlock !== undefined) {
            if (event.sourceBlock.isValid()) {
                ClosedWineBarrelBlock.OnQueuedTicking(event.sourceBlock);
            }
        }
    }
});

world.afterEvents.playerPlaceBlock.subscribe(async (playerPlaceBlockEvent: PlayerPlaceBlockAfterEvent) => {
    const block = playerPlaceBlockEvent.block;

    // Player placed a woodcutter-manager block
    if (block.permutation.matches("nox:woodcutter-manager")) {
        const woodcutterManagerBlock: WoodcutterManagerBlock = new WoodcutterManagerBlock(block);
        const woodcutterNpc: Woodcutter | null = woodcutterManagerBlock.SpawnWoodcutter(npcHandler);
        if (woodcutterNpc) {
            npcHandler.RegisterNPC(woodcutterNpc);
        }
    }
});

world.beforeEvents.playerBreakBlock.subscribe(async (event: PlayerBreakBlockBeforeEvent) => {
    const block: Block = event.block;
    if (block.typeId === "nox:woodcutter-manager") {
        const blockLocation: Vector3 = block.location;
        system.run(() => {
            Woodcutter.OnWoodcutterManagerBlockBroke(blockLocation);
        });
    }
});

world.beforeEvents.itemUseOn.subscribe((itemUseOnBeforeEvent: ItemUseOnBeforeEvent) => {
    // if (itemUseOnBeforeEvent.itemStack.typeId === "nox:grapes"){
    //   if (itemUseOnBeforeEvent.block.typeId === "nox:wine-barrel"){
    //     itemUseOnBeforeEvent.cancel = true;
    //     return;
    //   }
    // }

    if (itemUseOnBeforeEvent.block.permutation.matches("nox:woodcutter-manager")) {
        const player: Player = itemUseOnBeforeEvent.source;
        if (player.isSneaking) {
            // Do nothing, let them act normally on this block
            // world.sendMessage("IS SNEAKING");
        } else {
            // Cancel whatever the player tried to do on this
            // world.sendMessage("Is woodcutter");
            itemUseOnBeforeEvent.cancel = true;
        }
    } else {
        // world.sendMessage("Is not woodcutter");
    }
});

world.beforeEvents.playerInteractWithBlock.subscribe((interactEvent: PlayerInteractWithBlockBeforeEvent) => {
    const player: Player = interactEvent.player;

    if (PlayerDebounceManager.IsDebounced(player, 350)) {
        return;
    }

    PlayerDebounceManager.Debounce(player);

    let equipmentComponent: EntityEquippableComponent | undefined;
    let inventoryComponent: EntityInventoryComponent | undefined;
    let slot: ContainerSlot | undefined;
    try {
        equipmentComponent = player.getComponent(EntityEquippableComponent.componentId);
        inventoryComponent = player.getComponent(EntityInventoryComponent.componentId);
        slot = equipmentComponent?.getEquipmentSlot(EquipmentSlot.Mainhand);
    } catch (e) {
        return;
    }

    const targetBlock = interactEvent.block;
    if (!targetBlock.isValid()) {
        return;
    }

    // Handle nox:auto-sorter-activator block
    if (targetBlock.typeId === "nox:auto-sorter-activator") {
        interactEvent.cancel = true;
        const autoSorter = new AutoSortActivatorBlock(targetBlock);
        system.run(() => {
            autoSorter.OnPlayerInteract(player);
        });
        return;
    } else if (targetBlock.typeId === "nox:woodcutter-manager") {
        interactEvent.cancel = true;
        system.run(() => {
            const woodcutterManagerBlock = WoodcutterManagerBlock.GetFromLocation(targetBlock.location);
            if (woodcutterManagerBlock !== null) {
                woodcutterManagerBlock.OnPlayerInteract(player);
            }
        });
        return;
    }

    if (slot !== undefined && slot.isValid() && slot.hasItem()) {
        if (slot.typeId === "nox:grapes") {
            if (targetBlock.typeId === "nox:wine-barrel") {
                const grapeCount = targetBlock.permutation.getState("nox:grape-count");
                if (grapeCount !== undefined) {
                    if (Number(grapeCount) < 12) {
                        interactEvent.cancel = true;
                        system.run(() => {
                            const slotItemStack = slot?.getItem();
                            if (slotItemStack !== undefined) {
                                targetBlock.setPermutation(
                                    targetBlock.permutation.withState("nox:grape-count", Number(grapeCount) + 1)
                                );
                                player.playSound("item.book.put", {
                                    volume: 0.25,
                                });
                                if (slotItemStack.amount > 1) {
                                    slotItemStack.amount = slotItemStack.amount - 1;
                                    slot?.setItem(slotItemStack);
                                } else {
                                    slot?.setItem(undefined);
                                }
                            }
                        });
                    }
                }
            }
        } else if (slot.typeId === "nox:empty-tankard") {
            if (targetBlock.typeId === "nox:wine-barrel-finished") {
                system.run(() => {
                    if (slot !== undefined && slot?.isValid()) {
                        FinishedWineBarrelBlock.OnEmptyTankardUsedOn(targetBlock, slot, player);
                    }
                });
            }
        } else if (slot.typeId === "nox:quarry_miner_contract") {
            system.run(() => {
                if (slot !== undefined && slot?.isValid()) {
                  player.dimension.spawnEntity("nox:quarry_miner", Vector3Utils.add(targetBlock.location, { x: 0, y: 1, z: 0 }));
                  slot?.setItem(undefined);
                }
            });
        }
    }
});

world.afterEvents.playerInteractWithBlock.subscribe((interactEvent: PlayerInteractWithBlockAfterEvent) => {
    const player: Player = interactEvent.player;

    let equipmentComponent: EntityEquippableComponent | undefined;
    let inventoryComponent: EntityInventoryComponent | undefined;
    let slot: ContainerSlot | undefined;
    const targetBlock: Block = interactEvent.block;
    try {
        equipmentComponent = player.getComponent(EntityEquippableComponent.componentId);
        inventoryComponent = player.getComponent(EntityInventoryComponent.componentId);
        slot = equipmentComponent?.getEquipmentSlot(EquipmentSlot.Mainhand);
    } catch (e) {
        return;
    }

    if (targetBlock.isValid()) {
        if (targetBlock.typeId === "minecraft:bed") {
            SingleBedManager.OnPlayerInteractWithBed(player);
            return;
        }
    }

    if (slot !== undefined && slot.isValid() && slot.hasItem()) {
        if (slot.typeId === "minecraft:shears") {
            if (targetBlock.typeId === "nox:grapevine") {
                const grapevineGrowthStage = targetBlock.permutation.getState("nox:growth_stage");
                if (grapevineGrowthStage === 10) {
                    if (inventoryComponent !== undefined) {
                        // Get the direction
                        const currentCardinalDirection =
                            targetBlock.permutation.getState("minecraft:cardinal_direction");
                        targetBlock.setPermutation(
                            BlockPermutation.resolve("nox:grapevine")
                                .withState("nox:growth_stage", 7)
                                .withState(
                                    "minecraft:cardinal_direction",
                                    currentCardinalDirection != undefined ? currentCardinalDirection : "north"
                                )
                        );
                        // inventoryComponent.container?.addItem(new ItemStack("nox:grapes", 6));
                        // Just spawn the item instead
                        const blockCenter: Vector3 = targetBlock.center();
                        const spawnLocation: Vector3 = {
                            x: blockCenter.x,
                            y: blockCenter.y + 0.5,
                            z: blockCenter.z,
                        };
                        player.dimension.spawnItem(new ItemStack("nox:grapes", 1), spawnLocation);
                        player.playSound("mob.sheep.shear");
                    }
                }
            }
        }
    }
});

world.afterEvents.playerInteractWithEntity.subscribe((e: PlayerInteractWithEntityAfterEvent) => {
    if (e.target.typeId === "nox:quarry_miner") {
        const quaryMiner = QuarryMiner.GetFromCache(e.target);
        if (quaryMiner !== null) {
            quaryMiner.OnPlayerInteract(e.player);
        }
    } else if (e.target.typeId === "nox:smelter") {
        const smelter = Smelter.GetFromCache(e.target);
        if (smelter !== null) {
            smelter.OnPlayerInteract(e.player);
        }
    }
});

world.afterEvents.worldInitialize.subscribe(() => {
    // Check if there is a world-scoped dynamic property for the Woodcutter NPC
    const nextNpcId = world.getDynamicProperty("nox:next_npc_id");
    const nextWoodCutterId = world.getDynamicProperty("nox:next_woodcutter_id");
    if (nextWoodCutterId === undefined) {
        // This property needs to be registered to this world
        world.setDynamicProperty("nox:next_woodcutter_id", 1);
    }

    if (nextNpcId === undefined) {
        world.setDynamicProperty("nox:next_npc_id", 1);
    }
});

world.afterEvents.entityLoad.subscribe((e: EntityLoadAfterEvent) => {
    const entity: Entity = e.entity;
    // Did we just load a Woodcutter?
    if (entity.typeId === "nox:woodcutter") {
        // If it is not already cached in memory, then this woodcutter needs to be registered on the server
        if (Woodcutter.GetFromCache(entity) === null) {
            Woodcutter.LoadFromExistingEntity(entity, npcHandler);
        }
    } else if (entity.typeId === "nox:quarry_miner") {
        if (QuarryMiner.GetFromCache(entity) === null) {
            QuarryMiner.LoadFromExistingEntity(entity, npcHandler);
        }
    } else if (entity.typeId === "nox:smelter") {
        if (Smelter.GetFromCache(entity) === null) {
            Smelter.LoadFromExistingEntity(entity, npcHandler);
        }
    }
});

world.afterEvents.entitySpawn.subscribe((e: EntitySpawnAfterEvent) => {
    const entity: Entity = e.entity;
    if (entity.typeId === "nox:quarry_miner") {
        if (QuarryMiner.GetFromCache(entity) === null) {
            system.run(() => {
                QuarryMiner.AsNew(entity, npcHandler);
            });
        }
    } else if (entity.typeId === "nox:smelter") {
        if (Smelter.GetFromCache(entity) === null) {
            system.run(() => {
                Smelter.AsNew(entity, npcHandler);
            });
        }
    }
});

world.afterEvents.entityDie.subscribe((e: EntityDieAfterEvent) => {
    const entity: Entity = e.deadEntity;
    if (entity.typeId === "nox:quarry_miner") {
        QuarryMiner.OnMinerDied(entity);
    } else if (entity.typeId === "nox:smelter") {
        Smelter.OnDied(entity);
    }
});

world.afterEvents.chatSend.subscribe(async (e: ChatSendAfterEvent) => {
    if (e.message === "biome") {
        system.run(async () => {
            const biomeHelper = new BiomeHelper();
            const biomeType = await biomeHelper.GetBiomeOfLocation(e.sender.location, e.sender.dimension);
            e.sender.sendMessage(String(biomeType?.id));
        });
    } else if (e.message === "test") {
        const blockFinder = new RadiusFinder();
        const blockFound = await blockFinder.GetBlockInRadius(
            e.sender.location,
            "minecraft:oak_log",
            5,
            e.sender.dimension
        );
        if (blockFound === undefined) {
            e.sender.sendMessage("Not found");
        } else {
            e.sender.sendMessage("Found: " + blockFound.typeId);
        }
    } else if (e.message === "find-wood") {
        console.warn("Finding oak log within 64^3 block cuboid.");
        const startLocation: Vector3 = e.sender.location;
        const dimension: Dimension = world.getDimension("overworld");
        const maxDistance: number = 256; // Search within 15 blocks
        const floodFillOptions = new FloodFillIteratorOptions(startLocation, dimension, maxDistance);
        floodFillOptions.TypeIdsToConsiderPassable = ["minecraft:air"];
        floodFillOptions.TypeIdsToAlwaysIncludeInResult = ["minecraft:oak_log"];
        const blockFound = await new Promise<Block | null>((resolve) => {
            system.runJob(FindFirstBlock(resolve, floodFillOptions));
        });
        if (blockFound !== null) {
            console.warn(`Found oak log at: ${VectorUtils.GetAsString(blockFound.location)}`);
        } else {
            console.warn("Did not find oak log");
        }
    }
});

function* FindFirstBlock(blockFoundResolve: (block: Block | null) => void, floodFillOptions: FloodFillIteratorOptions) {
    let blockThatWasFound: Block | null = null;
    const floodFillIterator = new FloodFillIterator(floodFillOptions);
    const startTimeMs = new Date().getTime();
    console.warn("Start unix time: " + startTimeMs);
    for (const block of floodFillIterator.IterateLocations()) {
        if (block !== null && block.isValid()) {
            if (block.typeId === "minecraft:oak_log") {
                blockThatWasFound = block;
                break;
            }
        }

        // Important to yield to allow the MC engine to control how often this iterator runs!
        yield;
    }

    const timeTook = new Date().getTime() - startTimeMs;
    console.warn(`End. Time taken to search 64^3 blocks: ${timeTook}ms`);
    return blockFoundResolve(blockThatWasFound);
}
