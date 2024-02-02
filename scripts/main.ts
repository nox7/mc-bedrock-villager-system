/**
 * NOTE: This main.ts is currently a mess and is not structurted. Code is WIP and will be more class-OOPed or whatever the hell later.
 */

import { world, system, ItemUseOnBeforeEvent, Player, PlayerPlaceBlockAfterEvent, Block, Vector3, DimensionLocation, World, Dimension, Entity, WorldInitializeAfterEvent, EntityLoadAfterEvent, ScriptEventCommandMessageAfterEvent } from "@minecraft/server";
import NPCHandler from "./NPCHandler.js";
import WoodcutterManagerBlock from "./BlockHandlers/WoodcutterManagerBlock.js";
import Woodcutter from "./NPCs/Woodcutter.js";
import Debug from "./Debug/Debug.js";
import { LogLevel } from "./Debug/LogLevel.js";
import { UVFilterBlock } from "./BlockHandlers/UVFilterBlock.js";

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