import { Block, BlockPermutation, BlockRaycastHit, BlockRaycastOptions, Entity, Player, Vector3 } from "@minecraft/server";

export class ClosedWineBarrelBlock{
    public static readonly MaxFermentationStage = 10;

    /**
     * Fires when the block's queued ticking event fires
     */
    public static OnQueuedTicking(block: Block): void{
        const fermentationStage = Number(block.permutation.getState("nox:fermentation-stage"));

        if (fermentationStage < ClosedWineBarrelBlock.MaxFermentationStage){
            block.setPermutation(block.permutation.withState("nox:fermentation-stage", Number(fermentationStage) + 1));
        }else{
            // Transform block
            block.setPermutation(BlockPermutation.resolve("nox:wine-barrel-finished").withState("nox:cups-used", 0));
        }
    }
}