import {
  W, H, TAU, PLATFORM, SHAFT_X, SHAFT_TOP, SHAFT_BOTTOM,
  FARE_GATE_X, COLUMN_X, ENTRANCES, PALETTES, formatEta as formatEtaAt,
} from './config.js';

/** Canvas-only renderer. It reads simulation state but does not mutate it. */
export function createRenderer({ canvas, engine }) {
  const sim = engine.sim;
  const upcoming = (filter, limit) => engine.upcoming(filter, limit);
  const destinationOf = (service) => engine.destinationOf(service);
  const formatEta = (row) => formatEtaAt(row, sim.time);
  let C = PALETTES.light;
  let reducedMotion = false;
  const shadeCache = new Map();
  function shade(hex, amount) {
    const key = hex + amount;
    if (shadeCache.has(key)) return shadeCache.get(key);
    const value = parseInt(hex.slice(1), 16);
    const target = amount < 0 ? 0 : 255;
    const ratio = Math.abs(amount);
    const mix = (channel) => Math.round(channel + (target - channel) * ratio);
    const output = `rgb(${mix((value >> 16) & 255)}, ${mix((value >> 8) & 255)}, ${mix(value & 255)})`;
    shadeCache.set(key, output);
    return output;
  }

  const ctx = canvas.getContext('2d');
  const view = { dpr: 1, scale: 1, ox: 0, oy: 0 };

  const FONT = 'Archivo, system-ui, -apple-system, "Segoe UI", sans-serif';

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    view.dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * view.dpr));
    canvas.height = Math.max(1, Math.round(rect.height * view.dpr));
    view.scale = Math.min(rect.width / W, rect.height / H);
    view.ox = (rect.width - W * view.scale) / 2;
    view.oy = (rect.height - H * view.scale) / 2;
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawText(str, x, y, { size = 12, weight = 500, color = C.ink, align = 'left', baseline = 'alphabetic' }) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(str, x, y);
  }

  function drawWall(top, bottom) {
    ctx.fillStyle = C.wall;
    ctx.fillRect(0, top, W, bottom - top);
    ctx.strokeStyle = C.wallRule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 48) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    ctx.stroke();
  }

  function drawCeilingLights(y) {
    for (let x = 60; x < W; x += 180) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 115);
      glow.addColorStop(0, C.lampGlow);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 115, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.lamp;
      roundRect(x - 26, y - 3, 52, 5, 2);
      ctx.fill();
    }
  }

  function drawTrack(y0, y1) {
    ctx.fillStyle = C.trackBed;
    ctx.fillRect(0, y0, W, y1 - y0);
    ctx.strokeStyle = C.track;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y1 - 9);
    ctx.lineTo(W, y1 - 9);
    ctx.stroke();
    ctx.strokeStyle = C.tie;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 22) {
      ctx.moveTo(x, y1 - 17);
      ctx.lineTo(x, y1 - 2);
    }
    ctx.stroke();
  }

  function drawIsland(top, bottom) {
    ctx.fillStyle = C.island;
    ctx.fillRect(0, top, W, bottom - top);
    ctx.fillStyle = C.signal;
    ctx.fillRect(0, top, W, 5);
    ctx.fillRect(0, bottom - 5, W, 5);
  }

  function drawBeams(y) {
    ctx.fillStyle = C.columnBase;
    for (const x of COLUMN_X) ctx.fillRect(x, y, 24, 16);
  }

  function drawEscalator(x, y0, y1, w) {
    ctx.strokeStyle = C.escalator;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x + w, y1);
    ctx.stroke();
    ctx.strokeStyle = C.escalatorStep;
    ctx.beginPath();
    for (let i = 0; i < 13; i++) {
      const p = i / 12;
      const xx = x + p * w;
      const yy = y0 + p * (y1 - y0);
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + 6, yy + 4);
    }
    ctx.stroke();
    ctx.fillStyle = C.escalatorPlate;
    ctx.fillRect(x - 6, y0 - 3, w + 12, 6);
    ctx.fillRect(x - 6, y1 - 3, w + 12, 6);
  }

  function drawLevelLabel(str, y) {
    drawText(str, 24, y, { size: 18, weight: 700, color: C.ink2, baseline: 'middle' });
  }

  function drawStreet() {
    drawWall(0, 92);
    ctx.fillStyle = C.streetBand;
    ctx.fillRect(0, 0, W, 16);
    drawText('Market Street', 25, 40, { size: 20, weight: 700 });
    drawText('Street level, Civic Center / UN Plaza', 25, 58, { size: 11, color: C.ink2 });
    drawCeilingLights(72);

    ENTRANCES.forEach(([code, name], i) => {
      const x = 70 + i * 164;
      ctx.fillStyle = C.entrance;
      roundRect(x, 70, 138, 32, 3);
      ctx.fill();
      drawText(code, x + 8, 84, { size: 10, weight: 700 });
      drawText(name, x + 28, 84, { size: 10, weight: 500, color: C.ink2 });
      ctx.fillStyle = C.entranceBar;
      ctx.fillRect(x + 11, 92, 116, 3);
    });
  }

  function drawConcourse() {
    drawWall(105, 250);
    drawCeilingLights(116);
    drawText('Fare concourse', 24, 132, { size: 13, weight: 700 });
    drawText('BART paid area', 425, 136, { size: 11, color: C.ink2 });
    drawText('Muni paid area', 928, 136, { size: 11, color: C.ink2 });

    FARE_GATE_X.forEach((x, i) => {
      ctx.fillStyle = C.gate;
      roundRect(x, 150, 34, 62, 3);
      ctx.fill();
      ctx.strokeStyle = C.gateEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = i % 2 ? C.gateMuni : C.gateBart;
      ctx.beginPath();
      ctx.arc(x + 17, 168, 2.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.validator;
      ctx.fillRect(x + 7, 178, 20, 17);
    });

    [
      [300, 'BART', C.gateBart],
      [1030, 'Muni', C.gateMuni],
    ].forEach(([x, label, color]) => {
      ctx.fillStyle = C.panel;
      roundRect(x, 147, 180, 66, 4);
      ctx.fill();
      ctx.strokeStyle = C.gateEdge;
      ctx.stroke();
      drawText(label, x + 14, 172, { size: 15, weight: 800, color });
      drawText('Clipper and information', x + 14, 191, { size: 11, color: C.ink2 });
    });

    ctx.strokeStyle = C.ink2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, 235);
    ctx.lineTo(90, 160);
    ctx.lineTo(180, 160);
    ctx.moveTo(1350, 235);
    ctx.lineTo(1350, 160);
    ctx.lineTo(1260, 160);
    ctx.stroke();
  }

  function drawMuni() {
    drawWall(278, 300);
    drawTrack(326, 358);
    drawTrack(432, 464);
    drawIsland(366, 428);
    drawCeilingLights(298);
    drawLevelLabel('Muni Metro', 386);
    drawText('Platform for J, K, L, M and N', W - 210, 386, { size: 11, color: C.ink2, baseline: 'middle' });
    drawBeams(277);
    drawEscalator(205, 252, 368, 48);
    drawEscalator(1185, 252, 368, 48);
  }

  function drawBart() {
    drawWall(523, 545);
    drawTrack(574, 606);
    drawTrack(670, 702);
    drawIsland(614, 670);
    drawCeilingLights(543);
    drawLevelLabel('BART', 632);
    drawText('Platform 2, northbound', W - 270, 626, { size: 11, color: C.ink2, baseline: 'middle' });
    drawText('Platform 1, southbound', W - 270, 650, { size: 11, color: C.ink2, baseline: 'middle' });
    drawBeams(522);
    drawEscalator(245, 487, 616, 66);
    drawEscalator(1145, 487, 616, 66);
  }

  function drawColumns() {
    for (const x of COLUMN_X) {
      ctx.fillStyle = C.column;
      ctx.fillRect(x, 292, 24, 438);
      ctx.fillStyle = C.columnHi;
      ctx.fillRect(x + 3, 292, 4, 438);
    }
  }

  function drawShafts() {
    for (const x of SHAFT_X) {
      ctx.fillStyle = C.shaft;
      ctx.fillRect(x - 24, SHAFT_TOP, 48, SHAFT_BOTTOM - SHAFT_TOP);
      ctx.strokeStyle = C.shaftEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 23.5, SHAFT_TOP + 0.5, 47, SHAFT_BOTTOM - SHAFT_TOP - 1);
      ctx.fillStyle = C.lift;
      ctx.fillRect(x - 24, 365, 48, 62);
      ctx.fillRect(x - 24, 615, 48, 55);
      drawText('Lift', x, 350, { size: 10, weight: 600, color: C.ink2, align: 'center' });
    }
  }

  function drawStationSigns() {
    [
      ['Civic Center', W / 2 - 90, 233],
      ['UN Plaza', W / 2 + 30, 233],
      ['Civic Center', W / 2 - 70, 500],
    ].forEach(([label, x, y]) => {
      ctx.fillStyle = C.signBg;
      roundRect(x, y, 120, 22, 3);
      ctx.fill();
      drawText(label, x + 60, y + 15, { size: 11, weight: 700, color: C.signText, align: 'center' });
    });
  }

  function drawLedBoard(x, y, w, title, system) {
    ctx.fillStyle = C.board;
    roundRect(x, y, w, 52, 3);
    ctx.fill();
    drawText(title, x + 9, y + 14, { size: 9, weight: 700, color: C.signText });

    upcoming((line) => line.system === system, 3).forEach((row, i) => {
      const ty = y + 27 + i * 10;
      drawText(`${row.svc.line.short}  ${destinationOf(row.svc)}`, x + 9, ty, {
        size: 9,
        weight: 600,
        color: C.boardText,
      });
      drawText(formatEta(row), x + w - 9, ty, {
        size: 9,
        weight: 600,
        color: C.boardText,
        align: 'right',
      });
    });
  }

  function drawFloorDetails() {
    ctx.fillStyle = C.tactile;
    for (const y of [366, 428, 614, 670]) {
      for (let x = 22; x < W; x += 22) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = C.columnBase;
    for (const x of COLUMN_X) {
      roundRect(x - 5, 352, 34, 12, 2);
      ctx.fill();
      roundRect(x - 5, 600, 34, 12, 2);
      ctx.fill();
    }
  }

  /*
   * Train drawing. Coordinates for a car of width w and height h, with
   * the body spanning y..y+h:
   *   0.05h–0.25h  destination board (lead cars only)
   *   0.30h–0.66h  window band (lit while doors are open)
   *   0.80h–1.00h  skirt, in a darker shade of the line colour
   * Bogies sit just below the body.
   */

  function drawBogies(x, y, w, h) {
    const bogieTop = y + h - 1;
    for (const frac of [0.2, 0.8]) {
      const bx = x + w * frac - w * 0.09;
      ctx.fillStyle = C.bogie;
      roundRect(bx, bogieTop, w * 0.18, 5, 1.5);
      ctx.fill();
      ctx.fillStyle = C.wheel;
      for (const wx of [bx + w * 0.04, bx + w * 0.14]) {
        ctx.beginPath();
        ctx.arc(wx, bogieTop + 7, 2.4, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawPantograph(x, y, w) {
    // Overhead collector on Muni cars: a pivoting arm and a contact shoe.
    const px = x + w * 0.55;
    ctx.strokeStyle = C.escalator;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + 4, y - 9);
    ctx.lineTo(px + 1, y - 13);
    ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 6, y - 13);
    ctx.lineTo(px + 7, y - 13);
    ctx.stroke();
  }

  function drawCar(train, x, y, w, h, { lead, roofCar }) {
    const base = train.line.color;
    const bodyR = lead ? 9 : 4;

    // Body: lit from above, rounded by a horizontal falloff.
    const body = ctx.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, shade(base, 0.28));
    body.addColorStop(0.55, base);
    body.addColorStop(1, shade(base, -0.18));
    ctx.fillStyle = body;
    roundRect(x, y, w, h, bodyR);
    ctx.fill();

    const round = ctx.createLinearGradient(x, 0, x + w, 0);
    round.addColorStop(0, 'rgba(0, 0, 0, 0.16)');
    round.addColorStop(0.18, 'rgba(0, 0, 0, 0)');
    round.addColorStop(0.82, 'rgba(0, 0, 0, 0)');
    round.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
    ctx.fillStyle = round;
    roundRect(x, y, w, h, bodyR);
    ctx.fill();

    // Skirt band along the bottom of the body.
    ctx.fillStyle = shade(base, -0.35);
    ctx.fillRect(x + 1, y + h * 0.8, w - 2, h * 0.2 - 1);

    // Window band. Lit when the doors are open.
    const wy = y + h * 0.3;
    const wh = h * 0.36;
    ctx.fillStyle = train.doorsOpen ? C.carLit : C.carWindow;
    roundRect(x + w * 0.06, wy, w * 0.88, wh, 3);
    ctx.fill();

    // Window posts and a soft reflection across the glass.
    ctx.fillStyle = shade(base, -0.45);
    for (let k = 1; k < 4; k++) {
      ctx.fillRect(x + w * 0.06 + (w * 0.88 * k) / 4 - 0.75, wy, 1.5, wh);
    }
    if (!train.doorsOpen) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.1, wy + wh);
      ctx.lineTo(x + w * 0.3, wy);
      ctx.lineTo(x + w * 0.36, wy);
      ctx.lineTo(x + w * 0.16, wy + wh);
      ctx.closePath();
      ctx.fill();
    }

    // Roof highlight.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(x + 4, y + 1, w - 8, 1.5);

    if (lead) {
      // Destination board across the top of the car.
      const bx = x + w * 0.16;
      const bw = w * 0.68;
      const by = y + h * 0.05;
      const bh = h * 0.2;
      ctx.save();
      ctx.fillStyle = C.carBoard;
      roundRect(bx, by, bw, bh, 2);
      ctx.fill();
      ctx.clip();
      drawText(train.line.short || train.line.label.slice(0, 1), bx + bw * 0.16, by + bh * 0.76, {
        size: Math.max(6, h * 0.16),
        weight: 800,
        color: C.carBoardText,
        align: 'center',
      });
      drawText(train.destination, bx + bw * 0.62, by + bh * 0.76, {
        size: Math.max(6, h * 0.16),
        weight: 700,
        color: C.carBoardText,
        align: 'center',
      });
      ctx.restore();

      // Headlight at the front, tail light at the rear.
      const isFront = train.sign > 0 ? x + w - 3 : x + 3;
      ctx.fillStyle = C.headlight;
      ctx.beginPath();
      ctx.arc(isFront, y + h * 0.74, 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff5a4d';
      ctx.beginPath();
      ctx.arc(train.sign > 0 ? x + 3 : x + w - 3, y + h * 0.74, 1.8, 0, TAU);
      ctx.fill();
    }

    if (roofCar && !train.isBart) drawPantograph(x, y, w);
  }

  function drawTrain(train) {
    const x0 = train.x - train.length / 2;
    const y = train.trackY - train.height / 2;

    ctx.fillStyle = C.trainShadow;
    roundRect(x0 + 8, y + train.height + 1, train.length - 16, 6, 3);
    ctx.fill();

    for (let i = 0; i < train.cars; i++) {
      const x = x0 + i * train.carLength + 2;
      drawBogies(x, y, train.carLength - 4, train.height);
    }

    for (let i = 0; i < train.cars; i++) {
      drawCar(train, x0 + i * train.carLength + 2, y, train.carLength - 4, train.height, {
        lead: i === 0 || i === train.cars - 1,
        roofCar: i === 0,
      });
    }

    if (train.doorsOpen) {
      ctx.fillStyle = C.glow;
      ctx.fillRect(x0, y - 10, train.length, 4);
    }

    if (train.state !== 'dwell') {
      const fx = train.x + (train.sign * train.length) / 2;
      const glow = ctx.createRadialGradient(fx, train.trackY, 0, fx, train.trackY, 120);
      glow.addColorStop(0, C.glow);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fx, train.trackY, 120, 0, TAU);
      ctx.fill();
    }
  }

  function drawPassenger(p, now) {
    const bob = !reducedMotion && p.state === 'waiting' ? Math.sin(now / 500 + p.phase) * 0.4 : 0;

    ctx.fillStyle = C.paxShadow;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.radius * 1.05, p.radius * 1.1, p.radius * 0.35, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y + bob, p.radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(p.x - p.radius * 0.28, p.y - p.radius * 0.3 + bob, p.radius * 0.35, 0, TAU);
    ctx.fill();

    if (p.hasBag) {
      ctx.fillStyle = C.bag;
      roundRect(p.x - p.radius * 0.9, p.y - p.radius * 0.1, Math.max(2, p.radius * 0.6), p.radius * 1.15, 1.5);
      ctx.fill();
    }
    if (p.hasBike) {
      ctx.strokeStyle = C.escalator;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x - 5, p.y + 7, 4, 0, TAU);
      ctx.arc(p.x + 5, p.y + 7, 4, 0, TAU);
      ctx.moveTo(p.x - 5, p.y + 7);
      ctx.lineTo(p.x, p.y);
      ctx.lineTo(p.x + 5, p.y + 7);
      ctx.stroke();
    }
  }

  function drawDirectionArrow(x, y, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 12, y);
    ctx.lineTo(x + 12, y);
    ctx.moveTo(x + 12, y);
    ctx.lineTo(x + 5, y - 5);
    ctx.moveTo(x + 12, y);
    ctx.lineTo(x + 5, y + 5);
    ctx.stroke();
  }

  function draw(now) {
    // Map world units to device pixels once per frame.
    const k = view.dpr * view.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, view.dpr * view.ox, view.dpr * view.oy);

    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);

    drawStreet();
    drawConcourse();
    drawMuni();
    drawBart();
    drawColumns();
    drawShafts();
    drawStationSigns();
    drawLedBoard(72, 330, 240, 'MUNI', 'muni');
    drawLedBoard(970, 585, 360, 'BART', 'bart');
    drawFloorDetails();

    for (const train of sim.trains) drawTrain(train);
    for (const p of sim.passengers) drawPassenger(p, now);

    drawDirectionArrow(W - 100, 384, C.arrowMuni);
    drawDirectionArrow(W - 100, 632, C.arrowBart);
  }


  function setTheme(theme) {
    C = PALETTES[theme] || PALETTES.light;
  }

  function setReducedMotion(enabled) {
    reducedMotion = Boolean(enabled);
  }

  return { draw, resizeCanvas, setTheme, setReducedMotion };
}
