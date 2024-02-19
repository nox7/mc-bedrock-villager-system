import { Dimension, Vector3 } from "@minecraft/server";

export interface FloodFillIteratorOptions{
    StartLocation: Vector3;
    Dimension: Dimension;
    LocationsToIgnore: Vector3[];
    MaxDistance: number;
    /**
     * Tags that should never be considered by the iterator.
     */
    TagsToIgnore: string[];
    /**
     * Type Ids that should never be considered by the iterator.
     */
    TypeIdsToIgnore: string[];
    /**
     * Any tags to consider passable. Such as flowers, grass, etc.
     */
    TagsToConsiderPassable: string[],
    /**
     * Usually just minecraft:air
     */
    TypeIdsToConsiderPassable: string[],
    /**
     * Block Type Ids to always include in a flood fill result - regardless if it is passable. This is used
     * in the BlockFinder to make sure the block we are looking for is always included.
     */
    TypeIdsToAlwaysIncludeInResult: string[],
    /**
     * Same as TypeIdsToAlwaysIncludeInResult, but for tag matches
     */
    TagsToAlwaysIncludeInResult: string[],
    /**
     * Allows the Flood-Fill iterator to climb up or down on the Y axis without the algorithm to determine if 
     * it is a safe fall or a reasonable jump for an entity.
     */
    AllowYAxisFlood: boolean
}