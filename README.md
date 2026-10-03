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

## Controls

| Key | Action |
| --- | --- |
| W A S D, mouse | fly / walk, steer |
| Space / C / Shift | rise (and take off) / descend / boost |
| 1 | fire breath (hold click, or hold F) |
| 2-7 | blocks: left-click breaks, right-click places, middle-click copies |
| E | choose which blocks are in your hotbar |
| 8 / 9 | apple / fire-roasted meat: right-click or R to eat |
| Wheel | change hotbar slot |
| V, - and = | first person, camera distance |
| T, P, F3 | skip time, pause time, debug |
| Esc | menu: dragon customizer, feedback, controls |

## Survival, gently

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
