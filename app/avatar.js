// ---------- Zuvori avatar engine ----------
// Wrapped in (function () { ... })(); so its names can't clash with other files
(function () {
  // ----- Option lists (the controls screen will use these in Step 19) -----
  const SK = [["#f3d2b3", "#e0b78f"], ["#e0b08a", "#c9946b"], ["#c08a62", "#a5714a"],
              ["#9a6a46", "#82563a"], ["#7a4a32", "#633a27"], ["#5a3425", "#472a1d"]]; // [skin, shadow]
  const HC = ["#14110f", "#4a2b1a", "#b5651d", "#D4203A", "#cfcfcf"];
  const PAL = ["#D4203A", "#14110f", "#B6F23C", "#FFC93C", "#3b4a8c", "#F5F3F1"];
  const BG = ["#F9D9DE", "#E3E8F5", "#FFF0CC", "#DCEFD9"];
  const BODY = [
    { n: "Slim",     sw: 32, ww: 24, hw: 27, lw: 11, aw: 14 },
    { n: "Average",  sw: 36, ww: 29, hw: 32, lw: 13, aw: 15 },
    { n: "Athletic", sw: 46, ww: 31, hw: 34, lw: 15, aw: 19 },
    { n: "Curvy",    sw: 38, ww: 30, hw: 43, lw: 16, aw: 16 },
    { n: "Fuller",   sw: 46, ww: 44, hw: 47, lw: 17, aw: 20 },
  ]; // sw=shoulders, ww=waist, hw=hips, lw=leg width, aw=arm width
  const HAIRS = ["Afro", "Fade", "Waves", "Braids", "Locs", "Puffs", "Bun", "Shaved"];
  const TOPS = ["Hoodie", "Tee", "Singlet", "Sports bra", "Track jacket", "Ankara top", "Blazer", "Kaftan"];
  const BOTS = ["Joggers", "Shorts", "Leggings", "Wrapper", "Trousers"];
  const FEAT = ["None", "Freckles", "Beauty mark", "Vitiligo"];
  const BEARD = ["None", "Stubble", "Beard", "Moustache"];
  const FACES = ["Smile", "Grin", "Cool"];
  const JAWS = ["Soft", "Round", "Angular"];
  const LIPS = ["Full", "Medium", "Thin"];
  const JAWPATH = [ // the head outline for each jaw shape
    "M76 88 Q76 34 120 34 Q164 34 164 88 Q164 142 120 144 Q76 142 76 88Z",
    "M75 88 Q75 34 120 34 Q165 34 165 88 Q165 146 120 148 Q75 146 75 88Z",
    "M77 88 Q77 34 120 34 Q163 34 163 88 L158 118 Q150 138 120 146 Q90 138 82 118Z",
  ];

  // A character is just a set of choices. Each number is a position in the lists above
  const DEFAULT = {
    lash: false,
    jaw: 0, lips: 0,
    body: 1, skin: 3, feat: 0, beard: 0, face: 0, hair: 0, hc: 0,
    top: 0, tc: 0, bot: 0, bc: 1, bg: 0,
    eyes: 1, gap: 1,
    glasses: false, hoops: true, pods: false, wrap: false, cap: false, watch: false,
  };

  // ----- Small drawing helpers -----
  const P = (pts) => pts.map((p) => p[0] + "," + p[1]).join(" ");
  const poly = (pts, fill) => '<polygon points="' + pts + '" fill="' + fill + '"/>';
  const dots = (list, fill) =>
    list.map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.4" fill="' + fill + '"/>').join("");

  // Half-width of the torso at height y (shoulders -> waist -> hips)
  function xAt(B, y) {
    return y <= 225 ? B.sw + (B.ww - B.sw) * (y - 178) / 47
                    : B.ww + (B.hw - B.ww) * (y - 225) / 37;
  }
  // The torso shape from the shoulders down to height e (ins = shrink it a little)
  function sl(B, e, ins) {
    ins = ins || 0;
    const ys = [178, 200, 225].filter((y) => y < e).concat([e]);
    const l = ys.map((y) => [120 - xAt(B, y) + ins, y]);
    const r = ys.map((y) => [120 + xAt(B, y) - ins, y]).reverse();
    return P([[120 - B.sw + 8 + ins, 167]].concat(l, r, [[120 + B.sw - 8 - ins, 167]]));
  }
  // A leg (s = -1 left, 1 right) between heights y1 and y2
  function lg(B, s, y1, y2, w) {
    w = w || 0;
    const to = 120 + s * B.hw, ti = 120 + s * 2, bcx = 120 + s * (B.hw / 2 + 1);
    const bo = bcx + s * B.lw * 0.85, bi = bcx - s * B.lw * 0.85;
    const f = (a, b, y) => a + (b - a) * (y - 258) / 104;
    return P([[f(to, bo, y1) + s * w, y1], [f(ti, bi, y1), y1], [f(ti, bi, y2), y2], [f(to, bo, y2) + s * w, y2]]);
  }
  // Arms: start and end points, and a line for the arm or sleeve
  function arm(B, s, f) {
    const x1 = 120 + s * (B.sw - 3), y1 = 182, x2 = 120 + s * (B.sw + 9), y2 = 250;
    return [x1, y1, x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
  }
  function al(B, s, f, col, ex) {
    const a = arm(B, s, f);
    return '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + a[2] + '" y2="' + a[3] +
      '" stroke="' + col + '" stroke-width="' + (B.aw + (ex || 0)) + '" stroke-linecap="round"/>';
  }

  // ----- Hair -----
  function hairBack(h, c) {
    const r = (x, y, w, hh) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" rx="' + (w / 2) + '" fill="' + c + '"/>';
    if (h === 0) return '<circle cx="120" cy="74" r="68" fill="' + c + '"/>';
    if (h === 2) return '<path d="M68 100 Q56 190 76 232 L164 232 Q184 190 172 100 Q164 30 120 28 Q76 30 68 100Z" fill="' + c + '"/>';
    if (h === 3) return r(58, 88, 12, 150) + r(71, 88, 12, 140) + r(157, 88, 12, 140) + r(170, 88, 12, 150);
    if (h === 4) return r(56, 80, 13, 170) + r(68, 80, 13, 150) + r(80, 80, 13, 120) + r(147, 80, 13, 120) + r(159, 80, 13, 150) + r(171, 80, 13, 170);
    if (h === 5) return '<circle cx="84" cy="50" r="26" fill="' + c + '"/><circle cx="156" cy="50" r="26" fill="' + c + '"/>';
    if (h === 6) return '<circle cx="120" cy="26" r="22" fill="' + c + '"/>';
    return "";
  }
  const HF = [
    "M77 88 Q78 48 120 44 Q162 48 163 88 Q148 62 120 62 Q92 62 77 88Z",
    "M76 90 Q70 36 120 32 Q170 36 164 90 Q156 60 120 58 Q84 60 76 90Z",
    "M77 90 Q84 46 126 44 Q164 48 163 90 Q146 60 106 70 Q88 74 77 90Z",
    "M76 92 Q70 32 120 28 Q170 32 164 92 Q154 58 120 56 Q86 58 76 92Z",
    "M76 92 Q70 34 120 30 Q170 34 164 92 Q154 60 120 58 Q86 60 76 92Z",
    "M76 90 Q70 36 120 32 Q170 36 164 90 Q156 60 120 58 Q84 60 76 90Z",
    "M76 90 Q70 36 120 32 Q170 36 164 90 Q156 60 120 58 Q84 60 76 90Z",
    "M78 88 Q82 54 120 52 Q158 54 162 88 Q148 72 120 72 Q92 72 78 88Z",
  ];
  function hairFront(h, c) {
    let s = '<path d="' + HF[h] + '" fill="' + c + '"' + (h === 7 ? ' fill-opacity=".4"' : "") + "/>";
    if (h === 4) {
      s += '<rect x="60" y="84" width="12" height="124" rx="6" fill="' + c + '"/><rect x="168" y="84" width="12" height="124" rx="6" fill="' + c + '"/>' +
        '<line x1="66" y1="96" x2="66" y2="198" stroke="#fff" stroke-opacity=".18" stroke-width="2" stroke-dasharray="3 7"/>' +
        '<line x1="174" y1="96" x2="174" y2="198" stroke="#fff" stroke-opacity=".18" stroke-width="2" stroke-dasharray="3 7"/>';
    }
    if (h !== 7) s += '<path d="M92 50 Q120 40 148 50" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="4" stroke-linecap="round"/>';
    return s;
  }

  // ----- Tops: returns [the garment, the sleeves] -----
  function tops(t, B, sk, c) {
    const scoop = '<path d="M106 166 Q120 190 134 166Z" fill="' + sk[0] + '"/>';
    const pattern = [[108, 192], [132, 200], [112, 214], [130, 226], [100, 230], [140, 184]];
    const shortSleeves = al(B, -1, 0.38, c, 4) + al(B, 1, 0.38, c, 4);
    const longSleeves = al(B, -1, 0.92, c, 3) + al(B, 1, 0.92, c, 3);
    let o = "", sv = "";
    if (t === 0) { // Hoodie
      o = poly(sl(B, 262), c) +
        '<path d="M92 168 Q120 200 148 168 Q140 158 120 158 Q100 158 92 168Z" fill="' + c + '"/>' +
        '<path d="M92 168 Q120 200 148 168 Q140 158 120 158 Q100 158 92 168Z" fill="#000" fill-opacity=".22"/>' +
        '<rect x="100" y="238" width="40" height="16" rx="7" fill="#000" fill-opacity=".16"/>' +
        '<line x1="112" y1="182" x2="111" y2="208" stroke="#F5F3F1" stroke-width="3" stroke-linecap="round"/>' +
        '<line x1="128" y1="182" x2="129" y2="208" stroke="#F5F3F1" stroke-width="3" stroke-linecap="round"/>';
      sv = longSleeves;
    }
    if (t === 1) { // Tee
      o = poly(sl(B, 262), c) + scoop + '<path d="M106 166 Q120 190 134 166" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="3"/>';
      sv = shortSleeves;
    }
    if (t === 2) { // Singlet: straps and armholes at the top, then it follows the body to the hem
      const e = (y) => xAt(B, y);
      const d = "M98 166 Q98 192 " + (120 - e(206)) + " 206 L" + (120 - e(225)) + " 225 L" + (120 - e(262)) + " 262 " +
        "L" + (120 + e(262)) + " 262 L" + (120 + e(225)) + " 225 L" + (120 + e(206)) + " 206 " +
        "Q142 192 142 166 L132 166 Q120 202 108 166 Z";
      o = '<path d="' + d + '" fill="' + c + '"/>';
    }
   if (t === 3) { // Sports bra: straps, armholes, then it follows the body down to a band
      const e = (y) => xAt(B, y);
      const d = "M98 166 Q98 188 " + (120 - e(196)) + " 196 L" + (120 - e(206)) + " 206 " +
        "L" + (120 + e(206)) + " 206 L" + (120 + e(196)) + " 196 Q142 188 142 166 " +
        "L132 166 Q120 192 108 166 Z";
      o = '<path d="' + d + '" fill="' + c + '"/>' +
        '<path d="M' + (120 - e(200)) + " 200 L" + (120 + e(200)) + " 200 L" + (120 + e(206)) + " 206 L" + (120 - e(206)) +
        ' 206Z" fill="#000" fill-opacity=".2"/>';
    }
    if (t === 4) { // Track jacket
      o = poly(sl(B, 262), c) + '<line x1="120" y1="176" x2="120" y2="262" stroke="#F5F3F1" stroke-width="3"/>' +
        '<path d="M104 166 L120 180 L136 166 L134 158 L120 170 L106 158Z" fill="' + c + '"/>' +
        '<path d="M104 166 L120 180 L136 166 L134 158 L120 170 L106 158Z" fill="#000" fill-opacity=".2"/>';
      sv = longSleeves + al(B, -1, 0.9, "#F5F3F1", -10) + al(B, 1, 0.9, "#F5F3F1", -10);
    }
    if (t === 5) { o = poly(sl(B, 240), c) + dots(pattern, "#FFC93C") + scoop; sv = shortSleeves; } // Ankara top
    if (t === 6) { // Blazer
      o = poly(sl(B, 262), c) + poly(P([[108, 166], [132, 166], [120, 214]]), "#F5F3F1") +
        poly(P([[108, 166], [120, 214], [104, 238], [94, 180]]), "#000") +
        poly(P([[132, 166], [120, 214], [136, 238], [146, 180]]), "#000") +
        '<circle cx="120" cy="240" r="3" fill="#FFC93C"/>';
      o = o.replace(/fill="#000"/g, 'fill="#000" fill-opacity=".28"');
      sv = longSleeves;
    }
    if (t === 7) { // Kaftan
      o = poly(P([[120 - B.sw + 8, 167], [120 - B.sw, 176], [120 - B.hw - 14, 318], [120 + B.hw + 14, 318], [120 + B.sw, 176], [120 + B.sw - 8, 167]]), c) +
        '<line x1="' + (120 - B.hw - 12) + '" y1="313" x2="' + (120 + B.hw + 12) + '" y2="313" stroke="#FFC93C" stroke-width="4"/>' +
        '<path d="M104 166 Q120 196 136 166Z" fill="' + sk[0] + '" stroke="#FFC93C" stroke-width="3" stroke-linejoin="round"/>';
      sv = al(B, -1, 0.7, c, 10) + al(B, 1, 0.7, c, 10);
    }
    return [o, sv];
  }

  // ----- Bottoms -----
  function bottoms(b, B, c) {
    const shade = (p) => poly(p, "#000").replace('fill="#000"', 'fill="#000" fill-opacity=".22"');
    if (b === 0) return poly(lg(B, -1, 258, 362), c) + poly(lg(B, 1, 258, 362), c) + shade(lg(B, -1, 346, 362, 1)) + shade(lg(B, 1, 346, 362, 1)); // Joggers
    if (b === 1) return poly(lg(B, -1, 258, 312, 3), c) + poly(lg(B, 1, 258, 312, 3), c); // Shorts
    if (b === 2) return poly(lg(B, -1, 258, 362), c) + poly(lg(B, 1, 258, 362), c);       // Leggings
    if (b === 3) return poly(P([[120 - B.ww - 2, 246], [120 + B.ww + 2, 246], [120 + B.hw + 16, 318], [120 - B.hw - 16, 318]]), c) + // Wrapper
      dots([[100, 268], [120, 282], [140, 268], [92, 298], [120, 306], [148, 298], [106, 290], [134, 290]], c === "#FFC93C" ? "#F5F3F1" : "#FFC93C");
    return poly(lg(B, -1, 258, 362, 3), c) + poly(lg(B, 1, 258, 362, 3), c);             // Trousers
  }

  // ----- Face -----
  
  // ----- Face (eyes, brows, nose, lips) -----
  function face(sk, hc, cfg) {
    const O = "#2a1810", fc = cfg.face;
    const brow = hc === "#cfcfcf" ? "#8a8a8a" : hc;
    const tilt = fc === 2 ? 3 : 0;      // "Cool" brows sit lower
    const bw = fc === 2 ? 5.5 : 4.5;    // and a little thicker
    const k = [0.85, 1, 1.15][cfg.eyes ?? 1];   // eye size
    const dx = [2, 0, -3][cfg.gap ?? 1];        // eye spacing

    const lashes = cfg.lash
      ? '<path d="M-27 -4 L-32 -8 M-25 -8 L-29 -13 M-21 -10 L-23 -15" stroke="' + O + '" stroke-width="1.8" stroke-linecap="round" fill="none"/>'
      : "";
    // "Cool" gets heavy eyelids
    const lid = fc === 2
      ? '<path d="M-27 -4 Q-16 -14 -4 -5 L-4 -8 Q-16 -9 -27 -7Z" fill="' + sk[0] + '"/>' +
        '<path d="M-27 -7 L-4 -8" stroke="' + O + '" stroke-width="2.6" stroke-linecap="round"/>'
      : "";

    // Draw the left eye, then flip it (scale -1) to make the right one
    const eye = (side) =>
      '<g transform="scale(' + side + ',1) translate(' + dx + ',0) translate(-15,-6) scale(' + k + ') translate(15,6)">' +
      '<path d="M-27 -4 Q-16 -14 -4 -5 Q-16 0 -27 -4Z" fill="#fff" stroke="' + O + '" stroke-width="1.2"/>' +
      '<circle cx="-14" cy="-6" r="4.6" fill="#2a1810"/><circle cx="-12.5" cy="-7.6" r="1.4" fill="#fff"/>' +
      lid +
      '<path d="M-28 -5 Q-16 -16 -3 -6" fill="none" stroke="' + O + '" stroke-width="3" stroke-linecap="round"/>' +
      lashes +
      '<path d="M-30 ' + (-17 + tilt) + ' Q-17 ' + (-26 + tilt) + ' -5 -19" fill="none" stroke="' + brow + '" stroke-width="' + bw + '" stroke-linecap="round"/>' +
      "</g>";

    const nose =
      '<ellipse cx="0" cy="14" rx="6" ry="3" fill="' + sk[1] + '" fill-opacity=".5"/>' +
      '<path d="M-8 17 Q0 22 8 17" fill="none" stroke="' + O + '" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M-3 4 Q-5 12 -7 15" fill="none" stroke="' + sk[1] + '" stroke-width="2" stroke-linecap="round"/>';

    const U = "#a8454f", L = "#c9626e"; // upper and lower lip colours
    let lips;
    if (fc === 0) { // Smile
      lips = '<path d="M-13 26 Q-6 23 0 26 Q6 23 13 26 Q0 32 -13 26Z" fill="' + U + '" stroke="' + O + '" stroke-width="1.2"/>' +
        '<path d="M-13 26 Q0 33 13 26 Q9 39 0 39 Q-9 39 -13 26Z" fill="' + L + '" stroke="' + O + '" stroke-width="1.2"/>' +
        '<ellipse cx="0" cy="34" rx="3.5" ry="1.4" fill="#fff" fill-opacity=".5"/>';
    } else if (fc === 1) { // Grin
      lips = '<path d="M-14 25 Q0 30 14 25 Q10 42 0 42 Q-10 42 -14 25Z" fill="#5a1f26" stroke="' + O + '" stroke-width="1.4"/>' +
        '<path d="M-12 26 Q0 31 12 26 L11 31 Q0 35 -11 31Z" fill="#fff"/>';
    } else { // Cool (small smirk)
      lips = '<path d="M-12 29 Q-6 25 0 28 Q6 24 13 26 Q0 32 -12 29Z" fill="' + U + '" stroke="' + O + '" stroke-width="1.2"/>' +
        '<path d="M-12 29 Q0 32 13 26 Q8 38 0 39 Q-8 38 -12 29Z" fill="' + L + '" stroke="' + O + '" stroke-width="1.2"/>' +
        '<ellipse cx="1" cy="34" rx="3.2" ry="1.3" fill="#fff" fill-opacity=".5"/>';
    }
    // The face was drawn around (0,0), so move it onto the head and enlarge it slightly

    const squash = [1, 0.8, 0.62][cfg.lips || 0]; // thinner lips = squash them vertically
    const lipsG = '<g transform="translate(0 32) scale(1 ' + squash + ') translate(0 -32)">' + lips + "</g>";
    return '<g transform="translate(120,92) scale(1.1)">' + '<g class="zv-eyes">' + eye(1) + eye(-1) + "</g>" + nose + lipsG + "</g>";
   
  }

  // ----- Put it all together: config in, SVG picture out -----
  function build(cfg) {
    const B = BODY[cfg.body], sk = SK[cfg.skin], hc = HC[cfg.hc], tc = PAL[cfg.tc], bc = PAL[cfg.bc];
    let s = '<svg width="100%" viewBox="0 0 240 400" role="img"><title>Your Zuvori character</title>' +
      '<rect width="240" height="400" rx="24" fill="' + BG[cfg.bg] + '"/>' +
      '<ellipse cx="120" cy="384" rx="70" ry="7" fill="#000" fill-opacity=".12"/>';
    s += '<g class="zv-char">';
    s += hairBack(cfg.hair, hc);
    s += poly(lg(B, -1, 258, 362), sk[0]) + poly(lg(B, 1, 258, 362), sk[0]);
    s += bottoms(cfg.bot, B, bc);

    [-1, 1].forEach((d) => { // shoes
      const cx = 120 + d * (B.hw / 2 + 1) + d * 3, rx = B.lw * 1.1 + 8;
      s += '<ellipse cx="' + cx + '" cy="379" rx="' + rx + '" ry="4" fill="#14110f" fill-opacity=".85"/>' +
        '<ellipse cx="' + cx + '" cy="372" rx="' + rx + '" ry="9" fill="#F5F3F1"/>' +
        '<path d="M' + (cx - 6) + ' 372 L' + (cx + 6) + ' 372" stroke="#D4203A" stroke-width="3" stroke-linecap="round"/>';
    });

    s += poly(sl(B, 262), sk[0]); // bare torso
    [-1, 1].forEach((d) => { // bare arms and hands
      s += al(B, d, 1, sk[0], 0);
      const a = arm(B, d, 1);
      s += '<circle cx="' + a[2] + '" cy="' + a[3] + '" r="' + (B.aw / 2 + 1.5) + '" fill="' + sk[0] + '"/>';
    });
    s += '<rect x="108" y="136" width="24" height="40" rx="10" fill="' + sk[0] + '"/>' +
      '<path d="M108 156 Q120 170 132 156 L132 146 L108 146Z" fill="' + sk[1] + '"/>';

    const t = tops(cfg.top, B, sk, tc);
    s += t[0] + t[1];
    if (cfg.watch) {
      const w = arm(B, -1, 0.93);
      s += '<rect x="' + (w[2] - 10) + '" y="' + (w[3] - 9) + '" width="20" height="9" rx="3" fill="#14110f"/>' +
        '<rect x="' + (w[2] - 4) + '" y="' + (w[3] - 7) + '" width="8" height="5" rx="1.5" fill="#B6F23C"/>';
    }

    // Head
    s += '<ellipse cx="75" cy="98" rx="8" ry="12" fill="' + sk[0] + '"/><ellipse cx="165" cy="98" rx="8" ry="12" fill="' + sk[0] + '"/>' +
      '<path d="' + JAWPATH[cfg.jaw || 0] + '" fill="' + sk[0] + '"/>'

    if (cfg.feat === 1) s += '<g fill="#5a3425" fill-opacity=".55"><circle cx="96" cy="106" r="1.5"/><circle cx="102" cy="110" r="1.5"/><circle cx="108" cy="106" r="1.5"/><circle cx="132" cy="106" r="1.5"/><circle cx="138" cy="110" r="1.5"/><circle cx="144" cy="106" r="1.5"/><circle cx="118" cy="104" r="1.4"/><circle cx="123" cy="106" r="1.4"/></g>';
    if (cfg.feat === 2) s += '<circle cx="143" cy="120" r="2.4" fill="#3a2218"/>';
    if (cfg.feat === 3) {
      const pc = cfg.skin < 2 ? sk[1] : "#f7e3d0";
      s += '<g fill="' + pc + '" fill-opacity=".9"><ellipse cx="90" cy="110" rx="9" ry="6" transform="rotate(-20 90 110)"/><ellipse cx="148" cy="124" rx="7" ry="9"/><ellipse cx="118" cy="136" rx="9" ry="5"/><ellipse cx="124" cy="50" rx="8" ry="5"/></g>';
    }
    if (cfg.beard === 1) s += '<path d="M80 100 Q82 144 120 146 Q158 144 160 100 Q150 128 120 130 Q90 128 80 100Z" fill="' + hc + '" fill-opacity=".3"/>';
    if (cfg.beard === 2) s += '<path d="M78 96 Q78 154 120 156 Q162 154 162 96 Q152 120 138 118 Q120 112 102 118 Q88 120 78 96Z" fill="' + hc + '"/>';
    if (cfg.beard === 3) s += '<path d="M102 118 Q120 110 138 118 Q132 126 120 122 Q108 126 102 118Z" fill="' + hc + '"/>';

    s += face(sk, hc, cfg);
    s += hairFront(cfg.hair, hc);

    // Accessories
    if (cfg.glasses) s += '<circle cx="103" cy="92" r="13" fill="none" stroke="#14110f" stroke-width="3"/><circle cx="137" cy="92" r="13" fill="none" stroke="#14110f" stroke-width="3"/><line x1="116" y1="92" x2="124" y2="92" stroke="#14110f" stroke-width="3"/><line x1="90" y1="90" x2="78" y2="88" stroke="#14110f" stroke-width="3"/><line x1="150" y1="90" x2="162" y2="88" stroke="#14110f" stroke-width="3"/>';
    if (cfg.hoops) s += '<circle cx="75" cy="116" r="7" fill="none" stroke="#FFC93C" stroke-width="3"/><circle cx="165" cy="116" r="7" fill="none" stroke="#FFC93C" stroke-width="3"/>';
    if (cfg.pods) s += '<ellipse cx="74" cy="102" rx="4" ry="6" fill="#F5F3F1"/><line x1="74" y1="106" x2="74" y2="116" stroke="#F5F3F1" stroke-width="3" stroke-linecap="round"/><ellipse cx="166" cy="102" rx="4" ry="6" fill="#F5F3F1"/><line x1="166" y1="106" x2="166" y2="116" stroke="#F5F3F1" stroke-width="3" stroke-linecap="round"/>';
    if (cfg.wrap) s += '<ellipse cx="120" cy="50" rx="56" ry="22" fill="#FFC93C"/><ellipse cx="146" cy="30" rx="30" ry="17" fill="#D4203A"/><path d="M68 54 Q120 78 172 54" fill="none" stroke="#D4203A" stroke-width="4" stroke-linecap="round"/>';
    if (cfg.cap) s += '<path d="M76 62 Q78 22 120 20 Q162 22 164 62Z" fill="' + tc + '"/><path d="M76 62 Q78 22 120 20 Q162 22 164 62Z" fill="#000" fill-opacity=".12"/><path d="M70 64 Q120 54 176 64 Q176 72 120 70 Q70 72 70 64Z" fill="' + tc + '"/><path d="M70 64 Q120 54 176 64 Q176 72 120 70 Q70 72 70 64Z" fill="#000" fill-opacity=".3"/>';
    return s + "</g></svg>";

    }

  // Ready-made starting points (anything not listed falls back to DEFAULT)
  const PRESETS = [
    { name: "Locs & hoodie", set: { body: 2, skin: 4, hair: 4, hc: 0, top: 0, tc: 1, bot: 0, bc: 1, face: 2, jaw: 2, lips: 1, beard: 2, hoops: false, pods: true } },
    { name: "Braids & gym", set: { body: 1, skin: 3, hair: 3, hc: 0, top: 3, tc: 2, bot: 2, bc: 1, face: 0, jaw: 0, lips: 0, lash: true, hoops: true } },
    { name: "Ankara fit", set: { body: 3, skin: 2, hair: 5, hc: 1, top: 5, tc: 0, bot: 3, bc: 3, face: 1, jaw: 1, lips: 0, lash: true, hoops: true } },
    { name: "Tailored, fluid", set: { body: 1, skin: 2, hair: 1, hc: 3, top: 6, tc: 1, bot: 4, bc: 1, face: 2, jaw: 2, lips: 1, feat: 2, glasses: true, hoops: false } },
    { name: "Runner", set: { body: 2, skin: 5, hair: 7, hc: 0, top: 2, tc: 3, bot: 1, bc: 1, face: 1, jaw: 2, lips: 1, beard: 1, watch: true, pods: true, hoops: false } },
    { name: "Kaftan classic", set: { body: 4, skin: 1, hair: 2, hc: 1, top: 7, tc: 4, bot: 4, bc: 1, face: 0, jaw: 1, lips: 0, lash: true, hoops: true } },
  ];

  window.ZuvoriAvatar = { build, DEFAULT, PRESETS, SK, HC, PAL, BG, BODY, HAIRS, TOPS, BOTS, FEAT, BEARD, FACES, JAWS, LIPS };
})();

