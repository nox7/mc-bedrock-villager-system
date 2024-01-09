/**
 * NOTE: This main.ts is currently a mess and is not structurted. Code is WIP and will be more class-OOPed or whatever the hell later.
 */

import { world, system, BlockPermutation, EntityInventoryComponent, ItemStack, DisplaySlotId, ItemUseOnBeforeEvent, Player, PlayerPlaceBlockAfterEvent, Block, Vector3, DimensionLocation, World, Dimension, Entity } from "@minecraft/server";
import BlockFinder from "./Utilities/BlockFinder.js";
import Vector3Distance from "./Utilities/Vector3Distance.js";
import ToUnitVector3 from "./Utilities/ToUnitVector3.js";
import EntityWalker from "./Walker/EntityWalker.js";

interface Region{
  Corner1: Vector3;
  Corner2: Vector3;
}

/**
 * Provides a region (two corners) as a cuboid around the provided location. 
 * The size of the cube is cubeRadius * 2. Setting verticallyFlat to true will keep 
 * the same y value (height) and only affect the X and Z values.
 * @param location 
 * @param cubeRadius 
 * @param verticallyFlat 
 * @returns 
 */
function GetCuboidRegionAroundLocation(location: Vector3, cubeRadius: number, verticallyFlat: boolean): Region{
  cubeRadius = Math.round(cubeRadius);
  return {
    Corner1: {
      x: location.x - cubeRadius,
      y: (!verticallyFlat ? (location.y - cubeRadius) : location.y),
      z: location.z - cubeRadius,
    },
    Corner2: {
      x: location.x + cubeRadius,
      y: (!verticallyFlat ? (location.y + cubeRadius) : location.y),
      z: location.z + cubeRadius,
    }
  }
}

/**
 * Find the first empty (minecraft:air) location in a provided rectangular region.
 * @param corner1 
 * @param corner2 
 * @param whichDimension 
 * @returns 
 */
function GetFirstEmptyLocationInRegionOfDimension(corner1: Vector3, corner2: Vector3, whichDimension: Dimension): Vector3 | null{
  const top: Vector3 = {
    x: Math.min(corner1.x, corner2.x),
    y: Math.min(corner1.y, corner2.y),
    z: Math.min(corner1.z, corner2.z),
  };

  const bottom: Vector3 = {
    x: Math.max(corner1.x, corner2.x),
    y: Math.max(corner1.y, corner2.y),
    z: Math.max(corner1.z, corner2.z),
  };

  for (let x = top.x; x <= bottom.x; x++){
    for (let y = top.y; y <= bottom.y; y++){
      for (let z = top.z; z <= bottom.z; z++){
        try{
          // Null would mean the chunk isn't loaded
          const block = whichDimension.getBlock({x: x, y: y, z :z});
          if (block?.permutation.matches("minecraft:air")){
            console.log("Found an air block as requested.");
            return block.location;
          }
        }catch(e){}
      }
    }
  }

  console.log("No free block found, when requested");
  return null;
}

world.afterEvents.playerPlaceBlock.subscribe(async (playerPlaceBlockEvent : PlayerPlaceBlockAfterEvent) => {
  const block = playerPlaceBlockEvent.block;
  if (block.permutation.matches("nox:woodcutter-manager")){
    const overworld = world.getDimension("overworld");
    const regionAroundPlacedBlock: Region = GetCuboidRegionAroundLocation(block.location, 1, true);
    const freeSpaceVector: Vector3 | null = GetFirstEmptyLocationInRegionOfDimension(regionAroundPlacedBlock.Corner1, regionAroundPlacedBlock.Corner2, overworld);
    if (freeSpaceVector !== null){
      const blockFinder: BlockFinder = new BlockFinder();
      const newEntity: Entity = overworld.spawnEntity("nox:villager", freeSpaceVector);
      // const nearestOakLogs: Block[] = await blockFinder.FindBlocksMatchingPermuations(
      //   freeSpaceVector,
      //   10,
      //   ["minecraft:log"],
      //   overworld
      // );

      const nearestOakLog: Block | null = await blockFinder.FindFirstBlockMatchingPermutation(
        freeSpaceVector,
        15,
        ["minecraft:log"],
        overworld
      );

      if (nearestOakLog !== null){
        const targetLocation = nearestOakLog.location;
        const walker = new EntityWalker(newEntity);
        await walker.MoveTo(targetLocation);

        let runId = system.runInterval( () => {
          if (Vector3Distance(newEntity.location, targetLocation) < 2.0){
            system.clearRun(runId);
          }else{
            const direction = ToUnitVector3({
              x: targetLocation.x - newEntity.location.x,
              y: targetLocation.y - newEntity.location.y,
              z: targetLocation.z - newEntity.location.z
            });

            newEntity.teleport({
              x: newEntity.location.x + direction.x / 8,
              y: newEntity.location.y + direction.y / 8,
              z: newEntity.location.z + direction.z / 8
            },
            {
              facingLocation: targetLocation
            });
          }
        });
      }else{
        playerPlaceBlockEvent.player.sendMessage("No oak logs around.");
      }
    }else{
      playerPlaceBlockEvent.player.sendMessage("No free space around the Woodcutter Manager block. Place this block somewhere else where there is a free space around it.");
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