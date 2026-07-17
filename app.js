/* app.js — el resto de la lógica. Se carga DESPUÉS de rooms-data.js.
   No necesitas editar este archivo para agregar/cambiar oficinas o rewards. */

/* ======================================================================
   2. DISPONIBILIDAD Y COLOR DE ESTADO
   ====================================================================== */

/** Cuántos bloques horarios están libres en un día dado. */
function freeCount(room, diaIdx = 0) {
  const dia = room.horariosPorDia[diaIdx];
  return dia.filter(h => !h.ocupado).length;
}

/** Nivel de semáforo ("green" | "yellow" | "red" | "none") según horarios
 *  libres, sólo aplica cuando el estado general del espacio es Disponible. */
function availabilityLevel(room, diaIdx = 0) {
  if (!room.bookable) return "none";
  if (room.estado !== STATUS.DISPONIBLE.id) return "none";
  const free = freeCount(room, diaIdx);
  if (free === 0) return "red";
  if (free <= 2) return "yellow";
  return "green";
}

/** Color numérico (hex THREE) que representa el estado actual del espacio:
 *  Mantenimiento/Próximamente/Reservada usan su color fijo; Disponible usa
 *  el semáforo de disponibilidad horaria del día indicado. */
function statusColor(room, diaIdx = 0) {
  if (!room.bookable) return MUTED_FILL_COLOR;
  const fixed = Object.values(STATUS).find(s => s.id === room.estado);
  if (fixed && fixed.color !== null) return fixed.color;
  const lvl = availabilityLevel(room, diaIdx);
  return AVAILABILITY_COLOR[lvl] ?? AVAILABILITY_COLOR.red;
}

/** Etiqueta legible del estado general (para el panel lateral). */
function statusLabel(room) {
  const def = Object.values(STATUS).find(s => s.id === room.estado);
  return def ? def.label : "Disponible";
}

function baseFillColor(room, THREE) {
  if (!room.bookable) return MUTED_FILL_COLOR;
  return new THREE.Color(statusColor(room)).multiplyScalar(0.4).getHex();
}

function hoverFillColor(room, THREE) {
  if (!room.bookable) return MUTED_HOVER_COLOR;
  return new THREE.Color(statusColor(room)).multiplyScalar(0.68).getHex();
}

function findRoomById(id) {
  return ROOMS.find(r => r.id === id);
}

function searchRooms(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ROOMS.filter(r => r.nombre.toLowerCase().includes(q) || r.codigo.toLowerCase().includes(q)).slice(0, 8);
}


/* ============================== architecture.js ============================== */
/* ======================================================================
   architecture.js — Elementos arquitectónicos del plano: muros
   perimetrales de cada sala (con un vano de puerta en el lado de
   acceso), el marco/hoja de esa puerta, y el piso de los pasillos que
   conectan todas las puertas entre sí. No conoce cámara ni interacción;
   sólo genera geometría estática a partir de ROOMS/CORRIDORS.
   ====================================================================== */
const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.88, metalness: 0.02 });
const doorMat = new THREE.MeshStandardMaterial({ color: DOOR_COLOR, roughness: 0.55, metalness: 0.08 });
const glassDoorMat = new THREE.MeshStandardMaterial({
  color: GLASS_DOOR_COLOR, roughness: 0.1, metalness: 0.05,
  transparent: true, opacity: GLASS_DOOR_OPACITY,
});
const frostMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0.35 });
const corridorMat = new THREE.MeshStandardMaterial({ color: CORRIDOR_COLOR, roughness: 1, metalness: 0 });

/**
 * Construye el perímetro de muros de una sala, dejando abierto el vano
 * de la puerta (`room.door = { side: 'n'|'s'|'e'|'w', offset }`).
 * Los espacios marcados `open: true` (patio, estacionamiento) usan un
 * bordillo bajo en vez de muro alto y no llevan marco/hoja de puerta:
 * su lado de acceso queda completamente abierto, como una plaza cubierta.
 */
function buildRoomWalls(room) {
  const group = new THREE.Group();
  const { x, z, w, d } = room.rect;
  const hw = w / 2, hd = d / 2;
  const t = WALL_THICKNESS;
  const h = room.open ? CURB_HEIGHT : (room.wallHeight || WALL_HEIGHT);
  const door = room.door;
  const doorW = (door && door.width) || DOOR_WIDTH;

  function addRun(cx, cz, length, horizontal) {
    if (length <= 0.04) return;
    const geo = horizontal
      ? new THREE.BoxGeometry(length, h, t)
      : new THREE.BoxGeometry(t, h, length);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(cx, h / 2, cz);
    group.add(mesh);
  }

  function addDoorDressing(cx, cz, horizontal) {
    if (door?.glass) { addGlassSlidingDoor(cx, cz, horizontal); return; }
    const lintelGeo = horizontal
      ? new THREE.BoxGeometry(doorW, 0.16, t)
      : new THREE.BoxGeometry(t, 0.16, doorW);
    const lintel = new THREE.Mesh(lintelGeo, wallMat);
    lintel.position.set(cx, h - 0.08, cz);
    group.add(lintel);

    const leafH = h * 0.78;
    const leafGeo = new THREE.BoxGeometry(doorW * 0.86, leafH, 0.05);
    const leaf = new THREE.Mesh(leafGeo, doorMat);
    leaf.position.set(cx, leafH / 2, cz);
    if (!horizontal) leaf.rotation.y = Math.PI / 2;
    group.add(leaf);
  }

  /** Puerta corrediza de cristal: riel superior tipo "barn door", dos hojas
   *  de vidrio esmerilado (con un rombo esmerilado grabado, tipo logo), un
   *  mainel central y jaladeras verticales — como la puerta real de la
   *  oficina de referencia. */
  function addGlassSlidingDoor(cx, cz, horizontal) {
    const railGeo = horizontal
      ? new THREE.BoxGeometry(doorW * 1.1, 0.1, t * 1.4)
      : new THREE.BoxGeometry(t * 1.4, 0.1, doorW * 1.1);
    const rail = new THREE.Mesh(railGeo, doorMat);
    rail.position.set(cx, h - 0.05, cz);
    group.add(rail);

    const leafH = h * 0.9;
    const leafW = doorW * 0.49;
    [-1, 1].forEach(side => {
      const panelGeo = horizontal
        ? new THREE.BoxGeometry(leafW, leafH, 0.045)
        : new THREE.BoxGeometry(0.045, leafH, leafW);
      const panel = new THREE.Mesh(panelGeo, glassDoorMat);
      const off = side * (leafW / 2 + 0.012);
      if (horizontal) panel.position.set(cx + off, leafH / 2, cz);
      else panel.position.set(cx, leafH / 2, cz + off);
      group.add(panel);

      if (horizontal) {
        const decal = new THREE.Mesh(new THREE.PlaneGeometry(leafW * 0.24, leafW * 0.24), frostMat);
        decal.rotation.z = Math.PI / 4;
        decal.position.set(cx + off, leafH * 0.56, cz + 0.024);
        group.add(decal);
      }

      const handleGeo = new THREE.CylinderGeometry(0.014, 0.014, leafH * 0.3);
      const handle = new THREE.Mesh(handleGeo, doorMat);
      handle.rotation.z = Math.PI / 2;
      if (horizontal) handle.position.set(cx + off, leafH * 0.52, cz + 0.035);
      else handle.position.set(cx + 0.035, leafH * 0.52, cz + off);
      group.add(handle);
    });

    const mullionGeo = horizontal
      ? new THREE.BoxGeometry(0.035, leafH, t * 1.2)
      : new THREE.BoxGeometry(t * 1.2, leafH, 0.035);
    const mullion = new THREE.Mesh(mullionGeo, doorMat);
    mullion.position.set(cx, leafH / 2, cz);
    group.add(mullion);
  }

  function buildSide(side) {
    const isDoorSide = door && door.side === side;

    if (side === "n" || side === "s") {
      const wallZ = side === "n" ? z - hd : z + hd;
      if (!isDoorSide) { addRun(x, wallZ, w, true); return; }
      if (room.open) return; // acceso totalmente abierto, sin muro ni marco
      const doorCx = x + (door.offset || 0);
      const leftLen = (doorCx - doorW / 2) - (x - hw);
      const rightLen = (x + hw) - (doorCx + doorW / 2);
      addRun(x - hw + leftLen / 2, wallZ, leftLen, true);
      addRun(doorCx + doorW / 2 + rightLen / 2, wallZ, rightLen, true);
      addDoorDressing(doorCx, wallZ, true);
    } else {
      const wallX = side === "w" ? x - hw : x + hw;
      if (!isDoorSide) { addRun(wallX, z, d, false); return; }
      if (room.open) return;
      const doorCz = z + (door.offset || 0);
      const topLen = (doorCz - doorW / 2) - (z - hd);
      const botLen = (z + hd) - (doorCz + doorW / 2);
      addRun(wallX, z - hd + topLen / 2, topLen, false);
      addRun(wallX, doorCz + doorW / 2 + botLen / 2, botLen, false);
      addDoorDressing(wallX, doorCz, false);
    }
  }

  ["n", "s", "e", "w"].forEach(buildSide);
  return group;
}

/** Construye todas las salas de una sola vez y las agrupa. */
function buildAllWalls(rooms) {
  const group = new THREE.Group();
  rooms.forEach(room => group.add(buildRoomWalls(room)));
  return group;
}

/** Piso de pasillos: franjas planas, ligeramente elevadas sobre el piso
 *  general, con un tono distinto para leerse como "camino" navegable. */
function buildCorridorFloors(corridorRects) {
  const group = new THREE.Group();
  corridorRects.forEach(r => {
    const geo = new THREE.PlaneGeometry(r.w, r.d);
    const mesh = new THREE.Mesh(geo, corridorMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(r.x, -0.03, r.z);
    group.add(mesh);
  });
  return group;
}


/* ============================== furniture.js ============================== */
/* ======================================================================
   furniture.js — Interior detallado de la "oficina ejecutiva", inspirado
   en fotografías reales del espacio: piso de madera, pared de acento con
   cuadro enmarcado, minisplit, ventanas con persianas, escritorio en L
   con librero, silla ejecutiva con base de 5 puntas, sillones para
   visitas, mesita auxiliar con charola octagonal y orquídea. Todo con
   geometría simple (cajas/cilindros) — sin modelos externos — pero
   compuesta para leerse lo más parecido posible a la referencia real.
   ====================================================================== */
/* ---------- materiales ---------- */
const deskMat       = new THREE.MeshStandardMaterial({ color: 0x3b2412, roughness: 0.45, metalness: 0.08 });
const deskLegMat    = new THREE.MeshStandardMaterial({ color: 0x120c07, roughness: 0.4, metalness: 0.15 });
const chairSeatMat  = new THREE.MeshStandardMaterial({ color: 0xe9ddc9, roughness: 0.8 });
const chairFrameMat = new THREE.MeshStandardMaterial({ color: 0x201810, roughness: 0.5 });
const execMat       = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.55, metalness: 0.1 });
const chromeMat     = new THREE.MeshStandardMaterial({ color: 0x9aa2ac, roughness: 0.3, metalness: 0.8 });
const monitorMat    = new THREE.MeshStandardMaterial({ color: 0x11151b, roughness: 0.25, metalness: 0.35 });
const keyboardMat   = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.5 });
const plantPotMat   = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.85 });
const stemMat       = new THREE.MeshStandardMaterial({ color: 0x3f7a4d, roughness: 0.7 });
const orchidMat     = new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 0.6 });
const accentWallMat = new THREE.MeshStandardMaterial({ color: 0xe4d3ba, roughness: 0.95 });
const frameMat      = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 0.6 });
const acBodyMat     = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.4 });
const acGrilleMat   = new THREE.MeshStandardMaterial({ color: 0xc7ccd1, roughness: 0.35 });
const woodFrameMat  = new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 0.7 });
const glassMat      = new THREE.MeshStandardMaterial({ color: 0xbfe0ea, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.4 });
const blindMat      = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.8 });
const tableMat      = new THREE.MeshStandardMaterial({ color: 0x2e1e12, roughness: 0.5 });
const trayMat       = new THREE.MeshStandardMaterial({ color: 0xb99a6b, roughness: 0.6 });

function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function cyl(r, h, mat, seg = 20) { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); }

/** Textura de piso de madera (canvas), estilo "parquet" en franjas. */
function woodFloorTexture() {
  const size = 256;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext("2d");
  ctx.fillStyle = "#7a4a2c";
  ctx.fillRect(0, 0, size, size);
  const plank = size / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#835431" : "#764a29";
    ctx.fillRect(0, i * plank, size, plank);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, i * plank); ctx.lineTo(size, i * plank); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/** Cuadro con figuras de colores (canvas), como el de la referencia. */
function artTexture() {
  const w = 220, hpx = 110;
  const cvs = document.createElement("canvas");
  cvs.width = w; cvs.height = hpx;
  const ctx = cvs.getContext("2d");
  ctx.fillStyle = "#f2ede2";
  ctx.fillRect(0, 0, w, hpx);
  const palette = ["#c94f3d", "#3d7ac9", "#e0a730", "#4c9a5a", "#8a3d9a"];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = palette[i % palette.length];
    const bw = w / 6;
    ctx.fillRect(i * bw + 6, hpx * 0.25, bw - 12, hpx * 0.6);
  }
  return new THREE.CanvasTexture(cvs);
}

const woodFloorTex = woodFloorTexture();
const artTex = artTexture();
const artMat = new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.9 });
const woodFloorMat = new THREE.MeshStandardMaterial({ map: woodFloorTex, roughness: 0.75 });

/** Base de 5 puntas para la silla ejecutiva. */
function fiveStarBase(y, group) {
  const hub = cyl(0.09, 0.05, chromeMat);
  hub.position.set(0, y, 0);
  group.add(hub);
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const leg = box(0.26, 0.03, 0.045, chromeMat);
    leg.position.set(Math.cos(ang) * 0.13, y, Math.sin(ang) * 0.13);
    leg.rotation.y = ang;
    group.add(leg);
    const wheel = cyl(0.025, 0.03, execMat, 10);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(Math.cos(ang) * 0.24, y - 0.01, Math.sin(ang) * 0.24);
    group.add(wheel);
  }
}

/**
 * Interior detallado de la oficina ejecutiva. `topY` es la altura sobre la
 * que se apoya el mobiliario (el techo del volumen de color de estado).
 */
function buildOficinaEjecutiva(room, topY) {
  const group = new THREE.Group();
  const { w, d } = room.rect;
  const s = Math.min(w, d);

  /* ---------- piso de madera ---------- */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, d * 0.94), woodFloorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, topY + 0.006, 0);
  group.add(floor);

  /* ---------- pared de acento + cuadro + minisplit (muro norte) ---------- */
  const wallZ = -d / 2 + 0.05;
  const accent = box(w * 0.55, 1.3, 0.04, accentWallMat);
  accent.position.set(-w * 0.05, topY + 0.65, wallZ);
  group.add(accent);

  const frame = box(0.5, 0.28, 0.03, frameMat);
  frame.position.set(w * 0.18, topY + 0.75, wallZ + 0.025);
  group.add(frame);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), artMat);
  art.position.set(w * 0.18, topY + 0.75, wallZ + 0.045);
  group.add(art);

  const acBody = box(0.5, 0.15, 0.13, acBodyMat);
  acBody.position.set(-w * 0.22, topY + 1.15, wallZ + 0.02);
  group.add(acBody);
  const acGrille = box(0.42, 0.03, 0.02, acGrilleMat);
  acGrille.position.set(-w * 0.22, topY + 1.08, wallZ + 0.08);
  group.add(acGrille);

  /* ---------- ventanas con persianas (muro oeste) ---------- */
  const wallX = -w / 2 + 0.05;
  [-d * 0.22, d * 0.18].forEach(wz => {
    const winFrame = box(0.05, 1.05, 0.55, woodFrameMat);
    winFrame.position.set(wallX, topY + 0.65, wz);
    group.add(winFrame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1), glassMat);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(wallX + 0.03, topY + 0.65, wz);
    group.add(glass);
    for (let i = 0; i < 6; i++) {
      const slat = box(0.03, 0.09, 0.52, blindMat);
      slat.position.set(wallX + 0.06, topY + 0.28 + i * 0.16, wz);
      group.add(slat);
    }
  });

  /* ---------- escritorio en L + librero ---------- */
  const DESK_H = 0.42;
  const armA = box(w * 0.5, 0.045, d * 0.18, deskMat);
  armA.position.set(w * 0.02, topY + DESK_H, -d * 0.33);
  group.add(armA);
  const armB = box(w * 0.16, 0.045, d * 0.34, deskMat);
  armB.position.set(w * 0.24, topY + DESK_H, -d * 0.14);
  group.add(armB);
  [[-w * 0.18, -d * 0.39], [w * 0.2, -d * 0.39], [-w * 0.18, -d * 0.27], [w * 0.3, -d * 0.02]].forEach(([lx, lz]) => {
    const leg = cyl(0.018, DESK_H, deskLegMat, 8);
    leg.position.set(lx, topY + DESK_H / 2, lz);
    group.add(leg);
  });

  const hutch = box(w * 0.46, 0.5, d * 0.13, deskMat);
  hutch.position.set(w * 0.0, topY + DESK_H + 0.25 + 0.02, -d * 0.4);
  group.add(hutch);
  [0.1, -0.06].forEach(off => {
    const shelf = box(w * 0.44, 0.015, d * 0.11, deskLegMat);
    shelf.position.set(0, topY + DESK_H + 0.25 + off, -d * 0.4);
    group.add(shelf);
  });
  const statueBody = cyl(0.02, 0.14, execMat, 8);
  statueBody.position.set(-w * 0.14, topY + DESK_H + 0.28, -d * 0.4);
  group.add(statueBody);

  /* monitor + teclado */
  const stand = cyl(0.02, 0.16, monitorMat, 10);
  stand.position.set(w * 0.28, topY + DESK_H + 0.08, -d * 0.26);
  group.add(stand);
  const screen = box(0.34, 0.2, 0.02, monitorMat);
  screen.position.set(w * 0.28, topY + DESK_H + 0.26, -d * 0.26);
  group.add(screen);
  const keyboard = box(0.24, 0.015, 0.09, keyboardMat);
  keyboard.position.set(w * 0.28, topY + DESK_H + 0.025, -d * 0.14);
  group.add(keyboard);
  const penCup = cyl(0.025, 0.09, execMat, 10);
  penCup.position.set(w * 0.34, topY + DESK_H + 0.045, -d * 0.02);
  group.add(penCup);

  const frame2 = box(0.22, 0.16, 0.025, frameMat);
  frame2.position.set(-w * 0.28, topY + 0.7, wallZ + 0.025);
  group.add(frame2);
  const frame2Inner = box(0.17, 0.11, 0.01, accentWallMat);
  frame2Inner.position.set(-w * 0.28, topY + 0.7, wallZ + 0.04);
  group.add(frame2Inner);

  /* ---------- silla ejecutiva (detrás del escritorio, mirando a la puerta) ---------- */
  const exec = new THREE.Group();
  const execSeat = box(0.34, 0.06, 0.32, execMat);
  execSeat.position.set(0, 0.42, 0);
  exec.add(execSeat);
  const execBack = box(0.32, 0.5, 0.06, execMat);
  execBack.position.set(0, 0.42 + 0.28, -0.14);
  exec.add(execBack);
  const execHead = box(0.16, 0.12, 0.05, execMat);
  execHead.position.set(0, 0.42 + 0.54, -0.15);
  exec.add(execHead);
  const pole = cyl(0.028, 0.36, chromeMat, 10);
  pole.position.set(0, 0.24, 0);
  exec.add(pole);
  fiveStarBase(0.06, exec);
  exec.position.set(w * 0.05, topY, -d * 0.13);
  group.add(exec);

  /* ---------- sillones para visita ---------- */
  [[-w * 0.06, d * 0.09], [w * 0.16, d * 0.09]].forEach(([cx, cz]) => {
    const seat = cyl(s * 0.075, 0.24, chairSeatMat);
    seat.position.set(cx, topY + 0.12, cz);
    group.add(seat);
    const back = box(s * 0.16, 0.34, s * 0.03, chairFrameMat);
    back.position.set(cx, topY + 0.24 + 0.17, cz + s * 0.075);
    group.add(back);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const leg = cyl(0.015, 0.2, chairFrameMat, 8);
      leg.position.set(cx + sx * s * 0.05, topY + 0.1, cz + sz * s * 0.05);
      group.add(leg);
    });
  });

  /* ---------- mesita auxiliar + charola octagonal ---------- */
  const table = cyl(s * 0.05, 0.3, tableMat, 16);
  table.position.set(-w * 0.36, topY + 0.15, d * 0.38);
  group.add(table);
  const tray = cyl(s * 0.045, 0.02, trayMat, 8);
  tray.position.set(-w * 0.36, topY + 0.31, d * 0.38);
  group.add(tray);

  /* ---------- orquídea ---------- */
  const pot = cyl(s * 0.035, 0.14, plantPotMat, 12);
  pot.position.set(w * 0.37, topY + 0.07, d * 0.11);
  group.add(pot);
  const stem = cyl(0.012, 0.42, stemMat, 8);
  stem.position.set(w * 0.37, topY + 0.14 + 0.21, d * 0.11);
  group.add(stem);
  [0, 0.06, -0.05].forEach((offx, i) => {
    const bloom = box(0.05, 0.03, 0.03, orchidMat);
    bloom.position.set(w * 0.37 + offx, topY + 0.34 + i * 0.03, d * 0.11 + (i - 1) * 0.02);
    group.add(bloom);
  });

  group.position.set(room.rect.x, 0, room.rect.z);
  return group;
}

/**
 * createOffice01(scene)
 * Versión corregida de la Oficina 1 contra la fotografía de referencia.
 * Reutiliza los materiales/helpers ya definidos arriba (box, cyl, deskMat,
 * execMat, chairSeatMat, chairFrameMat, chromeMat, monitorMat, keyboardMat,
 * plantPotMat, stemMat, orchidMat, accentWallMat, frameMat, acBodyMat,
 * acGrilleMat, woodFrameMat, glassMat, blindMat, tableMat, trayMat, artMat,
 * woodFloorMat, findRoomById, HEIGHT_BOOK, fiveStarBase).
 * Solo se corrigen posiciones, tamaños, colores e iluminación respecto a
 * buildOficinaEjecutiva:
 *  - el cuadro colorido se movió al muro este (en la foto no comparte
 *    muro con el minisplit) y se eliminó el segundo cuadro duplicado
 *  - las persianas ahora quedan recogidas arriba, no cubren toda la ventana
 *  - la estatuilla usa tono bronce en vez del negro de la silla
 *  - el respaldo de la silla ejecutiva usa un material tipo malla
 *  - se agregó una luz cálida local (spots empotrados de la foto)
 */
function createOffice01(scene) {
  const room = findRoomById("oficina-1");
  if (!room) return;
  const topY = HEIGHT_BOOK;
  const group = new THREE.Group();
  const { w, d } = room.rect;
  const s = Math.min(w, d);

  const bronzeMat   = new THREE.MeshStandardMaterial({ color: 0x8a6a35, roughness: 0.4, metalness: 0.6 });
  const meshBackMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.88 });

  /* ---------- piso de madera ----------
     ANTES: quedaba a solo +0.006 sobre la tapa verde de la sala y se
     perdía por z-fighting (por eso se veía todo verde). Ahora se separa
     lo suficiente para que SIEMPRE gane el render. */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, d * 0.94), woodFloorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, topY + 0.08, 0);
  group.add(floor);

  /* ---------- pared de acento + minisplit (muro norte) ----------
     CORRECCIÓN DE ORIENTACIÓN: todo el mobiliario (escritorio, hutch,
     monitor, ventanas, cuadro, estatuilla) estaba armado viendo hacia el
     lado contrario de la fotografía. Se refleja toda la composición en
     el eje X (izquierda<->derecha) para que quede orientada como en la
     foto real, sin cambiar tamaños ni la composición en sí. */
  const wallZ = -d / 2 + 0.05;
  const accent = box(w * 0.55, 1.3, 0.04, accentWallMat);
  accent.position.set(w * 0.05, topY + 0.65, wallZ);
  group.add(accent);

  const acBody = box(s * 0.13, s * 0.045, s * 0.035, acBodyMat);
  acBody.position.set(w * 0.22, topY + 1.15, wallZ + 0.03);
  group.add(acBody);
  const acGrille = box(s * 0.11, s * 0.008, s * 0.006, acGrilleMat);
  acGrille.position.set(w * 0.22, topY + 1.08, wallZ + 0.09);
  group.add(acGrille);

  /* ---------- cuadro colorido (mismo muro norte, lado opuesto al AC) ---------- */
  const frame = box(s * 0.16, s * 0.09, 0.05, frameMat);
  frame.position.set(-w * 0.32, topY + 0.9, wallZ + 0.03);
  group.add(frame);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.145, s * 0.078), artMat);
  art.position.set(-w * 0.32, topY + 0.9, wallZ + 0.06);
  group.add(art);

  /* ---------- ventanas con persianas recogidas arriba (ahora muro este;
     antes muro oeste, del lado equivocado) ---------- */
  const wallX = w / 2 - 0.05;
  [-d * 0.22, d * 0.18].forEach(wz => {
    const winFrame = box(0.06, s * 0.26, s * 0.15, woodFrameMat);
    winFrame.position.set(wallX, topY + 0.75, wz);
    group.add(winFrame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.14, s * 0.24), glassMat);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(wallX - 0.04, topY + 0.75, wz);
    group.add(glass);
    for (let i = 0; i < 2; i++) {
      const slat = box(0.04, s * 0.02, s * 0.13, blindMat);
      slat.position.set(wallX - 0.07, topY + 1.18 + i * (s * 0.03), wz);
      group.add(slat);
    }
  });

  /* ---------- escritorio en L + librero (reflejado en X) ---------- */
  const DESK_H = 0.42;
  const armA = box(w * 0.5, 0.045, d * 0.18, deskMat);
  armA.position.set(-w * 0.02, topY + DESK_H, -d * 0.33);
  group.add(armA);
  const armB = box(w * 0.16, 0.045, d * 0.34, deskMat);
  armB.position.set(-w * 0.24, topY + DESK_H, -d * 0.14);
  group.add(armB);
  [[w * 0.18, -d * 0.39], [-w * 0.2, -d * 0.39], [w * 0.18, -d * 0.27], [-w * 0.3, -d * 0.02]].forEach(([lx, lz]) => {
    const leg = cyl(0.018, DESK_H, deskLegMat, 8);
    leg.position.set(lx, topY + DESK_H / 2, lz);
    group.add(leg);
  });

  const hutch = box(w * 0.46, 0.5, d * 0.13, deskMat);
  hutch.position.set(0, topY + DESK_H + 0.25 + 0.02, -d * 0.4);
  group.add(hutch);
  [0.1, -0.06].forEach(off => {
    const shelf = box(w * 0.44, 0.015, d * 0.11, deskLegMat);
    shelf.position.set(0, topY + DESK_H + 0.25 + off, -d * 0.4);
    group.add(shelf);
  });

  const statueBody = cyl(s * 0.008, s * 0.045, bronzeMat, 8);
  statueBody.position.set(w * 0.14, topY + DESK_H + 0.28 + s * 0.011, -d * 0.4);
  group.add(statueBody);

  /* monitor + teclado */
  const stand = cyl(0.02, 0.16, monitorMat, 10);
  stand.position.set(-w * 0.28, topY + DESK_H + 0.08, -d * 0.26);
  group.add(stand);
  const screen = box(0.34, 0.2, 0.02, monitorMat);
  screen.position.set(-w * 0.28, topY + DESK_H + 0.26, -d * 0.26);
  group.add(screen);
  const keyboard = box(0.24, 0.015, 0.09, keyboardMat);
  keyboard.position.set(-w * 0.28, topY + DESK_H + 0.025, -d * 0.14);
  group.add(keyboard);
  const penCup = cyl(0.025, 0.09, execMat, 10);
  penCup.position.set(-w * 0.34, topY + DESK_H + 0.045, -d * 0.02);
  group.add(penCup);

  /* ---------- silla ejecutiva ---------- */
  const exec = new THREE.Group();
  const execSeat = box(0.34, 0.06, 0.32, execMat);
  execSeat.position.set(0, 0.42, 0);
  exec.add(execSeat);
  const execBack = box(0.32, 0.5, 0.06, meshBackMat);
  execBack.position.set(0, 0.42 + 0.28, -0.14);
  exec.add(execBack);
  const execHead = box(0.16, 0.12, 0.05, meshBackMat);
  execHead.position.set(0, 0.42 + 0.54, -0.15);
  exec.add(execHead);
  const pole = cyl(0.028, 0.36, chromeMat, 10);
  pole.position.set(0, 0.24, 0);
  exec.add(pole);
  fiveStarBase(0.06, exec);
  exec.position.set(-w * 0.05, topY, -d * 0.13);
  group.add(exec);

  /* ---------- sillones para visita ---------- */
  [[w * 0.04, d * 0.1], [-w * 0.14, d * 0.1]].forEach(([cx, cz]) => {
    const seat = cyl(s * 0.078, 0.24, chairSeatMat);
    seat.position.set(cx, topY + 0.12, cz);
    group.add(seat);
    const back = box(s * 0.17, 0.36, s * 0.03, chairFrameMat);
    back.position.set(cx, topY + 0.24 + 0.18, cz + s * 0.075);
    group.add(back);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const leg = cyl(0.015, 0.2, chairFrameMat, 8);
      leg.position.set(cx + sx * s * 0.05, topY + 0.1, cz + sz * s * 0.05);
      group.add(leg);
    });
  });

  /* ---------- mesita auxiliar + charola octagonal ---------- */
  const table = cyl(s * 0.05, 0.3, tableMat, 16);
  table.position.set(w * 0.36, topY + 0.15, d * 0.38);
  group.add(table);
  const tray = cyl(s * 0.045, 0.02, trayMat, 8);
  tray.position.set(w * 0.36, topY + 0.31, d * 0.38);
  group.add(tray);

  /* ---------- orquídea ---------- */
  const pot = cyl(s * 0.035, 0.14, plantPotMat, 12);
  pot.position.set(-w * 0.37, topY + 0.07, d * 0.11);
  group.add(pot);
  const stem = cyl(0.012, 0.42, stemMat, 8);
  stem.position.set(-w * 0.37, topY + 0.14 + 0.21, d * 0.11);
  group.add(stem);
  [0, 0.06, -0.05].forEach((offx, i) => {
    const bloom = box(0.05, 0.03, 0.03, orchidMat);
    bloom.position.set(-(w * 0.37 + offx), topY + 0.34 + i * 0.03, d * 0.11 + (i - 1) * 0.02);
    group.add(bloom);
  });

  /* ---------- luz cálida local (spots empotrados de la foto) ---------- */
  const warmSpot = new THREE.PointLight(0xffdca8, 3.5, s * 1.6, 2);
  warmSpot.position.set(-w * 0.05, topY + 1.4, -d * 0.1);
  group.add(warmSpot);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd98a, emissiveIntensity: 2 });
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.02, s * 0.02, s * 0.012, 16), bulbMat);
  bulb.position.set(-w * 0.05, topY + 1.42, -d * 0.1);
  group.add(bulb);

  group.position.set(room.rect.x, 0, room.rect.z);
  scene.add(group);
  return group;
}

/** Registro sala -> constructor de mobiliario, para que scene.js sólo
 *  tenga que consultar `room.furniture` sin conocer los detalles.
 *  "oficina-ejecutiva" ahora usa createOffice01, la versión corregida
 *  contra la fotografía de referencia. */
const FURNITURE_BUILDERS = {
  "oficina-ejecutiva": (room, topY) => createOffice01(scene),
};


/* ============================== scene.js ============================== */
/* ======================================================================
   scene.js — Construcción de la escena Three.js: renderer, luces, piso
   "blueprint", contorno del edificio y los volúmenes 3D de cada espacio.
   No conoce cámara ni interacción; sólo geometría/materiales/estado visual.
   ====================================================================== */
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f18);
scene.fog = new THREE.Fog(0x0a0f18, 60, 130);

/* ---------- luces ---------- */
scene.add(new THREE.HemisphereLight(0x9fd0ff, 0x0a0f18, 0.9));
const dl = new THREE.DirectionalLight(0xffffff, 0.9);
dl.position.set(-20, 40, 20);
scene.add(dl);
const dl2 = new THREE.DirectionalLight(0x5fd4ff, 0.25);
dl2.position.set(20, 20, -30);
scene.add(dl2);

/* luz de estado: resalta el semáforo de disponibilidad del espacio activo */
const statusLight = new THREE.PointLight(0x4ade80, 0, 26, 2);
statusLight.position.set(0, 6, 0);
scene.add(statusLight);

/* ---------- piso con textura tipo "blueprint" ---------- */
function gridTexture() {
  const size = 512;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext("2d");
  ctx.fillStyle = "#0b111c";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(95,212,255,0.10)";
  ctx.lineWidth = 1;
  const step = 32;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}
const floorGeo = new THREE.PlaneGeometry(140, 120);
const floorMat = new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 1 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.05;
scene.add(floor);

/* ---------- contorno del edificio ---------- */
const bOverall = rect(20, -10, 1240, 1600);
const outlineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(bOverall.w + 0.6, 0.02, bOverall.d + 0.6));
const outline = new THREE.LineSegments(outlineGeo, new THREE.LineBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: 0.35 }));
outline.position.set(bOverall.x, 0, bOverall.z);
scene.add(outline);

/* ---------- etiqueta de texto (sprite) ---------- */
function makeLabelSprite(text) {
  const cvs = document.createElement("canvas");
  const ctx = cvs.getContext("2d");
  const fontSize = 42;
  ctx.font = `600 ${fontSize}px 'Space Grotesk', sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  cvs.width = w; cvs.height = 64;
  ctx.font = `600 ${fontSize}px 'Space Grotesk', sans-serif`;
  ctx.fillStyle = "rgba(238,243,248,0.92)";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, 34);
  const tex = new THREE.CanvasTexture(cvs);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const scale = 0.017;
  sprite.scale.set(w * scale, 64 * scale, 1);
  return sprite;
}

/* ---------- volúmenes 3D de cada espacio ---------- */
const roomMeshes = [];
const roomMeshById = {};

ROOMS.forEach(room => {
  const h = room.bookable ? HEIGHT_BOOK : HEIGHT_MUTE;
  const geo = new THREE.BoxGeometry(room.rect.w * 0.94, h, room.rect.d * 0.94);
  const baseEmissive = room.bookable ? statusColor(room) : 0x000000;
  const mat = new THREE.MeshStandardMaterial({
    color: baseFillColor(room, THREE),
    roughness: 0.55, metalness: 0.08,
    emissive: baseEmissive,
    emissiveIntensity: room.bookable ? 0.55 : 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(room.rect.x, h / 2, room.rect.z);
  mesh.userData.room = room;
  mesh.userData.baseColor = mat.color.getHex();
  mesh.userData.hoverColor = hoverFillColor(room, THREE);
  mesh.userData.baseEmissive = baseEmissive;
  mesh.userData.baseY = h / 2;
  scene.add(mesh);
  roomMeshes.push(mesh);
  roomMeshById[room.id] = mesh;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: room.bookable ? 0.55 : 0.25 })
  );
  edges.position.copy(mesh.position);
  mesh.userData.edges = edges;
  scene.add(edges);

  const label = makeLabelSprite(room.nombre.toUpperCase());
  label.position.set(room.rect.x, h + 1.1, room.rect.z);
  scene.add(label);

  const buildFurniture = FURNITURE_BUILDERS[room.furniture];
  if (buildFurniture) scene.add(buildFurniture(room, h));
});

/* ---------- pasillos (piso) + muros y puertas de cada sala ---------- */
scene.add(buildCorridorFloors(CORRIDORS));
scene.add(buildAllWalls(ROOMS));

/* recalcula el color completo de una sala tras un cambio de disponibilidad/estado */
function refreshRoomVisual(room, selectedId) {
  const mesh = roomMeshById[room.id];
  if (!mesh || !room.bookable) return;
  const base = baseFillColor(room, THREE);
  const hover = hoverFillColor(room, THREE);
  mesh.userData.baseColor = base;
  mesh.userData.hoverColor = hover;
  mesh.userData.baseEmissive = statusColor(room);
  if (selectedId !== room.id) {
    mesh.material.color.setHex(base);
    mesh.material.emissive.setHex(statusColor(room));
  }
}

function applyRoomStatusLighting(room) {
  const mesh = roomMeshById[room.id];
  if (!mesh) return;
  if (!room.bookable) {
    statusLight.intensity = 0;
    return;
  }
  const color = statusColor(room);
  mesh.material.emissive.setHex(color);
  mesh.material.emissiveIntensity = 0.85;
  mesh.userData.baseEmissive = color;
  statusLight.color.setHex(color);
  statusLight.userData = statusLight.userData || {};
  statusLight.baseIntensity = 2.2;
  statusLight.distance = Math.max(room.rect.w, room.rect.d) * 3.2;
  statusLight.position.set(room.rect.x, HEIGHT_BOOK + 5, room.rect.z);
}

function clearRoomStatusLighting(roomId) {
  statusLight.intensity = 0;
  statusLight.baseIntensity = 0;
  if (!roomId) return;
  const mesh = roomMeshById[roomId];
  if (!mesh) return;
  mesh.scale.setScalar(1);
  if (!mesh.userData.room.bookable) return;
  mesh.material.emissiveIntensity = 0.5;
}


/* ============================== camera.js ============================== */
/* ======================================================================
   camera.js — Cámara, encuadre automático del edificio y navegación
   ("Google Maps style"): enfocar una sala, restablecer la vista general,
   pan y zoom acotados dentro de los límites del plano.
   ====================================================================== */
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400);
const OVERVIEW_POS = new THREE.Vector3(2, 46, 40);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, -2);
camera.position.copy(OVERVIEW_POS);

let camTarget = OVERVIEW_TARGET.clone();
camera.lookAt(camTarget);

/* dirección de vista fija tipo "mapa": sólo cambia la distancia según
   pantalla/zoom, nunca el ángulo */
const OVERVIEW_DIR = OVERVIEW_POS.clone().sub(OVERVIEW_TARGET).normalize();
const COS_TILT = OVERVIEW_DIR.y;

/* Encuadre exacto: proyectamos las 4 esquinas del edificio sobre los ejes
   derecha/arriba de la cámara para saber cuánta distancia hace falta para
   que quepan por completo. */
const FWD = OVERVIEW_DIR.clone().negate();
const CAM_RIGHT = new THREE.Vector3().crossVectors(FWD, new THREE.Vector3(0, 1, 0)).normalize();
const CAM_UP = new THREE.Vector3().crossVectors(CAM_RIGHT, FWD).normalize();
const buildingCenterRel = new THREE.Vector3(bOverall.x, 0, bOverall.z).sub(OVERVIEW_TARGET);
const halfW = bOverall.w / 2, halfD = bOverall.d / 2;
let maxAbsRight = 0, maxAbsUp = 0;
[-1, 1].forEach(sx => [-1, 1].forEach(sz => {
  const corner = buildingCenterRel.clone().add(new THREE.Vector3(sx * halfW, 0, sz * halfD));
  maxAbsRight = Math.max(maxAbsRight, Math.abs(corner.dot(CAM_RIGHT)));
  maxAbsUp = Math.max(maxAbsUp, Math.abs(corner.dot(CAM_UP)));
}));
const PADDING = 1.06;

function fitDistance(aspect) {
  const vFovHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hFovHalf = Math.atan(Math.tan(vFovHalf) * aspect);
  const distV = maxAbsUp / Math.tan(vFovHalf);
  const distH = maxAbsRight / Math.tan(hFovHalf);
  // En pantallas angostas (celular vertical), priorizamos que la altura
  // quede bien encuadrada y dejamos que el usuario recorra los costados
  // arrastrando — igual que Google Maps al abrir en un teléfono.
  const dist = (aspect < 0.85) ? distV : Math.max(distV, distH);
  return dist * PADDING;
}

let baseDistance = fitDistance(camera.aspect);
function setBaseDistance(d) { baseDistance = d; }

let zoomFactor = 1; // 1 = encuadre completo del edificio
function setZoomFactor(z) { zoomFactor = clamp(z, ZOOM_MIN, ZOOM_MAX); }

const panOffset = new THREE.Vector3();
const PAN_LIMIT_X = bOverall.w * 0.65;
const PAN_LIMIT_Z = bOverall.d * 0.65;

function updateOverviewCamera(instant) {
  const target = OVERVIEW_TARGET.clone().add(panOffset);
  const pos = target.clone().add(OVERVIEW_DIR.clone().multiplyScalar(baseDistance * zoomFactor));
  if (instant) {
    camera.position.copy(pos);
    camTarget.copy(target);
  } else {
    camera.position.lerp(pos, 0.18);
    camTarget.lerp(target, 0.18);
  }
  camera.lookAt(camTarget);
}

/* ---------- estado de selección + navegación ---------- */
let selectedId = null;

/**
 * Enfoca una sala: vuela la cámara hacia ella y delega en `hooks` la
 * apertura del panel / iluminación de estado / UI, para evitar
 * dependencias circulares entre módulos.
 */
function focusRoom(room, hooks = {}) {
  if (selectedId && selectedId !== room.id) hooks.onLeaveRoom?.(selectedId);
  selectedId = room.id;
  const targetPos = new THREE.Vector3(room.rect.x + 2.5, 9, room.rect.z + 9);
  const lookAt = new THREE.Vector3(room.rect.x, 0.6, room.rect.z);
  hooks.flyTo?.(targetPos, lookAt, 900);
  hooks.onFocus?.(room);
}

function resetView(hooks = {}) {
  hooks.onLeaveRoom?.(selectedId);
  selectedId = null;
  panOffset.set(0, 0, 0);
  zoomFactor = 1;
  const target = OVERVIEW_TARGET.clone();
  const pos = target.clone().add(OVERVIEW_DIR.clone().multiplyScalar(baseDistance));
  hooks.flyTo?.(pos, target, 800);
  hooks.onReset?.();
}


/* ============================== animations.js ============================== */
/* ======================================================================
   animations.js — Transiciones de cámara (vuelo suave estilo mapa) y
   animaciones ambientales como el pulso de la sala seleccionada.
   ====================================================================== */
let animating = false;
let animStart = 0, animDur = 900;
const fromPos = new THREE.Vector3(), toPos = new THREE.Vector3();
const fromTarget = new THREE.Vector3(), toTarget = new THREE.Vector3();

function isAnimating() { return animating; }

function flyTo(pos, target, dur = 900) {
  fromPos.copy(camera.position); toPos.copy(pos);
  fromTarget.copy(camTarget); toTarget.copy(target);
  animStart = performance.now(); animDur = dur; animating = true;
}

function tickCameraAnim(now) {
  if (!animating) return;
  let t = (now - animStart) / animDur;
  if (t >= 1) { t = 1; animating = false; }
  const e = easeInOutCubic(t);
  camera.position.lerpVectors(fromPos, toPos, e);
  camTarget.lerpVectors(fromTarget, toTarget, e);
  camera.lookAt(camTarget);
}

/* pulso suave de la sala seleccionada mientras el panel está abierto:
   la sala "respira" con un leve brillo, como resaltado del mapa */
function tickSelectedPulse(now) {
  if (!selectedId) return;
  const mesh = roomMeshById[selectedId];
  if (!mesh) return;
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.0032);
  mesh.material.emissiveIntensity = 0.7 + pulse * 0.45;
  mesh.scale.setScalar(1 + pulse * 0.012);
  if (statusLight.baseIntensity) {
    statusLight.intensity = statusLight.baseIntensity * (0.82 + pulse * 0.35);
  }
}


/* ============================== controls.js ============================== */
/* ======================================================================
   controls.js — Entrada del usuario sobre el canvas: arrastrar para
   desplazar (pan), pellizcar o usar la rueda para hacer zoom, y
   tocar/hacer clic sobre una sala para seleccionarla (raycasting).
   No conoce el panel lateral: notifica selección vía callback.
   ====================================================================== */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tip = document.getElementById("tip");

function screenToMouse(x, y) {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((x - r.left) / r.width) * 2 - 1;
  mouse.y = -((y - r.top) / r.height) * 2 + 1;
  return r;
}

function raycastRooms(x, y) {
  screenToMouse(x, y);
  raycaster.setFromCamera(mouse, camera);
  return raycaster.intersectObjects(roomMeshes);
}

function highlightHover(hits) {
  roomMeshes.forEach(m => {
    const target = (hits[0] && hits[0].object === m) ? m.userData.hoverColor : m.userData.baseColor;
    m.material.color.setHex(target);
  });
}

function initControls(onRoomSelect) {
  /* ---- hover (sólo mouse real, para no dejar "pegado" el resaltado en táctil) ---- */
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || pointers.size > 0) return;
    const hits = raycastRooms(e.clientX, e.clientY);
    highlightHover(hits);
    const r = canvas.getBoundingClientRect();
    if (hits.length) {
      canvas.style.cursor = "pointer";
      const room = hits[0].object.userData.room;
      tip.textContent = `${room.nombre} · ${room.codigo}`;
      tip.style.left = (e.clientX - r.left) + "px";
      tip.style.top = (e.clientY - r.top) + "px";
      tip.classList.add("show");
    } else {
      canvas.style.cursor = "grab";
      tip.classList.remove("show");
    }
  });
  canvas.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") tip.classList.remove("show"); });

  /* ---- pan de un dedo/mouse + pellizco de dos dedos, con Pointer Events ---- */
  const pointers = new Map();
  let pinchPrevDist = 0;
  let tapStart = null;
  const TAP_MOVE_TOLERANCE = 9, TAP_TIME_MAX = 400;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      canvas.style.cursor = "grabbing";
    } else if (pointers.size === 2) {
      tapStart = null;
      const pts = [...pointers.values()];
      pinchPrevDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const curr = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, curr);

    if (selectedId || isAnimating()) return;

    if (pointers.size === 1) {
      const dx = curr.x - prev.x, dy = curr.y - prev.y;
      if (tapStart && Math.hypot(curr.x - tapStart.x, curr.y - tapStart.y) > TAP_MOVE_TOLERANCE) tapStart = null;
      const dist = baseDistance * zoomFactor;
      const vFovHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
      const worldPerPixelY = (2 * Math.tan(vFovHalf) * dist) / canvas.clientHeight;
      const worldPerPixelX = worldPerPixelY * camera.aspect;
      panOffset.x = clamp(panOffset.x - dx * worldPerPixelX, -PAN_LIMIT_X, PAN_LIMIT_X);
      panOffset.z = clamp(panOffset.z - (dy * worldPerPixelY) / COS_TILT, -PAN_LIMIT_Z, PAN_LIMIT_Z);
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchPrevDist > 0) setZoomFactor(zoomFactor * (pinchPrevDist / d));
      pinchPrevDist = d;
    }
  });

  function endPointer(e) {
    if (pointers.size === 1 && tapStart && !selectedId && !isAnimating()) {
      const dt = performance.now() - tapStart.t;
      const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
      if (dt <= TAP_TIME_MAX * 3 && moved <= TAP_MOVE_TOLERANCE) {
        const hits = raycastRooms(e.clientX, e.clientY);
        if (hits.length) onRoomSelect(hits[0].object.userData.room);
      }
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchPrevDist = 0;
    if (pointers.size === 0) { tapStart = null; canvas.style.cursor = "grab"; }
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  /* ---- zoom con rueda del mouse / trackpad ---- */
  canvas.addEventListener("wheel", (e) => {
    if (selectedId || isAnimating()) return;
    e.preventDefault();
    setZoomFactor(zoomFactor * (1 + e.deltaY * 0.0012));
  }, { passive: false });
}


/* ============================== booking.js ============================== */
/* ======================================================================
   booking.js — Estado de selección de fecha/horario y confirmación de
   reservas. No toca el DOM directamente (eso lo hace panel.js); sólo
   mantiene el estado y aplica los efectos sobre el modelo de datos y
   la escena 3D.
   ====================================================================== */
const bookingState = {
  selDiaIdx: 0,
  selHorarioIdx: null,
};

function resetBookingSelection() {
  bookingState.selDiaIdx = 0;
  bookingState.selHorarioIdx = null;
}

function setDia(i) {
  bookingState.selDiaIdx = i;
  bookingState.selHorarioIdx = null;
}

function setHorario(i) {
  bookingState.selHorarioIdx = i;
}

/**
 * Confirma la reserva del horario actualmente seleccionado para `room`.
 * Marca el bloque como ocupado, refresca el color 3D de la sala y
 * regresa los datos de la confirmación para mostrarlos en el panel.
 */
function confirmReservation(room) {
  const { selDiaIdx, selHorarioIdx } = bookingState;
  if (selHorarioIdx === null) return null;
  const h = room.horariosPorDia[selDiaIdx][selHorarioIdx];
  if (h.ocupado) return null;
  h.ocupado = true;
  const fechaTxt = diaFechaLarga(selDiaIdx);
  const horaTxt = `${h.inicio} – ${h.fin}`;
  bookingState.selHorarioIdx = null;
  refreshRoomVisual(room, selectedId);
  applyRoomStatusLighting(room);
  return { fechaTxt, horaTxt };
}


/* ============================== panel.js ============================== */
/* ======================================================================
   panel.js — Panel lateral de detalle/reserva: fotografías (carrusel +
   pantalla completa), información, amenidades, calendario de horarios,
   botones de Reservar / Compartir / Contactar.
   ====================================================================== */
const panelEl = document.getElementById("panel");
let activeRoom = null;
let galleryIdx = 0;
let onCloseHandler = () => closePanel();

/* ---------- galería / carrusel ---------- */
function isImageUrl(src) {
  return /^https?:\/\//.test(src) || src.startsWith("/") || src.startsWith("data:") || /\.(jpe?g|png|webp|gif|avif)$/i.test(src);
}

function slideMarkup(src, icon) {
  if (isImageUrl(src)) return `<img src="${escapeHtml(src)}" alt="" loading="lazy">`;
  const hues = ["linear-gradient(135deg,#123249,#1d4a6b)", "linear-gradient(135deg,#1c2b3d,#123249)", "linear-gradient(135deg,#0d1420,#1c2b3d)"];
  const g = hues[galleryIdx % hues.length];
  return `<div class="gslide-fallback" style="background:${g}"><span>${icon}</span></div>`;
}

function galleryHtml(room) {
  const fotos = room.fotos?.length ? room.fotos : [room.icon];
  return `
    <div class="gallery" role="group" aria-label="Fotografías de ${escapeHtml(room.nombre)}">
      <div class="gmain" id="gmain" tabindex="0" role="button" aria-label="Ver en pantalla completa">
        ${slideMarkup(fotos[galleryIdx], room.icon)}
        ${fotos.length > 1 ? `
          <button class="gnav gprev" id="gprev" aria-label="Foto anterior">‹</button>
          <button class="gnav gnext" id="gnext" aria-label="Foto siguiente">›</button>
          <div class="gdots">${fotos.map((_, i) => `<span class="gdot ${i === galleryIdx ? 'sel' : ''}" data-i="${i}"></span>`).join("")}</div>
        ` : ""}
      </div>
      ${fotos.length > 1 ? `<div class="gthumbs">${fotos.map((f, i) => `<div class="gthumb ${i === galleryIdx ? 'sel' : ''}" data-i="${i}">${isImageUrl(f) ? `<img src="${escapeHtml(f)}" alt="">` : f}</div>`).join("")}</div>` : ""}
    </div>`;
}

function openLightbox(room) {
  const fotos = room.fotos?.length ? room.fotos : [room.icon];
  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `Fotografía de ${room.nombre} en pantalla completa`);
  overlay.innerHTML = `
    <button class="lb-close" aria-label="Cerrar">✕</button>
    <div class="lb-stage">${slideMarkup(fotos[galleryIdx], room.icon)}</div>
    <div class="lb-hint">Toca la imagen para acercar/alejar</div>
  `;
  document.body.appendChild(overlay);
  const stage = overlay.querySelector(".lb-stage");
  stage.addEventListener("click", () => stage.classList.toggle("zoomed"));
  const close = () => overlay.remove();
  overlay.querySelector(".lb-close").onclick = close;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
  overlay.querySelector(".lb-close").focus();
}

function wireGallery(room) {
  const fotos = room.fotos?.length ? room.fotos : [room.icon];
  const gmain = document.getElementById("gmain");
  if (gmain) {
    const openFs = () => openLightbox(room);
    gmain.onclick = openFs;
    gmain.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFs(); } };
  }
  document.getElementById("gprev")?.addEventListener("click", (e) => { e.stopPropagation(); galleryIdx = (galleryIdx - 1 + fotos.length) % fotos.length; renderPanel(room); });
  document.getElementById("gnext")?.addEventListener("click", (e) => { e.stopPropagation(); galleryIdx = (galleryIdx + 1) % fotos.length; renderPanel(room); });
  panelEl.querySelectorAll(".gdot, .gthumb").forEach(el => {
    el.addEventListener("click", (e) => { e.stopPropagation(); galleryIdx = parseInt(el.dataset.i); renderPanel(room); });
  });
}

/* ---------- amenidades ---------- */
function amenitiesHtml(room) {
  return Object.keys(AMENITY_DEFS).map(key => {
    const def = AMENITY_DEFS[key];
    const has = !!(room.amenities && room.amenities[key]);
    return `<span class="amenity ${has ? '' : 'off'}"><span class="ico" aria-hidden="true">${def.ico}</span>${def.label}</span>`;
  }).join("");
}

/* ---------- selector de día ---------- */
function daySelectorHtml() {
  return DAYS.map((_, i) => {
    const l = diaLabel(i);
    return `<button class="day-chip ${i === bookingState.selDiaIdx ? 'sel' : ''}" data-i="${i}" aria-pressed="${i === bookingState.selDiaIdx}">
      <span class="dname">${l.top}</span><span class="dnum">${l.num}</span>
    </button>`;
  }).join("");
}

/* ---------- badge de estado general ---------- */
function statusBadgeHtml(room) {
  const label = statusLabel(room);
  const color = "#" + statusColor(room).toString(16).padStart(6, "0");
  return `<span class="status-badge" style="--sc:${color}">${escapeHtml(label)}</span>`;
}

/* ---------- compartir / contactar ---------- */
async function shareRoom(room) {
  const shareData = {
    title: room.nombre,
    text: `${room.nombre} (${room.codigo}) — reserva este espacio en el centro de oficinas.`,
    url: location.href,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      flashMsg("Enlace copiado al portapapeles");
    }
  } catch { /* usuario canceló el share sheet: no hacer nada */ }
}

function flashMsg(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2200);
}

/* ---------- pago ---------- */
function openPaymentModal(room, h) {
  const total = room.precioHora;
  const overlay = document.createElement("div");
  overlay.className = "pay-overlay";
  overlay.innerHTML = `
    <div class="pay-box" role="dialog" aria-modal="true" aria-label="Pagar reserva">
      <button class="pay-close" id="payClose" aria-label="Cerrar">✕</button>
      <div class="pay-title">Pagar oficina</div>
      <div class="pay-sub">${room.icon} ${escapeHtml(room.nombre)} · ${h.inicio} – ${h.fin}</div>
      <div class="pay-total">${formatMXN(total)}</div>
      <form id="payForm">
        <label class="pay-label">Nombre en la tarjeta
          <input class="pay-input" id="payNombre" type="text" placeholder="Como aparece en la tarjeta" required>
        </label>
        <label class="pay-label">Número de tarjeta
          <input class="pay-input" id="payNumero" type="text" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" required>
        </label>
        <div class="pay-row">
          <label class="pay-label">Vencimiento
            <input class="pay-input" id="payExp" type="text" maxlength="5" placeholder="MM/AA" required>
          </label>
          <label class="pay-label">CVV
            <input class="pay-input" id="payCvv" type="text" inputmode="numeric" maxlength="4" placeholder="123" required>
          </label>
        </div>
        <button type="submit" class="btn-reservar" id="payBtn">Pagar ${formatMXN(total)} y reservar</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("show"));

  const cerrar = () => { overlay.classList.remove("show"); setTimeout(() => overlay.remove(), 200); };
  overlay.querySelector("#payClose").onclick = cerrar;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) cerrar(); });

  overlay.querySelector("#payNumero").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^\d]/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  });
  overlay.querySelector("#payExp").addEventListener("input", (e) => {
    let v = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
    e.target.value = v;
  });

  overlay.querySelector("#payForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = document.getElementById("payBtn");
    btn.disabled = true;
    btn.textContent = "Procesando pago…";
    setTimeout(() => {
      cerrar();
      const result = confirmReservation(room);
      if (!result) { flashMsg("Ese horario ya no está disponible"); renderPanel(room); return; }
      renderPanel(room);
      document.getElementById("confirmFecha").textContent = result.fechaTxt;
      document.getElementById("confirmHorario").textContent = result.horaTxt;
      document.getElementById("confirmMsg").classList.add("show");
      flashMsg("Pago aprobado · reserva confirmada");
      setTimeout(() => { document.getElementById("confirmMsg")?.classList.remove("show"); }, 4200);
    }, 900);
  });
}

function contactHtml() {
  return `
    <div class="contact-box">
      <div class="sec-title" style="margin:0 0 8px;">Contactar administración</div>
      <a class="contact-row" href="tel:${CONTACT_INFO.telefono.replace(/\s+/g, '')}">📞 ${escapeHtml(CONTACT_INFO.telefono)}</a>
      <a class="contact-row" href="mailto:${CONTACT_INFO.email}">✉️ ${escapeHtml(CONTACT_INFO.email)}</a>
    </div>`;
}

/* ---------- render principal ---------- */
function openPanel(room, onClose, focusCloseBtn = true) {
  activeRoom = room;
  galleryIdx = 0;
  onCloseHandler = onClose || (() => closePanel());
  resetBookingSelection();
  renderPanel(room);
  panelEl.classList.add("open");
  if (focusCloseBtn) requestAnimationFrame(() => document.getElementById("closePanelBtn")?.focus());
}
function closePanel() { panelEl.classList.remove("open"); activeRoom = null; }
function getActiveRoom() { return activeRoom; }

function renderPanel(room) {
  let body = "";
  let contactVisible = false;

  if (room.bookable) {
    const dia = room.horariosPorDia[bookingState.selDiaIdx];
    const horariosHtml = dia.map((h, i) => `
      <button class="horario-item ${h.ocupado ? 'ocupado' : ''} ${i === bookingState.selHorarioIdx ? 'sel' : ''}" data-i="${i}" ${h.ocupado ? 'disabled aria-disabled="true"' : ''}>
        <span class="horario-hora">${h.inicio} – ${h.fin}</span>
        <span class="badge ${h.ocupado ? 'badge-ocupado' : 'badge-libre'}">${h.ocupado ? 'Reservado' : 'Libre'}</span>
      </button>`).join("");

    const isDisabledState = room.estado === STATUS.MANTENIMIENTO.id || room.estado === STATUS.PROXIMAMENTE.id;

    body = `
      <div class="fila-cap">
        <div class="cell"><span class="k">Capacidad</span><span class="v">${room.capacidad} personas</span></div>
        <div class="cell"><span class="k">Precio/hora</span><span class="v">${formatMXN(room.precioHora)}</span></div>
        <div class="cell"><span class="k">Precio/día</span><span class="v">${formatMXN(room.precioDia)}</span></div>
      </div>
      ${isDisabledState ? `<div class="no-book">Este espacio está marcado como <strong>${escapeHtml(statusLabel(room))}</strong> y no admite reservas por ahora.</div>` : `
      <div class="sec-title">Elige un día</div>
      <div class="day-selector" role="tablist" aria-label="Selecciona un día">${daySelectorHtml()}</div>
      <div class="sec-title">Horarios disponibles (bloques de 2 h)</div>
      <div class="horarios" role="group" aria-label="Horarios disponibles">${horariosHtml}</div>
      <button class="btn-reservar" id="btnReservar" disabled>Selecciona un horario</button>
      <div class="summary-box" id="confirmMsg" role="status">
        <div class="stitle">✅ Reserva confirmada</div>
        <div class="srow"><span class="k">Sala</span><span>${room.icon} ${escapeHtml(room.nombre)}</span></div>
        <div class="srow"><span class="k">Fecha</span><span id="confirmFecha"></span></div>
        <div class="srow"><span class="k">Horario</span><span id="confirmHorario"></span></div>
      </div>`}
    `;
  } else {
    body = `<div class="no-book">Este espacio es de uso común o de servicio y no está disponible para reservar.</div>`;
    contactVisible = true;
  }

  panelEl.innerHTML = `
    <div class="panel-top">
      <div>
        <span class="panel-code">${escapeHtml(room.codigo)}</span>
        <div class="panel-title">${room.icon}&nbsp; ${escapeHtml(room.nombre)}</div>
        ${room.bookable ? statusBadgeHtml(room) : ""}
      </div>
      <button class="closeX" id="closePanelBtn" aria-label="Cerrar panel">✕</button>
    </div>
    ${galleryHtml(room)}
    <div class="panel-desc">${escapeHtml(room.desc)}</div>
    ${room.bookable ? `<div class="amenities">${amenitiesHtml(room)}</div>` : ""}
    ${body}
    <div class="panel-actions">
      <button class="btn-ghost" id="btnShare">🔗 Compartir</button>
      <button class="btn-ghost" id="btnContact">💬 Contactar</button>
    </div>
    ${contactVisible ? contactHtml() : ""}
  `;

  document.getElementById("closePanelBtn").onclick = () => onCloseHandler();
  document.getElementById("btnShare").onclick = () => shareRoom(room);
  document.getElementById("btnContact").onclick = () => {
    const existing = panelEl.querySelector(".contact-box");
    if (existing) { existing.remove(); return; }
    panelEl.insertAdjacentHTML("beforeend", contactHtml());
  };

  wireGallery(room);

  if (room.bookable && room.estado === STATUS.DISPONIBLE.id) {
    panelEl.querySelectorAll(".day-chip").forEach(chip => {
      chip.onclick = () => { setDia(parseInt(chip.dataset.i)); renderPanel(room); };
    });
    panelEl.querySelectorAll(".horario-item:not(.ocupado)").forEach(item => {
      item.onclick = () => {
        setHorario(parseInt(item.dataset.i));
        renderPanel(room);
        const h = room.horariosPorDia[bookingState.selDiaIdx][bookingState.selHorarioIdx];
        const btn = document.getElementById("btnReservar");
        btn.disabled = false;
        btn.textContent = `Reservar ${h.inicio} – ${h.fin} · ${formatMXN(room.precioHora)}`;
      };
    });
    const btn = document.getElementById("btnReservar");
    if (btn) {
      btn.onclick = () => {
        const { selDiaIdx, selHorarioIdx } = bookingState;
        if (selHorarioIdx === null) return;
        const h = room.horariosPorDia[selDiaIdx][selHorarioIdx];
        openPaymentModal(room, h);
      };
    }
  }
}


/* ============================== search.js ============================== */
/* ======================================================================
   search.js — Buscador inteligente de espacios (por nombre o código).
   ====================================================================== */
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

function dotColorFor(room) {
  const lvl = availabilityLevel(room);
  return lvl === "green" ? "var(--ok)" : lvl === "yellow" ? "var(--warm)" : lvl === "red" ? "var(--taken)" : "var(--text-dim)";
}

function renderSearchResults(query, onSelect) {
  const q = query.trim();
  if (!q) { searchResults.classList.remove("show"); searchResults.innerHTML = ""; return; }
  const matches = searchRooms(q);

  if (!matches.length) {
    searchResults.innerHTML = `<div class="sres-empty">Sin resultados para "${escapeHtml(query)}"</div>`;
  } else {
    searchResults.innerHTML = matches.map(r => `
      <div class="sres-item" data-id="${r.id}" role="option" tabindex="0">
        <span aria-hidden="true">${r.icon}</span>
        <span class="sname">${escapeHtml(r.nombre)}</span>
        <span class="dot" style="width:8px;height:8px;border-radius:50%;background:${dotColorFor(r)};flex-shrink:0;" aria-hidden="true"></span>
        <span class="scode">${escapeHtml(r.codigo)}</span>
      </div>`).join("");

    const pick = (id) => {
      const room = matches.find(r => r.id === id);
      if (!room) return;
      onSelect(room);
      searchInput.value = "";
      searchResults.classList.remove("show");
      searchInput.blur();
    };
    searchResults.querySelectorAll(".sres-item").forEach(item => {
      item.onclick = () => pick(item.dataset.id);
      item.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(item.dataset.id); } };
    });
  }
  searchResults.classList.add("show");
  searchInput.setAttribute("aria-expanded", "true");
}

function initSearch(onSelect) {
  searchInput.addEventListener("input", () => renderSearchResults(searchInput.value, onSelect));
  searchInput.addEventListener("focus", () => { if (searchInput.value.trim()) renderSearchResults(searchInput.value, onSelect); });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#searchWrap")) {
      searchResults.classList.remove("show");
      searchInput.setAttribute("aria-expanded", "false");
    }
  });
}


/* ============================== ui.js ============================== */
/* ======================================================================
   ui.js — Elementos de interfaz que no pertenecen al panel ni al mapa:
   redimensionado responsivo, botón "Restablecer vista", botón flotante
   "Volver al mapa" y el aviso (hint) de arrastrar/zoom.
   ====================================================================== */
const wrap = document.getElementById("canvas-wrap");
const hintEl = document.getElementById("hint");
const floatBackBtn = document.getElementById("floatBack");
const resetBtn = document.getElementById("resetViewBtn");

function resize() {
  const w = wrap.clientWidth || innerWidth;
  const h = wrap.clientHeight || innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, true);
  setBaseDistance(fitDistance(camera.aspect));
  if (!selectedId && !isAnimating()) updateOverviewCamera(true);
}

function showFocusedUI() {
  hintEl.classList.add("hide");
  floatBackBtn.classList.add("show");
}
function showOverviewUI() {
  hintEl.classList.remove("hide");
  floatBackBtn.classList.remove("show");
}

function initUI({ onReset }) {
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 250));
  if (window.visualViewport) visualViewport.addEventListener("resize", resize);
  new ResizeObserver(resize).observe(wrap);
  resize();

  floatBackBtn.addEventListener("click", onReset);
  resetBtn.addEventListener("click", () => {
    resetBtn.classList.add("spin");
    setTimeout(() => resetBtn.classList.remove("spin"), 650);
    onReset();
  });

  /* accesibilidad: permitir foco visible con teclado (Tab) en el canvas
     no aplica directamente porque la selección es por raycasting con
     mouse/touch; se ofrece el buscador como vía de navegación por teclado. */
  canvas.setAttribute("aria-hidden", "true");
}


/* ============================== main.js ============================== */
/* ======================================================================
   main.js — Punto de entrada. Conecta los módulos (que no se conocen
   entre sí directamente) mediante callbacks/hooks, y arranca el loop
   de render.
   ====================================================================== */
/* ---------- selección de una sala (desde el mapa o el buscador) ---------- */
function selectRoom(room) {
  focusRoom(room, {
    flyTo,
    onLeaveRoom: (prevId) => clearRoomStatusLighting(prevId),
    onFocus: (r) => {
      applyRoomStatusLighting(r);
      showFocusedUI();
      openPanel(r, goToOverview);
    },
  });
}

function goToOverview() {
  resetView({
    flyTo,
    onLeaveRoom: (prevId) => clearRoomStatusLighting(prevId),
    onReset: () => {
      showOverviewUI();
      closePanel();
    },
  });
}

initControls(selectRoom);
initSearch(selectRoom);
initUI({ onReset: goToOverview });

/* ---------- loop de render ---------- */
function animate(now) {
  requestAnimationFrame(animate);
  tickCameraAnim(now);
  if (!isAnimating() && !selectedId) updateOverviewCamera(false);
  tickSelectedPulse(now);
  roomMeshes.forEach(m => m.userData.edges.position.copy(m.position));
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
