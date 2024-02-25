import { Block, BlockPermutation, BlockRaycastHit, BlockRaycastOptions, Vector, Vector3 } from "@minecraft/server";

type BlockGrowthStateData = {
    GrowthStateName: string;
    GrowthMaxNumericValue: number
};

type RecognizedBlockTypeAndData = {
    [key: string]: BlockGrowthStateData
};

export class UVFilterBlock{
    private static RecognizedBlocks: RecognizedBlockTypeAndData = {
        "minecraft:wheat": {
            "GrowthStateName": "growth",
            "GrowthMaxNumericValue": 7
        },
        "minecraft:potatoes": {
            "GrowthStateName": "growth",
            "GrowthMaxNumericValue": 7
        },
        "minecraft:carrots": {
            "GrowthStateName": "growth",
            "GrowthMaxNumericValue": 7
        },
        "minecraft:beetroot": {
            "GrowthStateName": "growth",
            "GrowthMaxNumericValue": 7
        },
        "minecraft:melon_stem": {
            "GrowthStateName": "growth",
            "GrowthMaxNumericValue": 7
        },
        "minecraft:pumpkin_stem": {
            "GrowthStateName": "growth",
            "GrowthMaxNumericValue": 7
        },
        "minecraft:reeds": {
            "GrowthStateName": "age",
            "GrowthMaxNumericValue": 15
        }
    };
    
    /**
     * Fires when the block itself ticks
     */
    public static OnBlockTick(block: Block): void{
        const growableBlock: Block | null = UVFilterBlock.GetRecognizedGrowableBlockBelow(block);
        
        if (growableBlock !== null){
            // We handle sugar cane differently
            if (growableBlock.typeId === "minecraft:reeds"){
                const currentHeight: number = UVFilterBlock.GetCurrentSugarCaneHeight(growableBlock);
                if (currentHeight < 4){
                    // Check if the block above it is air
                    let blockAboveGrowableBlock: Block | undefined;
                    try{
                        blockAboveGrowableBlock = growableBlock.above(1);
                    }catch(e){}
                    if (blockAboveGrowableBlock !== undefined){
                        if (blockAboveGrowableBlock.isAir){
                            // Make it a sugar cane
                            blockAboveGrowableBlock.setPermutation(growableBlock.permutation.withState("age", 0));
                        }
                    }
                }
            }else{
                const growthStageData: BlockGrowthStateData = UVFilterBlock.RecognizedBlocks[growableBlock.typeId];
                const growthStageValue = Number(growableBlock.permutation.getState(growthStageData.GrowthStateName));
                if (!isNaN(growthStageValue)){
                    // Check if the growth stage is less than its known maximum
                    if (growthStageValue < growthStageData.GrowthMaxNumericValue){
                        if (growableBlock.isValid()){
                            growableBlock.setPermutation(growableBlock.permutation.withState(growthStageData.GrowthStateName, growthStageValue + 1));
                        }
                    }
                }
            }
        }
    }

    /**
     * Searched 1-10 blocks beneath the provided block for wheat
     */
    private static GetRecognizedGrowableBlockBelow(block: Block): Block | null{
        const raycastOptions: BlockRaycastOptions = {
            includeLiquidBlocks: false,
            includePassableBlocks: true,
            maxDistance: 10
        };
        
        const blockCenter: Vector3 = block.center();
        const blockRaycastHit: BlockRaycastHit | undefined = block.dimension.getBlockFromRay(
            Vector.subtract(blockCenter, {x: 0, y: 1, z: 0}),
            {x: 0, y:-1, z:0}, 
            raycastOptions
            );
            
        if (blockRaycastHit !== undefined){
            const recognizedTypeIds: string[] = Object.keys(UVFilterBlock.RecognizedBlocks);
            if (recognizedTypeIds.indexOf(blockRaycastHit.block.typeId) > -1){
                // Found a recognized growable block
                return blockRaycastHit.block;
            }
        }

        return null;
    }

    /**
     * Returns the current vertical height of a sugar cane block
     */
    private static GetCurrentSugarCaneHeight(sugarCaneBlock: Block): number{
        const maxHeight: number = 10;
        let height: number = 1;
        let nextBlockBelow: Block | undefined;
        do{
            try{
                if (nextBlockBelow === undefined){
                    nextBlockBelow = sugarCaneBlock.below(1);
                }else{
                    nextBlockBelow = nextBlockBelow.below(1);
                }
            }catch(e){}

            if (nextBlockBelow !== undefined){
                if (nextBlockBelow.typeId === "minecraft:reeds"){
                    ++height;
                }else{
                    break;
                }
            }else{
                break;
            }

        }while(nextBlockBelow !== undefined && height < maxHeight);

        return height;
    }
}