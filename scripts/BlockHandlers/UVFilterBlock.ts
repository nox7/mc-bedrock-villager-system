import { Block, BlockPermutation, BlockRaycastHit, BlockRaycastOptions, Vector3 } from "@minecraft/server";

export class UVFilterBlock{
    /**
     * Fires when the block itself ticks
     */
    public static OnBlockTick(block: Block): void{
        const wheat: Block | null = UVFilterBlock.GetWheatBlockBeneath(block);
        const growthStage = Number(wheat?.permutation.getState("growth"));

        if (wheat !== null){
            if (!isNaN(growthStage)){
                // If the wheat's growth stage is less than the maximum (7)
                // Increment it
                if (growthStage < 7){
                    if (wheat.isValid()){
                        wheat.setPermutation(wheat.permutation.withState("growth", growthStage + 1));
                    }
                }
            }
        }
    }

    /**
     * Searched 1-10 blocks beneath the provided block for wheat
     */
    private static GetWheatBlockBeneath(block: Block): Block | null{
        const raycastOptions: BlockRaycastOptions = {
            includeLiquidBlocks: false,
            includePassableBlocks: true,
            maxDistance: 10
        };
        
        const blockCenter: Vector3 = block.center();
        const blockRaycastHit: BlockRaycastHit | undefined = block.dimension.getBlockFromRay(
            {x: blockCenter.x, y: blockCenter.y - 1, z: blockCenter.z},
            {x: 0, y:-1, z:0}, 
            raycastOptions
            );
            
        if (blockRaycastHit !== undefined){
            if (blockRaycastHit.block.typeId === "minecraft:wheat"){
                return blockRaycastHit.block;
            }
        }

        return null;
    }
}