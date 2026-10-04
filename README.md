# Dragon Craft

A voxel-style 3D game where you play as a dragon. Built with my son Oden.
Fly, explore, build, roast animals for food, and customize your dragon.

## Play

No install and no build step. It's a static site:

```sh
git pull
python3 -m http.server 8000
```

Open http://localhost:8000 in Chrome, wait for the loading bar, then click **Click to fly!**.

Handy URL options: `?q=low` (faster on slow computers), `?rd=5` (view distance in chunks),
`?debug` (FPS counter), `?world=oden` (a separate saved world).

## Multiplayer

Everyone who opens the same address is in the same world, with the same builds, and sees each other's dragons and fire.
Use `?world=name` to get a private room to share with a friend (e.g. `https://dragon.gordhamer.com/?world=oden-and-sam`).
Press **J** to fly to the nearest other player, and watch the radar (bottom-left). `?solo` plays alone. Animals are not shared yet. The server is `server/` (Node, `npm install` then `node server.js`);
see [deploy/README.md](deploy/README.md).

## Controls

| Key | Action |
| --- | --- |
| W A S D, mouse | fly / walk, steer |
| Space / C / Shift | rise (and take off) / descend / boost |
| 1 | your element's breath: hold left click (or F) |
| M | world map: the maze, castles, village, volcano and your friends (north is up) |
| Z / X / B | your element's other attacks, unlocked as you grow (Z kid, X teenager, B adult) |
| K | Annihilate (needs the Master Apple), H | guard disguise |
| 2-7 | blocks (Stone Bricks stay cubic for building; dirt, stone, sand and grass are sculpted smooth): left-click breaks, right-click places, middle-click copies |
| E | choose which blocks are in your hotbar |
| 8 / 9 | apple / fire-roasted meat: right-click or R to eat |
| Wheel | change hotbar slot |
| V, - and = | first person, camera distance |
| T, P, F3 | skip time, pause time, debug |
| Esc | menu: dragon customizer, feedback, controls |

## Look

Terrain and leaves are drawn as smooth rounded surfaces (`src/smooth.js`), trunks as round logs, and the dragon
and animals from rounded parts. Collisions and building still use blocks underneath.

## Indestructible castles

The castles, both mazes and the Grand Citadel are magic: you can't break them, explode them or build inside them (the game and the server both refuse). Everything else in the world can still be changed.

## Growing up

You start as a **baby dragon** and pick one of four **elements**: 🔥 Fire, ❄ Ice, ⚡ Lightning or ⛰ Earth.
Each element has a breath (hold left click or F) and three more attacks that you get as you grow:

| | Breath | Kid (Z) | Teenager (X) | Adult (B) |
| --- | --- | --- | --- | --- |
| Fire | Fire breath | Fireball | Inferno ring | Meteor storm |
| Ice | Ice breath (freezes, turns water to ice) | Ice shards | Blizzard | Absolute Zero |
| Lightning | Spark breath | Chain lightning | Thunder clap | Storm call |
| Earth | Rock spit | Boulder | Earthquake | Stone skin (6 s of invincibility) |

You grow by opening the **50 chests** hidden at the dead ends of the **Grand Citadel** (a huge castle at about x -252, z -276;
the map shows it): **10** chests for a kid, **25** for a teenager and **50** for an adult. Each growth makes you bigger, gives you more
health and more power. You can change your element until you open your first chest. Progress is saved in your browser.

## Your dragon

Esc, then the dragon tab: colors, horns, tail, wings (and **two or four wings**), spikes, pattern and snout.

## The castles

Three castles stand far from spawn: about x 136 z 72 (east), x -24 z 324 (south) and x 324 z -108 (far east). The radar shows the nearest one. Look for the walls and the gold flag.
Each has a **Dread Drake**, a big enemy dragon that perches on the keep, circles you, hurls fireballs, dives to bite, and breathes fire or frost when it is badly hurt. Fire does a little less damage to its scales; lightning, fireballs and the roar go straight through, and ice slows it. If you flee it heals.
Knights chase you on the ground, archers shoot arrows from the walls and towers, and the Castle Lord guards the keep.
Fire burns them; ice freezes them in place (frozen guards take double fire damage). Defeat the Castle Lord for loot.
**Guard disguise (H):** for 5 minutes you look like a castle knight and the guards and Drake leave you alone. Attacking (breath, lightning, fireball, roar) gives you away, and you wait 90 seconds before you can disguise again.
Sneak into the keep and find the **hidden treasure chests** (4 per castle, two downstairs and two upstairs, glowing gold-brown). Fly up to one and it opens for 50 fire-roasted meat; it refills 10 minutes later.

Ice also turns water into ice blocks and cools lava into rock. The guards come back a few minutes after you clear the castle.

## The Labyrinth

A huge roofed maze stands at about x -210, z 170 (the radar marks it as "Maze"). The entrance is in the south wall.
Winding tunnels (the way to the middle is hundreds of blocks long) are full of traps: **arrow turrets** in the walls,
**flame jets** (the wooden floor tile glows before it bursts) and **spike gates** that rise and fall (rough cobble tiles).
At the far end a **Golden Apple** waits on a gold pedestal: eat it to be **invincible for 10 minutes**. It comes back 20 minutes later.

## The Volcano Maze

East of the volcano (about x 266, z -48; the map shows it) is a second, harder maze with black glass walls.
**Fire turrets** shoot fireballs, **flame jets** and **spike gates** guard the tunnels, and some floors are **pools of lava**
(walking through them burns; fly over them). At the far end, on a purple crystal pedestal, is the **Master Apple**.
Eat it once and you keep it forever: press **K** to **Annihilate** every enemy, guard, Drake and animal within 70 blocks.
It needs a 2 minute cooldown between uses.

## Survival, gently

You have 10 hearts (40 health, so each hit costs a fraction of a heart).

- Hearts and hunger. Hunger drains faster when you boost or breathe fire.
- Starving never kills you, and dragons don't take fall damage. Lava hurts, and you respawn at the village.
- Breathe fire on pigs, cows, sheep and chickens to cook them, then fly over the meat to pick it up.
- Break leaves for a chance at apples.

## Saving

Your builds, position, food and dragon are saved automatically in the browser (builds in IndexedDB).

## Feedback

Press **Esc → Feedback**, write a note, and "Send on GitHub" opens a pre-filled issue
(it includes your position, time and browser to help find bugs).

## Deploying

See [deploy/README.md](deploy/README.md).
