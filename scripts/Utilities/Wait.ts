import { system } from "@minecraft/server";

/**
 * Waits a set number of in game ticks
 * @param {number} ticks 
 * @returns 
 */
export default async function(ticks: number){
    return new Promise<void>(resolve => {
        system.runTimeout(() => {
            resolve();
        }, ticks)
    });
}