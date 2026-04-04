import {
  createTimeline,
  engine,
  type OptimizedBuffer,
  parseColor,
  Renderable,
  type RenderableOptions,
  type RenderContext,
  type RGBA,
} from "@opentui/core";

const TRANSPARENT = parseColor("#00000000");

// -- Petal particle palette --------------------------------------------------

const PETAL_CHARS: string[] = [".", "*", ",", "'", "`", ";", "~"];
const PETAL_COLORS: RGBA[] = [
  parseColor("#f7768e"),
  parseColor("#ff9e64"),
  parseColor("#bb9af7"),
  parseColor("#c0caf5"),
  parseColor("#f7768e"),
  parseColor("#e0af68"),
];

// -- Tree color palette (Tokyo Night tones) ----------------------------------

const CANOPY_BRIGHT = parseColor("#f7768e"); // pink
const CANOPY_MID    = parseColor("#bb9af7"); // lavender
const CANOPY_DIM    = parseColor("#7aa2f7"); // blue
const CANOPY_GLOW   = parseColor("#ff9e64"); // peach highlight
const TRUNK_COLOR   = parseColor("#565f89"); // muted
const TRUNK_LIGHT   = parseColor("#737aa2"); // lighter trunk
const GROUND_COLOR  = parseColor("#3b4261"); // dim ground

// -- Gilo97 tree art ---------------------------------------------------------

const TREE_ART = `\
                                  .
                      .         ;
     .              .              ;%     ;;
       ,           ,                :;%  %;
        :         ;                   :;%;'     .,
,.        %;     %;            ;        %;'    ,;
  ;       ;%;  %%;        ,     %;    ;%;    ,%'
   %;       %;%;      ,  ;       %;  ;%;   ,%;'
    ;%;      %;        ;%;        % ;%;  ,%;'
     \`%;.     ;%;     %;'         \`;%%;.%;'
      \`:;%.    ;%%. %@;        %; ;@%;%'
         \`:%;.  :;bd%;          %;@%;'
           \`@%:.  :;%.         ;@@%;'
             \`@%.  \`;@%.      ;@@%;
               \`@%%. \`@%%    ;@@%;
                 ;@%. :@%%  %@@%;
                   %@bd%%%bd%%:;
                     #@%%%%%:;;
                     %@@%%%::;
                     %@@@%(o);  . '
                     %@@@o%;:(.,'
                 \`.. %@@@o%::;
                    \`)@@@o%::;
                     %@@(o)::;
                    .%@@@@%::;
                    ;%@@@@%::;.
                   ;%@@@@%%:;;;.
               ...;%@@@@@%%:;;;;,..`;

const TREE_LINES = TREE_ART.split("\n");
const TREE_WIDTH = Math.max(...TREE_LINES.map((l) => l.length));
const TREE_HEIGHT = TREE_LINES.length;

// Canopy is roughly top 60%, trunk is bottom 40%
const CANOPY_CUTOFF = Math.floor(TREE_HEIGHT * 0.6);

const CANOPY_CHARS = new Set(["%", ";", ":", "'", ",", ".", "`", "@", "#", "b", "d"]);
const TRUNK_CHARS = new Set(["|", "(", ")", "o"]);
const GROUND_CHARS = new Set(["~", "_", "-"]);

// -- Petal particle -----------------------------------------------------------

interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  color: RGBA;
  phase: number;
  age: number;
  maxAge: number;
}

// -- Animated state (driven by timelines) ------------------------------------

interface AnimState {
  growProgress: number;    // 0..1 how much of the tree is revealed
  shimmerPhase: number;    // 0..1 cycling shimmer for canopy glow
  swayOffset: number;      // -2..2 horizontal canopy sway
  petalOpacity: number;    // 0..1 fade-in for petals
}

// -- Renderable ---------------------------------------------------------------

export interface SakuraOptions extends RenderableOptions<SakuraRenderable> {
  maxPetals?: number;
  spawnRate?: number;
}

export class SakuraRenderable extends Renderable {
  private petals: Petal[] = [];
  private elapsed = 0;
  private spawnAccumulator = 0;
  private maxPetals: number;
  private spawnRate: number;
  private animState: AnimState = {
    growProgress: 0,
    shimmerPhase: 0,
    swayOffset: 0,
    petalOpacity: 0,
  };
  private animStarted = false;

  constructor(ctx: RenderContext, options: SakuraOptions = {}) {
    super(ctx, { ...options, live: true, buffered: true });
    this.maxPetals = options.maxPetals ?? 30;
    this.spawnRate = options.spawnRate ?? 1.2;
  }

  private startAnimations(): void {
    if (this.animStarted) return;
    this.animStarted = true;

    // Attach engine to renderer
    engine.attach(this._ctx as unknown as Parameters<typeof engine.attach>[0]);

    // Phase 1: Tree grows from bottom to top over 3s
    const growTimeline = createTimeline({ duration: 3000 });
    growTimeline.add(this.animState, {
      duration: 3000,
      ease: "outQuad",
      growProgress: 1,
    });
    engine.register(growTimeline);

    // Phase 2: Petals fade in after tree is mostly grown (starts at 2s)
    const petalTimeline = createTimeline({ duration: 1500 });
    petalTimeline.add(this.animState, {
      duration: 1500,
      ease: "outQuad",
      petalOpacity: 1,
    });
    // Delay start by 2000ms
    setTimeout(() => {
      engine.register(petalTimeline);
    }, 2000);

    // Continuous: Canopy shimmer (loops forever)
    const shimmerTimeline = createTimeline({ duration: 4000, loop: true });
    shimmerTimeline.add(this.animState, {
      duration: 4000,
      ease: "inOutSine",
      shimmerPhase: 1,
      loop: true,
      alternate: true,
    });
    engine.register(shimmerTimeline);

    // Continuous: Gentle sway (loops forever)
    const swayTimeline = createTimeline({ duration: 6000, loop: true });
    swayTimeline.add(this.animState, {
      duration: 6000,
      ease: "inOutSine",
      swayOffset: 1.5,
      loop: true,
      alternate: true,
    });
    engine.register(swayTimeline);
  }

  private spawnPetal(): void {
    const w = this._widthValue;
    if (w <= 0) return;

    const centerX = w / 2;
    const spread = w * 0.4;
    const x = centerX + (Math.random() - 0.5) * spread;

    this.petals.push({
      x,
      y: -1 - Math.random() * 3,
      vx: (Math.random() - 0.5) * 2.5,
      vy: 0.5 + Math.random() * 1.2,
      char: PETAL_CHARS[Math.floor(Math.random() * PETAL_CHARS.length)]!,
      color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)]!,
      phase: Math.random() * Math.PI * 2,
      age: 0,
      maxAge: 6 + Math.random() * 12,
    });
  }

  protected override onUpdate(deltaTime: number): void {
    this.startAnimations();

    const dt = deltaTime / 1000;
    this.elapsed += dt;
    const h = this._heightValue;
    const w = this._widthValue;
    if (h <= 0 || w <= 0) return;

    // Only spawn petals once they've faded in
    if (this.animState.petalOpacity > 0.1) {
      this.spawnAccumulator += dt * this.spawnRate * this.animState.petalOpacity;
      while (this.spawnAccumulator >= 1 && this.petals.length < this.maxPetals) {
        this.spawnPetal();
        this.spawnAccumulator -= 1;
      }
      if (this.spawnAccumulator >= 1) this.spawnAccumulator = 0;
    }

    for (const p of this.petals) {
      p.age += dt;
      p.x += p.vx * dt + Math.sin(this.elapsed * 1.2 + p.phase) * 1.5 * dt;
      p.y += p.vy * dt;
    }

    this.petals = this.petals.filter(
      (p) => p.age < p.maxAge && p.y < h && p.x >= -2 && p.x < w + 2,
    );

    process.nextTick(() => this.requestRender());
  }

  protected override renderSelf(_buffer: OptimizedBuffer, _deltaTime: number): void {
    if (!this.frameBuffer) return;
    const w = this._widthValue;
    const h = this._heightValue;

    this.frameBuffer.clear(TRANSPARENT);

    const grow = this.animState.growProgress;
    const shimmer = this.animState.shimmerPhase;
    const sway = this.animState.swayOffset;

    // Center the tree
    const baseOffsetX = Math.max(0, Math.floor((w - TREE_WIDTH) / 2));
    const offsetY = Math.max(0, Math.floor((h - TREE_HEIGHT) / 2));

    // Reveal lines from bottom to top based on growProgress
    const totalLines = TREE_LINES.length;
    const revealedFromBottom = Math.ceil(grow * totalLines);
    const firstVisibleLine = totalLines - revealedFromBottom;

    for (let i = firstVisibleLine; i < totalLines; i++) {
      const line = TREE_LINES[i]!;
      const y = offsetY + i;
      if (y < 0 || y >= h) continue;

      // Apply sway to canopy lines (stronger at top, none at bottom)
      const canopyRatio = i < CANOPY_CUTOFF ? 1 - i / CANOPY_CUTOFF : 0;
      const lineSway = Math.round(sway * canopyRatio);
      const offsetX = baseOffsetX + lineSway;

      for (let j = 0; j < line.length; j++) {
        const x = offsetX + j;
        if (x < 0 || x >= w) continue;
        const ch = line[j]!;
        if (ch === " ") continue;

        const color = this.charColor(ch, j, i, shimmer);
        this.frameBuffer.setCell(x, y, ch, color, TRANSPARENT, 0);
      }
    }

    // Draw falling petals
    if (this.animState.petalOpacity > 0.1) {
      for (const p of this.petals) {
        const px = Math.floor(p.x);
        const py = Math.floor(p.y);
        if (px >= 0 && px < w && py >= 0 && py < h) {
          const life = 1 - p.age / p.maxAge;
          if (life > 0.25) {
            this.frameBuffer.setCell(px, py, p.char, p.color, TRANSPARENT, 0);
          }
        }
      }
    }
  }

  private charColor(ch: string, x: number, y: number, shimmer: number): RGBA {
    if (GROUND_CHARS.has(ch)) {
      return GROUND_COLOR;
    }
    if (TRUNK_CHARS.has(ch)) {
      return y % 2 === 0 ? TRUNK_COLOR : TRUNK_LIGHT;
    }
    if (CANOPY_CHARS.has(ch)) {
      // Shimmer: some chars glow bright peach on a cycle
      const shimmerHit = Math.sin((x * 0.7 + y * 1.3) + shimmer * Math.PI * 2) > 0.6;
      if (shimmerHit) return CANOPY_GLOW;

      // Gradient: top = bright pink, middle = lavender, bottom = blue
      const ratio = y / TREE_HEIGHT;
      if (ratio < 0.3) return CANOPY_BRIGHT;
      if (ratio < 0.5) return (x + y) % 3 === 0 ? CANOPY_BRIGHT : CANOPY_MID;
      return (x + y) % 2 === 0 ? CANOPY_MID : CANOPY_DIM;
    }
    return TRUNK_COLOR;
  }

  protected override onResize(width: number, height: number): void {
    this.handleFrameBufferResize(width, height);
  }
}
