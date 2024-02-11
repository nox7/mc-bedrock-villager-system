/**
 * NOTE: This main.ts is currently a mess and is not structurted. Code is WIP and will be more class-OOPed or whatever the hell later.
 */

import { world, system, ItemUseOnBeforeEvent, Player, PlayerPlaceBlockAfterEvent, Block, Vector3, DimensionLocation, World, Dimension, Entity, WorldInitializeAfterEvent, EntityLoadAfterEvent, ScriptEventCommandMessageAfterEvent, ItemUseOnAfterEvent, EntityEquippableComponent, PlayerInteractWithBlockAfterEvent, EquipmentSlot, BlockPermutation, EntityInventoryComponent, ItemStack, PlayerBreakBlockBeforeEvent, PlayerInteractWithBlockBeforeEvent, ContainerSlot } from "@minecraft/server";
import NPCHandler from "./NPCHandler.js";
import WoodcutterManagerBlock from "./BlockHandlers/WoodcutterManagerBlock.js";
import Woodcutter from "./NPCs/Woodcutter.js";
import Debug from "./Debug/Debug.js";
import { LogLevel } from "./Debug/LogLevel.js";
import { UVFilterBlock } from "./BlockHandlers/UVFilterBlock.js";
import { OpenWineBarrelBlock } from "./BlockHandlers/OpenWineBarrelBlock.js";
import { PlayerDebounceManager } from "./Utilities/PlayerDebounceManager.js";

Debug.LogLevel = LogLevel.None;

const npcManager = new NPCHandler();
system.runInterval(() => {
  npcManager.OnGameTick();
});

system.afterEvents.scriptEventReceive.subscribe( (event: ScriptEventCommandMessageAfterEvent) => {
  if (event.id === "nox:uv-block-tick"){
    system.run(() => {
      if (event.sourceBlock !== undefined){
        if (event.sourceBlock.isValid()){
          UVFilterBlock.OnBlockTick(event.sourceBlock);
        }
      }
    })
  }else if (event.id === "nox:open-wine-barrel-step-on"){
    if (event.sourceBlock !== undefined){
      if (event.sourceBlock.isValid()){
        //if (event.sourceEntity !== undefined){
          OpenWineBarrelBlock.OnBlockSteppedOn(event.sourceBlock);
        //}
      }
    }
  }
});

world.afterEvents.playerPlaceBlock.subscribe(async (playerPlaceBlockEvent : PlayerPlaceBlockAfterEvent) => {
  const block = playerPlaceBlockEvent.block;

  // Player placed a woodcutter-manager block
  if (block.permutation.matches("nox:woodcutter-manager")){
    const woodcutterManagerBlock: WoodcutterManagerBlock = new WoodcutterManagerBlock(block);
    const woodcutterNpc: Woodcutter | null = woodcutterManagerBlock.SpawnWoodcutter();
    if (woodcutterNpc){
      npcManager.RegisterNPC(woodcutterNpc);
    }
  }
});

world.beforeEvents.itemUseOn.subscribe((itemUseOnBeforeEvent : ItemUseOnBeforeEvent) => {
  // world.sendMessage("ITEM USED ON BLOCK");
  if (itemUseOnBeforeEvent.block.permutation.matches("nox:woodcutter-manager")){
    const player: Player = itemUseOnBeforeEvent.source;
    if (player.isSneaking){
      // Do nothing, let them act normally on this block
      // world.sendMessage("IS SNEAKING");
    }else{
      // Cancel whatever the player tried to do on this 
      // world.sendMessage("Is woodcutter");
      itemUseOnBeforeEvent.cancel = true;
    }
  }else{
    // world.sendMessage("Is not woodcutter");
  }
});

world.beforeEvents.playerInteractWithBlock.subscribe((interactEvent : PlayerInteractWithBlockBeforeEvent) => {
  const player: Player = interactEvent.player;

  if (PlayerDebounceManager.IsDebounced(player, 350)){
    return;
  }

  PlayerDebounceManager.Debounce(player);

  let equipmentComponent: EntityEquippableComponent | undefined
  let inventoryComponent: EntityInventoryComponent | undefined;
  let slot: ContainerSlot | undefined;
  try{
    equipmentComponent = player.getComponent(EntityEquippableComponent.componentId);
    inventoryComponent = player.getComponent(EntityInventoryComponent.componentId);
    slot = equipmentComponent?.getEquipmentSlot(EquipmentSlot.Mainhand);
  }catch(e){
    return;
  }

  if (slot !== undefined && slot.isValid() && slot.hasItem()){
    if (slot.typeId === "nox:grapes"){
      const targetBlock = interactEvent.block;
      if (targetBlock.typeId === "nox:wine-barrel"){
        const grapeCount = targetBlock.permutation.getState("nox:grape-count");
        if (grapeCount !== undefined){
          if (Number(grapeCount) < 12){
            interactEvent.cancel = true;
            system.run(() => {
              const slotItemStack = slot?.getItem();
              if (slotItemStack !== undefined){
                targetBlock.setPermutation(targetBlock.permutation.withState("nox:grape-count", Number(grapeCount) + 1));
                player.playSound("item.book.put", {
                  volume: 0.25
                });
                if (slotItemStack.amount > 1){
                  slotItemStack.amount = slotItemStack.amount - 1;
                  slot?.setItem(slotItemStack);
                }else{
                  slot?.setItem(undefined);
                }
              }
            });
          }
        }
      }
    }
  }
});

world.afterEvents.playerInteractWithBlock.subscribe((interactEvent : PlayerInteractWithBlockAfterEvent) => {
  const player: Player = interactEvent.player;

  let equipmentComponent: EntityEquippableComponent | undefined
  let inventoryComponent: EntityInventoryComponent | undefined;
  let slot: ContainerSlot | undefined;
  try{
    equipmentComponent = player.getComponent(EntityEquippableComponent.componentId);
    inventoryComponent = player.getComponent(EntityInventoryComponent.componentId);
    slot = equipmentComponent?.getEquipmentSlot(EquipmentSlot.Mainhand);
  }catch(e){
    return;
  }

  if (slot !== undefined && slot.isValid() && slot.hasItem()){
    if (slot.typeId === "minecraft:shears"){
      const targetBlock: Block = interactEvent.block;
      if (targetBlock.typeId === "nox:grapevine"){
        const grapevineGrowthStage = targetBlock.permutation.getState("nox:growth_stage");
        if (grapevineGrowthStage === 10){
          if (inventoryComponent !== undefined){
            targetBlock.setPermutation(BlockPermutation.resolve("nox:grapevine").withState("nox:growth_stage", 7));
            // inventoryComponent.container?.addItem(new ItemStack("nox:grapes", 6));
            // Just spawn the item instead
            const blockCenter: Vector3 = targetBlock.center();
            const spawnLocation: Vector3 = {
              x: blockCenter.x,
              y: blockCenter.y + 0.5,
              z: blockCenter.z
            };
            player.dimension.spawnItem(new ItemStack("nox:grapes", 1), spawnLocation);
            player.playSound("mob.sheep.shear");
          }
        }
      }
    }
  }
});

world.afterEvents.worldInitialize.subscribe( () => {
  // Check if there is a world-scoped dynamic property for the Woodcutter NPC
  const nextWoodCutterId = world.getDynamicProperty("nox:next_woodcutter_id");
  if (nextWoodCutterId === undefined){
    // This property needs to be registered to this world
    world.setDynamicProperty("nox:next_woodcutter_id", 1);
  }
});

world.afterEvents.entityLoad.subscribe( (e: EntityLoadAfterEvent) => {
  const entity: Entity = e.entity;
  // Did we just load a Woodcutter?
  if (entity.typeId === "nox:woodcutter"){
    // If it is not already cached in memory, then this woodcutter needs to be registered on the server
    if (Woodcutter.GetFromCache(entity) === null){
      Woodcutter.LoadFromExistingEntity(entity, npcManager);
    }
  }
});