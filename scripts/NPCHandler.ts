import NPC from "./NPCs/NPC";

export default class NPCHandler{
    private NPCs: NPC[] = [];

    public constructor(){

    }

    /**
     * Registers an NPC into the handler
     * @param npc 
     */
    public RegisterNPC(npc: NPC){
        this.NPCs.push(npc);
    }

    /**
     * Runs every game tick
     */
    public async OnGameTick(): Promise<void>{
        for (const npc of this.NPCs){
            npc.OnGameTick();
        }
    }
}