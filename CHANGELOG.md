# Changelog

## 0.3.0

A big update: realistic graphics, multiplayer, and a lot more to do.

### Graphics
- Smooth, rounded terrain and foliage (surface-nets meshing) with baked ambient occlusion and grain; round tree trunks; soft clouds
- The dragon and the animals are rebuilt from tapered, sculpted parts (jaw, teeth, horns, claws, curved wings); optional **four wings**
- "Stone Bricks" block for cubic building; Ice and Obsidian blocks

### Multiplayer
- Node relay server (`server/`): everyone in a room shares builds, dragons and fire; default room `main`, private rooms with `?world=name`
- Radar (bottom-left) with direction and distance to other players, **J** flies to the nearest one
- Batched, rate-limited block edits; deploy scripts for the service and nginx (`deploy/mp-setup.sh`)

### World
- **Castles** (3) with knights, archers, a Castle Lord, and a **Dread Drake** boss that guards each one
- Hidden **treasure chests** in every keep (50 meat each) and a **guard disguise** (H) to sneak in
- The **Giant Maze** (Golden Apple: 10 minutes of invincibility) and the **Volcano Maze** (Master Apple: the Annihilate attack), full of turrets, flame jets, spike gates and lava
- **World map** (M) showing every landmark, you and other players

### Combat
- **Ice breath** (right-click / G), **lightning** (Z), **explosive fireball** (X), **roar** (B), **Annihilate** (K, 2 minute cooldown)
- 40 health, boss health bar, easier Dread Drake

### Performance and fixes
- Explosions no longer freeze the game: edited chunks are re-meshed once each, spread over frames
- Fixed black screens caused by zero-length terrain normals and a mis-positioned tail tip

## 0.2.0
Building, dragon customization, health and hunger, animals and food, saving, in-game feedback.
