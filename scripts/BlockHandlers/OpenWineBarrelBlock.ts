import { Block, BlockPermutation, BlockRaycastHit, BlockRaycastOptions, Entity, Player, Vector3 } from "@minecraft/server";

export class OpenWineBarrelBlock{
    /**
     * Fires when the block is stepped on
     */
    public static OnBlockSteppedOn(block: Block): void{
        const stepOnMeStage = Number(block.permutation.getState("nox:step-on-count"));

        if (stepOnMeStage < 3){
            console.warn("Step on me");
            // Increment the stage
            block.setPermutation(
                BlockPermutation.resolve("nox:wine-barrel")
                .withState("nox:grape-count", 12)
                .withState("nox:step-on-count", stepOnMeStage + 1)
            );
        }else{
            // Replace the block with the closed, fermenting barrel
            block.setPermutation(BlockPermutation.resolve("nox:wine-barrel-closed"));
        }
    }
}