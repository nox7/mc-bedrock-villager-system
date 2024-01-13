/**
 * NOTE: This main.ts is currently a mess and is not structurted. Code is WIP and will be more class-OOPed or whatever the hell later.
 */

import { world, system, BlockPermutation, EntityInventoryComponent, ItemStack, DisplaySlotId, ItemUseOnBeforeEvent, Player, PlayerPlaceBlockAfterEvent, Block, Vector3, DimensionLocation, World, Dimension, Entity } from "@minecraft/server";
import NPCHandler from "./NPCHandler.js";
import WoodcutterManagerBlock from "./BlockHandlers/WoodcutterManagerBlock.js";
import Woodcutter from "./NPCs/Woodcutter.js";

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