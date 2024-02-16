import { Block, BlockPermutation, BlockRaycastHit, BlockRaycastOptions, ContainerSlot, Entity, EntityInventoryComponent, ItemStack, Player, Vector3 } from "@minecraft/server";

export class FinishedWineBarrelBlock{
    /**
     * Fires when an empty tankard is used on the barrel
     */
    public static OnEmptyTankardUsedOn(block: Block, slot: ContainerSlot, player: Player): void{
        const cupsUsedOnBarrel = Number(block.permutation.getState("nox:cups-used"));

        if (cupsUsedOnBarrel < 15){
            // Give them a tankard of wine
            const inventoryComponent = player.getComponent(EntityInventoryComponent.componentId);
            if (inventoryComponent !== undefined){
                inventoryComponent.container?.addItem(new ItemStack("nox:wine-tankard", 1));

                // Take away the empty tankard
                if (slot.amount > 1){
                    const newSlotItem = slot.getItem();
                    if (newSlotItem !== undefined){
                        newSlotItem.amount = newSlotItem.amount - 1;
                        slot.setItem(newSlotItem);
                    }
                }else{
                    slot.setItem(undefined);
                }

                // Give them some wine
                block.setPermutation(block.permutation.withState("nox:cups-used", cupsUsedOnBarrel + 1));

                if (cupsUsedOnBarrel === 15){
                    FinishedWineBarrelBlock.EmptyBarrel(block);
                }
            }
        }else{
            FinishedWineBarrelBlock.EmptyBarrel(block);
        }
    }

    /**
     * Sets the barrel to an empty barrel
     * @param block
     */
    public static EmptyBarrel(block: Block){
        // Turn to empty barrel
        const currentBarrelCardinalDirection = block.permutation.getState("minecraft:cardinal_direction");
        block.setPermutation(BlockPermutation.resolve("nox:wine-barrel-empty").withState("minecraft:cardinal_direction", currentBarrelCardinalDirection ?? "north"));
    }
}