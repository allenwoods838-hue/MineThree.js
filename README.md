# MineThree.js

A tiny, expandable Minecraft-style voxel sandbox built with Three.js and Vite.

## Run it

```bash
npm install
npm run dev
```

Then open the local Vite URL. The dev server is configured to work in a hosted preview as well as locally.

## Controls

- Click the world to enter first-person mode.
- `W A S D` to move, mouse to look, `Space` to jump, and `Shift` to sprint.
- Left mouse button mines the targeted block.
- Right mouse button places the selected block.
- Number keys `1–7` or the hotbar select a block.
- `Esc` pauses the world; click the help button for a controls card.

## Starter architecture

- `src/main.js` contains deterministic terrain generation, the block registry, visible-block meshing, player collision, and interaction systems.
- `src/style.css` contains the HUD and responsive presentation.
- Blocks are stored in a `Map`, so inventory, persistence, chunking, textures, and multiplayer can be added without replacing the interaction API.
