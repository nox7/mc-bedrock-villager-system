# Village System Behavior and Resource Pack
A Minecraft Bedrock Behavior Pack and Texture Pack that adds villagers with roles. Create living, breathing villages; towns; or kingdoms with villagers that have schedules and jobs and interact with each other. For example, general townspeople may need to visit the Merchant villagers for supplies during the day; or random villagers (when evening comes upon them) will want to visit the tavern before they go to bed for the evening.

An experimental "unloaded chunk manager" works to manage these happenings even when you are no longer simulating chunks.

All code uses Microsoft's official Bedrock JavaScript API - no custom modding required.

## Running
With NodeJS installed into your environment, navigate to this project's root. Install the dependencies
```
npm install
```

Then, to compile the TS, behavior pack, and resource pack then publish to your Bedrock installation - run `gulp` in the CLI
```gulp
gulp
```

The Behavior Pack and Resource Pack will now be available to use in Minecraft Bedrock.

## Additions

### Systems
All long-running systems or systems with heavy processing are hooked into the main thread of MC and run quickly (they avoid hanging). If they must process large amounts of data, blocks, etc. then they are set up to allow the main MC thread to continue and will perform their work in partial chunks until completion.

- NPC state machine. Mass manages all NPCs into a unified state machine asynchronously running with the main MC thread 
- Arbitrary block-finder asynchronously running with the main MC thread
- A* pathfinding algorithm asynchronously running with the main MC thread

### NPCs 
- Woodcutter: Craft a Woodcutter Manager block and place it where you would like a woodcutter to spawn. Make sure to have a chest adjacent. This woodcutter will then roam and cut trees and replant them - adding the obtained logs to the chest adjacent to his Woodcutter Manager block.

### Recipes
- Leather can be obtained by smelting Rotten Flesh in a furnace
- Iron Drill can be made with 3 Oak Logs on the bottom row, 3 Iron Ingots on the middle row, and 3 Stone (not Cobblestone) on the top row

### Items
- Iron Drill has been added. It specializes in mining basic stones (not ores, dirt, trees, or anything else) in high speeds compared to pickaxes.
