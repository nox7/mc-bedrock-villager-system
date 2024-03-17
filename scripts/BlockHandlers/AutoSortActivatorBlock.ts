import { Block, BlockInventoryComponent, Container, EntityInventoryComponent, ItemStack, Player } from "@minecraft/server";
import { VectorUtils } from "../NoxBedrockUtilities/Vector/VectorUtils";
import GetAllConnectedBlocksOfType from "../Utilities/GetAllConnectedBlocksOfType";
import Debug from "../Debug/Debug";
import Wait from "../Utilities/Wait";
import { ActionFormData } from "@minecraft/server-ui";
import { Vector3Utils } from "@minecraft/math";

/**
 * Abstraction to represent the nox:auto-sorter-activator block - which will sort a player's inventory items into
 * nearby chests.
 */
export class AutoSortActivatorBlock{

    /**
     * A list of player Ids that a sorter is currently sorting for
     */
    public static CurrentlyProcessingForPlayerIds: string[] = [];

    private Block: Block;

    public constructor(block: Block){
        this.Block = block;
    }

    /**
     * When a player interacts with this block
     * @param player
     */
    public async OnPlayerInteract(player: Player): Promise<void>{
        if (player.isValid()){
            this.ShowUI(player);
        }
    }

    public async ShowUI(player: Player): Promise<void>{
        const form = new ActionFormData()
            .button("Sort Inventory into Nearby Chests")
            .button("Alphabetize Nearby Chests");

        const response = await form.show(player);
        const buttonSelection = response.selection;
        if (buttonSelection !== undefined){
            if (buttonSelection === 0){
                this.BeginSortingPlayerInventoryIntoNearbyChests(player);
            }else if (buttonSelection === 1){
                this.BeginAlphabetizingNearbyChests(player);
            }
        }
    }

    private async BeginSortingPlayerInventoryIntoNearbyChests(player: Player): Promise<void>{
        if (!this.IsSorterActiveForPlayer(player)){
            this.AddPlayerToActiveSortingProcesses(player);
            // Fetch the player's inventory
            const playerInventory = this.GetPlayerInventory(player);
            if (playerInventory !== undefined){
                const inventoryContainer = playerInventory.container;
                if (inventoryContainer !== undefined){
                    const chestsFound: Block[] = await this.GetNearbyChests();
                    
                    // Take the list of chests, get all the double and single chest blocks and their inventory containers
                    // This handles duplicate chest blocks that may be the same large chest
                    const doubleAndSingleChestBlockAndContainer: FilteredChestBlocksResult = this.GetAllDoubleAndSingleChestBlocksAndTheirContainers(chestsFound);
                    player.sendMessage("Sorting your items into " + String(doubleAndSingleChestBlockAndContainer.Doubles.length) + " double chests and " + String(doubleAndSingleChestBlockAndContainer.Singles.length) + " single chests.");
                    const allChestInventories: BlockInventoryComponent[] = [];

                    for (const result of doubleAndSingleChestBlockAndContainer.Singles){
                        allChestInventories.push(result.InventoryComponent);
                    }

                    for (const result of doubleAndSingleChestBlockAndContainer.Doubles){
                        allChestInventories.push(result.InventoryComponent);
                    }

                    const slotSortCountResult: InventoryFilterResultCounts | null = await this.SortInventoryItemsIntoChests(playerInventory, allChestInventories);
                    if (slotSortCountResult !== null){
                        if (player.isValid()){
                            player.sendMessage("Sorted " + String(slotSortCountResult.TotalItemsSorted) + " items from " + String(slotSortCountResult.TotalSlotsSorted) + " inventory slots.");
                        }
                    }
                }
            }
            
            this.RemovePlayerToActiveSortingProcesses(player);
        }else{
            player.sendMessage("You already have a currently active sorting process. Wait until it's finished to start another.");
        }
    }

    /**
     * Sorts all nearby chest contents alphabetically (alphabetically per container, not across all containers).
     */
    private async BeginAlphabetizingNearbyChests(player: Player | null): Promise<void>{
        const chestsFound: Block[] = await this.GetNearbyChests();
                    
        // Take the list of chests, get all the double and single chest blocks and their inventory containers
        // This handles duplicate chest blocks that may be the same large chest
        const doubleAndSingleChestBlockAndContainer: FilteredChestBlocksResult = this.GetAllDoubleAndSingleChestBlocksAndTheirContainers(chestsFound);

        if (player !== null && player.isValid()){
            player.sendMessage("Alphabetizing contents of " + String(doubleAndSingleChestBlockAndContainer.Doubles.length) + " double chests and " + String(doubleAndSingleChestBlockAndContainer.Singles.length) + " single chests.");
        }
        const allChestInventories: BlockInventoryComponent[] = [];

        for (const result of doubleAndSingleChestBlockAndContainer.Singles){
            allChestInventories.push(result.InventoryComponent);
        }

        for (const result of doubleAndSingleChestBlockAndContainer.Doubles){
            allChestInventories.push(result.InventoryComponent);
        }

        const slotSortCountResult = await this.AlphabetizeChestInventories(allChestInventories);
        if (slotSortCountResult !== null){
            if (player !== null && player.isValid()){
                player.sendMessage("Alphabetized nearby chests.");
            }
        }
    }

    /**
     * Sorts all the items that are in the inventoryContainer into the chestContainers by moving them over into the first chestContainer that contains
     * the currently iterated item from inventoryContainer
     * @param inventoryContainer 
     * @param chestContainers 
     */
    private async SortInventoryItemsIntoChests(inventoryContainer: EntityInventoryComponent, chestContainers: BlockInventoryComponent[]): Promise<InventoryFilterResultCounts | null>{
        let itemSlotsSorted = 0;
        let totalItemCountSorted = 0;
        if (inventoryContainer.container !== undefined){
            return new Promise<InventoryFilterResultCounts>(async resolve => {

                for (let inventorySlotIndex = 0; inventorySlotIndex < inventoryContainer.inventorySize; inventorySlotIndex++){
                    await Wait(1);
                    if (inventoryContainer.container !== undefined && inventoryContainer.isValid()){
                        const inventoryItem: ItemStack | undefined = inventoryContainer.container.getItem(inventorySlotIndex);
                        if (inventoryItem !== undefined){
        
                            // Whether or not we need to break from sorting the current inventory slot
                            let breakOutOfCurrentInventorySlot = false;
        
                            for (const chestInventory of chestContainers){
        
                                if (breakOutOfCurrentInventorySlot){
                                    break;
                                }
        
                                if (chestInventory.isValid()){
                                    // Only check this chest if it has non-empty slots
                                    if (chestInventory.container !== undefined){
                                        if (chestInventory.container.emptySlotsCount < chestInventory.container.size){
                                            for (let chestInventorySlotIndex = 0; chestInventorySlotIndex < chestInventory.container.size; chestInventorySlotIndex++){
                                                const chestItemAtSlot: ItemStack | undefined = chestInventory.container.getItem(chestInventorySlotIndex);
                                                if (chestItemAtSlot !== undefined){
                                                    // Are the chest item and the inventoryItem the same item?
                                                    if (chestItemAtSlot.isStackableWith(inventoryItem)){
                                                        const itemStackLeftAfterAddAttempt: ItemStack | undefined = chestInventory.container.addItem(inventoryItem);
                                                        
                                                        // Set the player inventory slot as the resulting item stack
                                                        // if it's undefined - it all went into the chest
                                                        // If it's not, then we are left with the remainder
                                                        if (itemStackLeftAfterAddAttempt === undefined){
                                                            ++itemSlotsSorted;
                                                            totalItemCountSorted += inventoryItem.amount;
                                                        }else{
                                                            // Calculate the difference
                                                            let amountInserted = inventoryItem.amount - itemStackLeftAfterAddAttempt.amount;
                                                            if (amountInserted > 0){
                                                                ++itemSlotsSorted;
                                                                totalItemCountSorted += amountInserted;
                                                            }
                                                        }
        
                                                        inventoryContainer.container.setItem(inventorySlotIndex, itemStackLeftAfterAddAttempt);
        
                                                        // If this item did not get sorted _completely_ into this chest, keep trying other chests
                                                        if (itemStackLeftAfterAddAttempt !== undefined){
                                                            // Break from this chest, but not from every chest
                                                            break;
                                                        }
        
                                                        // Go ahead and break out of this item slot sort entirely, move on to the next item
                                                        breakOutOfCurrentInventorySlot = true;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                resolve({
                    TotalItemsSorted: totalItemCountSorted,
                    TotalSlotsSorted: itemSlotsSorted
                });
            });
        }

        return null;
    }

    /**
     * Alphabetizes the contents of nearby chests and their containers
     * @param chestContainers
     */
    private async AlphabetizeChestInventories(chestContainers: BlockInventoryComponent[]): Promise<void>{
        for (const chestInventory of chestContainers){
            await Wait(1);
            // We need to cache all the item stacks that are in this chest
            if (chestInventory.container !== undefined){

                // Empty chest check
                if (chestInventory.container.emptySlotsCount === chestInventory.container.size){
                    // There are no items. Skip this chest
                    continue;
                }

                // Item stacks in this chest
                const chestInventoryItemStackCache: ItemStack[] = [];

                // Fetch all item stacks
                for (let chestInventorySlotIndex = 0; chestInventorySlotIndex < chestInventory.container.size; chestInventorySlotIndex++){
                    const stack: ItemStack | undefined = chestInventory.container.getItem(chestInventorySlotIndex);
                    if (stack !== undefined){
                        chestInventoryItemStackCache.push(stack);
                    }

                    // Remove it from the chest
                    chestInventory.container.setItem(chestInventorySlotIndex, undefined);
                }

                // Sort all items alphabetically
                chestInventoryItemStackCache.sort(
                    (stack1, stack2) => {
                        return (stack1.nameTag !== undefined ? stack1.nameTag : stack1.typeId) 
                            > (stack2.nameTag !== undefined ? stack2.nameTag : stack2.typeId) 
                            ? 1 : -1
                    });

                // Put them all back into the chest
                for (let index = 0; index < chestInventoryItemStackCache.length; index++){
                    chestInventory.container.setItem(index, chestInventoryItemStackCache[index]);
                }
            }
        }
    }

    /**
     * If there is already a sorting process happening for this player
     * @param player
     */
    public IsSorterActiveForPlayer(player: Player): boolean{
        return AutoSortActivatorBlock.CurrentlyProcessingForPlayerIds.indexOf(player.id) > -1;
    }

    public AddPlayerToActiveSortingProcesses(player: Player): void{
        AutoSortActivatorBlock.CurrentlyProcessingForPlayerIds.push(player.id);
    }

    public RemovePlayerToActiveSortingProcesses(player: Player): void{
        const index = AutoSortActivatorBlock.CurrentlyProcessingForPlayerIds.indexOf(player.id);
        if (index > -1){
            AutoSortActivatorBlock.CurrentlyProcessingForPlayerIds.splice(index, 1);
        }
    }

    /**
     * Fetches the player's inventory
     * @param player 
     */
    private GetPlayerInventory(player: Player): EntityInventoryComponent | undefined{
        return player.getComponent(EntityInventoryComponent.componentId);
    }

    /**
     * Fetches any chests connected to the sorter block, and connected to any of the adjacent chests and their adjacent chests recursively.
     */
    private async GetNearbyChests(maxConnectedChests: number = 120): Promise<Block[]>{
        if (!this.Block.isValid()){
            return [];
        }

        const chests: Block[] = GetAllConnectedBlocksOfType(this.Block, ["minecraft:chest"], maxConnectedChests);

        return chests;
    }

    /**
     * Takes in a list of Blocks that are assumed to be Chest blocks. Determines which are double chests and which are single chests. Returns
     * a result that will only have one Block and Container object for each double chest and one for each single chest.
     */
    private GetAllDoubleAndSingleChestBlocksAndTheirContainers(chests: Block[]): FilteredChestBlocksResult{
        const doubleChestBlockAndContainer: ChestAndContainerResult[] = [];

        // Location strings we've already checked
        const closedLocations: string[] = [];
        
        // A list of location strings taken by double chests
        // Used at the end to filter out the original location of all chests
        // then any left would be the single chests
        const locationsTakenByDoubleChests: string[] = [];
        const chestContainersResultByLocation: ChestsAndContainerResultByLocation = this.GetAllChestInventoryContainersIdentifiedByLocation(chests);
        for (const location in chestContainersResultByLocation){

            if (closedLocations.indexOf(location) > -1){
                // Skip, we've already checked it
                continue;
            }

            // Add this location to closed locations
            closedLocations.push(location);

            const chestAndContainerResult: ChestAndContainerResult = chestContainersResultByLocation[location];
            const cardinalDirection = chestAndContainerResult.Block.permutation.getState("minecraft:cardinal_direction");

            if (cardinalDirection !== undefined){
                let locationStringsToCheck: string[] = [];
                if (cardinalDirection === "north" || cardinalDirection === "south"){
                    locationStringsToCheck.push(VectorUtils.GetAsString(Vector3Utils.add(chestAndContainerResult.Block.location, {x: -1, y: 0, z: 0})));
                    locationStringsToCheck.push(VectorUtils.GetAsString(Vector3Utils.add(chestAndContainerResult.Block.location, {x: 1, y: 0, z: 0})));
                }else if (cardinalDirection === "east" || cardinalDirection === "west"){
                    locationStringsToCheck.push(VectorUtils.GetAsString(Vector3Utils.add(chestAndContainerResult.Block.location, {x: 0, y: 0, z: -1})));
                    locationStringsToCheck.push(VectorUtils.GetAsString(Vector3Utils.add(chestAndContainerResult.Block.location, {x: 0, y: 0, z: 1})));
                }

                for (const locationStringToCheck of locationStringsToCheck){
                    // Is it in the list of locations we have chests for?
                    if (locationStringToCheck in chestContainersResultByLocation){
                        if (closedLocations.indexOf(locationStringToCheck) === -1){
                            const otherLocationChestAndContainerResult: ChestAndContainerResult = chestContainersResultByLocation[locationStringToCheck];

                            // Are this location and the other location part of the same double-chest?
                            if (this.AreTwoChestContainersPartOfTheSameChest(chestAndContainerResult.Container, otherLocationChestAndContainerResult.Container)){
                                // Add the Block to the return array
                                doubleChestBlockAndContainer.push(chestAndContainerResult);

                                // Add the locationStringToCheck to the closed list - it doesn't need to be considered again
                                closedLocations.push(locationStringToCheck);

                                // Add both locations as having been double chests
                                locationsTakenByDoubleChests.push(location, locationStringToCheck);

                                // We found the double chest
                                // Break out of the loop
                                break;
                            }else{
                                Debug.Info("Not double chests");
                            }
                        }else{
                            Debug.Info("Already closed.");
                        }
                    }else{
                        Debug.Info("Not in locations found somehow");
                    }
                }
            }
        }

        // Find any locations not taken by double chests
        // Those will be the single chests
        const singleChestBlockAndContainers: ChestAndContainerResult[] = [];
        const allChestLocationStrings: string[] = Object.keys(chestContainersResultByLocation);
        const locationsNotTakenByDoubleChests: string[] = allChestLocationStrings.filter(location => locationsTakenByDoubleChests.indexOf(location) === -1);
        for (const location of locationsNotTakenByDoubleChests){
            singleChestBlockAndContainers.push(chestContainersResultByLocation[location]);
        }

        return {
            Doubles: doubleChestBlockAndContainer,
            Singles: singleChestBlockAndContainers
        };
    }

    /**
     * Fetches all the inventory components of the provided cehst blocks.
     * @param chests 
     */
    private GetAllChestInventoryContainersIdentifiedByLocation(chests: Block[]): ChestsAndContainerResultByLocation {
        const result: ChestsAndContainerResultByLocation = {}
        for (const chestBlock of chests){
            if (chestBlock.isValid()){
                const inventoryComponent = chestBlock.getComponent(BlockInventoryComponent.componentId);
                if (inventoryComponent !== undefined){
                    if (inventoryComponent.container !== undefined){
                        result[VectorUtils.GetAsString(chestBlock.location)] = {
                            Block: chestBlock,
                            InventoryComponent: inventoryComponent,
                            Container: inventoryComponent.container
                        };
                    }
                }
            }
        }

        return result;
    }

    /**
     * Determines if two chest containers are part of the same chest by using a quick-slot-0 replacement method. Always returns the original item
     * that was in slot 0 after comparison.
     * @param container1 
     * @param container2 
     */
    private AreTwoChestContainersPartOfTheSameChest(container1: Container, container2: Container): boolean{
        const cachedFirstSlotItem = container1.getSlot(0).getItem();

        const newItemToPlace: ItemStack = new ItemStack("minecraft:bedrock");
        newItemToPlace.setLore(["Nox7"]);

        container1.getSlot(0).setItem(newItemToPlace);

        const cachedFirstSlotContainer2 = container2.getSlot(0).getItem();
        if (cachedFirstSlotContainer2 === undefined){
            // They're not the same if container1 slot 0 has an item and container 2 slot 0 does not
            container1.getSlot(0).setItem(cachedFirstSlotItem);
            return false;
        }

        if (cachedFirstSlotContainer2.typeId === "minecraft:bedrock"){
            const lore = cachedFirstSlotContainer2.getLore();
            if (lore.length > 0){
                if (lore[0] === "Nox7"){
                    // Same item, same lore. They're the same chest
                    container1.getSlot(0).setItem(cachedFirstSlotItem);
                    return true;
                }
            }
        }

        container1.getSlot(0).setItem(cachedFirstSlotItem);
        return false;
    }
}

type ChestsAndContainerResultByLocation = {[key: string]: ChestAndContainerResult};

interface ChestAndContainerResult{
    Block: Block;
    InventoryComponent: BlockInventoryComponent;
    Container: Container;
}

interface FilteredChestBlocksResult{
    Doubles: ChestAndContainerResult[];
    Singles: ChestAndContainerResult[];
}

interface InventoryFilterResultCounts{
    TotalSlotsSorted: number;
    TotalItemsSorted: number;
}