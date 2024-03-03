import { Player, TicksPerSecond, system, world } from "@minecraft/server";

/**
 * Implementation for multiplayer servers to allow a single player to trigger sleeping through a night
 */
export class SingleBedManager{
    /**
     * If a player has started to sleep in a bed
     */
    public static HasQueued: boolean = false;

    public static OnPlayerInteractWithBed(player: Player): void{
        // Ignore if there is already a "do next day" queue
        if (SingleBedManager.HasQueued){
            return;
        }

        // Make sure the game has let the player sleep in the bed
        if (!player.isSleeping){
            return;
        }

        // Enforce night time
        if (world.getTimeOfDay() < 12000){
            return;
        }

        world.sendMessage(`§6${player.name}is sleeping. The next day will begin.`);

        SingleBedManager.HasQueued = true;

        system.runTimeout(() => {
            // Check if the player is still sleeping in the bed before finalizing the night-time advance
            if (player.isValid() && player.isSleeping){
                world.setTimeOfDay(24e3 - 1);
                SingleBedManager.HasQueued = false;
            }
        }, TicksPerSecond * 1);
    }
}