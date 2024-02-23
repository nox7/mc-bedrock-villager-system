import { Dimension, Vector3 } from "@minecraft/server";

/**
 * Options to provide to the AStar pathfinding operation to customize its approach to nodes and calculating a path.
 */
export interface IAStarOptions{
    /**
     * The starting location to pathfind from.
     */
    StartLocation: Vector3;
    /**
     * The goal location to pathfind to.
     */
    GoalLocations: Vector3;
    Dimension: Dimension;
    /**
     * Any locations in this list will be ignored unconditionally - they will never be attempted to even be checked.
     */
    LocationsToIgnore: Vector3[];
    /**
     * The maximum nodes the A* pathfinder should have in its closed list before a path is considered not calculatable.
     */
    MaximumNodesToConsider: number;
    /**
     * Tags that should never be considered by the pathdinder.
     */
    TagsToIgnore: string[];
    /**
     * Type Ids that should never be considered by the pathdinder.
     */
    TypeIdsToIgnore: string[];
    /**
     * Any tags to consider passable. Such as flowers, grass, etc.
     */
    TagsToConsiderPassable: string[];
    /**
     * Usually just minecraft:air
     */
    TypeIdsToConsiderPassable: string[];
    /**
     * Allows the Flood-Fill iterator to climb up or down on the Y axis without the algorithm to determine if 
     * it is a safe fall or a reasonable jump for an entity.
     */
    AllowYAxisFlood: boolean;
}