# Village System Behavior and Resource Pack
A Minecraft Bedrock Behavior Pack and Texture Pack that adds villagers with roles. Create living, breathing villages; towns; or kingdoms with villagers that have schedules and jobs and interact with each other. For example, general townspeople may need to visit the Merchant villagers for supplies during the day; or random villagers (when evening comes upon them) will want to visit the tavern before they go to bed for the evening.

An experimental "unloaded chunk manager" works to manage these happenings even when you are no longer simulating chunks.

All code uses Microsoft's official Bedrock JavaScript API - no custom modding required.

## Running
With NodeJS installed into your environment, navigate to this project's root. Install the dependencies
```bash
npm install
```

Then, to compile the TS, behavior pack, and resource pack then publish to your Bedrock installation - run `gulp` in the CLI
```bash
gulp
```

The Behavior Pack and Resource Pack will now be available to use in Minecraft Bedrock.

## Additions

### Systems
All long-running systems or systems with heavy processing are hooked into the main thread of MC and run quickly (they avoid hanging). If they must process large amounts of data, blocks, etc. then they are set up to allow the main MC thread to continue and will perform their work in partial chunks until completion.

- NPC state machine. Mass manages all NPCs into a unified state machine asynchronously running with the main MC thread 
- Arbitrary block-finder asynchronously running with the main MC thread
- A* pathfinding algorithm asynchronously running with the main MC thread
- Implements one-person-sleeping for multiplayer

### NPCs 
- Woodcutter: Craft a Woodcutter Manager block and place it where you would like a woodcutter to spawn. Make sure to have a chest adjacent. This woodcutter will then roam and cut trees and replant them - adding the obtained logs to the chest adjacent to his Woodcutter Manager block.
- Quarry Miner: Searches for a nearby Quarry Node Center block (about 4 block distance) and will mine that block repeatedly to get 64 paydirt. Once it has 64, it will stop mining until a player right-clicks and collects the paydirt. Paydirt is then taken to the Smeltery NPC for cleaning and/or smelting.

### Recipes
- Leather can be obtained by smelting Rotten Flesh in a furnace
- Iron Drill can be made with 3 Oak Logs on the bottom row, 3 Iron Ingots on the middle row, and 3 Stone (not Cobblestone) on the top row

### Items
- Iron Drill has been added. It specializes in mining basic stones (not ores, dirt, trees, or anything else) in high speeds compared to pickaxes.
- Grapes
- Tankards
- Paydirt
- Quarry Miner Spawn

### Blocks
The following blocks with recipes (find them in the in-game recipe book in the crafting menu) have been added.
- Oven (Not furnace functional yet until Mojang let's us have custom furnaces)
- Light stone countertops (RTX supported)
- Dark stone countertops (RTX supported)
- White wood cabinets
- Dark wood cabinets
- Stack of gold bars (RTX supported)
- Hanging pot rack
- Cup holders (filled and empty)
- Auto chest sorter (can sort adjacent chests and alphabetize their contents)
- Quarry Node Center
- Grapevines
- Wine Barrel
- Empty Wine Barrel

## Credits
Some block artwork produced by: Kekie6, Marc-IceBlade, Shrimp, Facu, Frogipher, SunsetSoup, Valilla, Brother Earth, Joosh, ArtistMonster, Zilver