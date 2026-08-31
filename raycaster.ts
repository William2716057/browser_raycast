

interface Vec2 {
  x: number;
  y: number;
}

// 0 = empty floor, >0 = wall (values select wall colour)
const MAP: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,2,2,2,0,0,0,0,0,3,3,3,0,0,1],
  [1,0,2,0,0,0,0,0,0,0,0,0,3,0,0,1],
  [1,0,2,0,0,4,4,4,4,4,0,0,3,0,0,1],
  [1,0,0,0,0,4,0,0,0,4,0,0,0,0,0,1],
  [1,0,0,0,0,4,0,0,0,4,0,0,0,0,0,1],
  [1,1,1,0,0,4,4,0,4,4,0,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,5,5,0,0,1,1,1,0,0,5,5,0,0,1],
  [1,0,5,5,0,0,1,0,1,0,0,5,5,0,0,1],
  [1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const MAP_W = MAP[0].length;
const MAP_H = MAP.length;
//colours
const WALL_COLORS: Record<number, string> = { //add more or change to textures
  1: "#8a4b3c",
  2: "#3c6e8a",
  3: "#4b8a3c",
  4: "#8a7a3c",
  5: "#6e3c8a",
};

function isWall(x: number, y: number): boolean {
  const mx = Math.floor(x);
  const my = Math.floor(y);
  if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return true;
  return MAP[my][mx] > 0;
}
//player
class Player {
  pos: Vec2 = { x: 8, y: 12.5 };
  angle: number = -Math.PI / 2; // facing "up" initially
  moveSpeed = 3.2; // tiles per second
  turnSpeed = 2.2; // radians per second
  radius = 0.2;

  tryMove(dx: number, dy: number): void {
    if (!isWall(this.pos.x + dx + Math.sign(dx) * this.radius, this.pos.y)) {
      this.pos.x += dx;
    }
    if (!isWall(this.pos.x, this.pos.y + dy + Math.sign(dy) * this.radius)) {
      this.pos.y += dy;
    }
  }
}

interface RayHit {
  distance: number;
  wallType: number;
  side: 0 | 1; // 0 = vertical (x-side) hit, 1 = horizontal (y-side) hit
  wallX: number; // fractional position along the hit wall face, for texturing
}

//raycast against the grid.
function castRay(origin: Vec2, angle: number): RayHit {
  const rayDirX = Math.cos(angle);
  const rayDirY = Math.sin(angle);

  let mapX = Math.floor(origin.x);
  let mapY = Math.floor(origin.y);

  const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
  const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

  let stepX: number, stepY: number;
  let sideDistX: number, sideDistY: number;

  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (origin.x - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - origin.x) * deltaDistX;
  }
  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (origin.y - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - origin.y) * deltaDistY;
  }

  let side: 0 | 1 = 0;
  let wallType = 0;
  let hit = false;
  let guard = 0;

  while (!hit && guard < 256) {
    guard++;
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }
    if (mapX < 0 || mapY < 0 || mapX >= MAP_W || mapY >= MAP_H) {
      wallType = 1;
      hit = true;
      break;
    }
    if (MAP[mapY][mapX] > 0) {
      wallType = MAP[mapY][mapX];
      hit = true;
    }
  }

  // Perpendicular distance to fish-eye distortion.
  let perpDist: number;
  let wallX: number;
  if (side === 0) {
    perpDist = (mapX - origin.x + (1 - stepX) / 2) / (rayDirX || 1e-9);
    wallX = origin.y + perpDist * rayDirY;
  } else {
    perpDist = (mapY - origin.y + (1 - stepY) / 2) / (rayDirY || 1e-9);
    wallX = origin.x + perpDist * rayDirX;
  }
  wallX -= Math.floor(wallX);

  return { distance: Math.max(perpDist, 0.0001), wallType, side, wallX };
}

class RaycastEngine {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private fov = Math.PI / 3; // 60 degrees
  private numRays: number;
  private zBuffer: number[];

  player = new Player();
  private keys: Set<string> = new Set();
  private mouseDX = 0;
  private pointerLocked = false;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    this.width = canvas.width;
    this.height = canvas.height;
    this.numRays = this.width; // one ray per column
    this.zBuffer = new Array(this.numRays).fill(Infinity);

    window.addEventListener("keydown", (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));

    canvas.addEventListener("click", () => canvas.requestPointerLock());
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener("mousemove", (e) => {
      if (this.pointerLocked) this.mouseDX += e.movementX;
    });
  }

  private handleInput(dt: number): void {
    const p = this.player;
    let dx = 0, dy = 0;

    if (this.keys.has("w") || this.keys.has("arrowup")) {
      dx += Math.cos(p.angle) * p.moveSpeed * dt;
      dy += Math.sin(p.angle) * p.moveSpeed * dt;
    }
    if (this.keys.has("s") || this.keys.has("arrowdown")) {
      dx -= Math.cos(p.angle) * p.moveSpeed * dt;
      dy -= Math.sin(p.angle) * p.moveSpeed * dt;
    }
    if (this.keys.has("a")) {
      dx += Math.cos(p.angle - Math.PI / 2) * p.moveSpeed * dt;
      dy += Math.sin(p.angle - Math.PI / 2) * p.moveSpeed * dt;
    }
    if (this.keys.has("d")) {
      dx += Math.cos(p.angle + Math.PI / 2) * p.moveSpeed * dt;
      dy += Math.sin(p.angle + Math.PI / 2) * p.moveSpeed * dt;
    }
    p.tryMove(dx, dy);

    if (this.keys.has("arrowleft")) p.angle -= p.turnSpeed * dt;
    if (this.keys.has("arrowright")) p.angle += p.turnSpeed * dt;

    if (this.mouseDX !== 0) {
      p.angle += this.mouseDX * 0.0025;
      this.mouseDX = 0;
    }
  }

  private renderFrame(): void {
    const { ctx, width, height, player } = this;

    // Ceiling and floor
    ctx.fillStyle = "#1b1f2a"; //add texture
    ctx.fillRect(0, 0, width, height / 2);
    ctx.fillStyle = "#2a2620";
    ctx.fillRect(0, height / 2, width, height / 2);

    for (let col = 0; col < this.numRays; col++) {
      const cameraX = (2 * col) / this.numRays - 1; // -1..1
      const rayAngle = player.angle + Math.atan(cameraX * Math.tan(this.fov / 2));
      const hit = castRay(player.pos, rayAngle);

      // Correct fish-eye by using perpendicular distance already computed in castRay
      const lineHeight = Math.min(height * 3, height / hit.distance);
      const drawStart = Math.max(0, (height - lineHeight) / 2);
      const drawEnd = Math.min(height, (height + lineHeight) / 2);

      const base = WALL_COLORS[hit.wallType] ?? "#888888";
      const shade = this.shadeColor(base, hit.distance, hit.side);

      ctx.fillStyle = shade;
      ctx.fillRect(col, drawStart, 1, drawEnd - drawStart);

      this.zBuffer[col] = hit.distance;
    }

    this.renderMinimap();
    this.renderCrosshair();
  }

  private shadeColor(hex: string, distance: number, side: 0 | 1): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const fog = Math.max(0.15, Math.min(1, 1 - distance / 14));
    const sideDarken = side === 1 ? 0.75 : 1;
    const f = fog * sideDarken;

    return `rgb(${Math.floor(r * f)}, ${Math.floor(g * f)}, ${Math.floor(b * f)})`;
  }

  private renderMinimap(): void {
    const { ctx, player } = this;
    const scale = 6;
    const ox = 10, oy = 10;

    ctx.globalAlpha = 0.85;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        ctx.fillStyle = MAP[y][x] > 0 ? (WALL_COLORS[MAP[y][x]] ?? "#888") : "#111";
        ctx.fillRect(ox + x * scale, oy + y * scale, scale - 1, scale - 1);
      }
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.arc(ox + player.pos.x * scale, oy + player.pos.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffe066";
    ctx.beginPath();
    ctx.moveTo(ox + player.pos.x * scale, oy + player.pos.y * scale);
    ctx.lineTo(
      ox + (player.pos.x + Math.cos(player.angle) * 1.5) * scale,
      oy + (player.pos.y + Math.sin(player.angle) * 1.5) * scale
    );
    ctx.stroke();
  }
  //edit here
  private renderCrosshair(): void {
    const { ctx, width, height } = this;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.moveTo(width / 2 - 6, height / 2);
    ctx.lineTo(width / 2 + 6, height / 2);
    ctx.moveTo(width / 2, height / 2 - 6);
    ctx.lineTo(width / 2, height / 2 + 6);
    ctx.stroke();
  }

  private lastTime = 0;
  private loop = (time: number): void => {
    const dt = Math.min(0.05, (time - this.lastTime) / 1000 || 0);
    this.lastTime = time;

    this.handleInput(dt);
    this.renderFrame();

    requestAnimationFrame(this.loop);
  };

  start(): void {
    requestAnimationFrame(this.loop);
  }
}

const canvas = document.getElementById("view") as HTMLCanvasElement;
const engine = new RaycastEngine(canvas);
engine.start();
