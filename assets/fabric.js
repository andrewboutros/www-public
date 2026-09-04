/* =============================================================
   fabric.js — axonometric FPGA fabric with continuously routed
   signals. Self-contained, no dependencies.

     Fabric.mount(element, options) -> { destroy() }

   Geometry, in cell units on a square grid viewed at 30 degrees:
     tile      [c+inset, c+1-inset] x [r+inset, r+1-inset]
     channel   the strip of width 2*inset between two tile edges,
               centred exactly on the integer grid line
     switchbox the square where two channels cross, so its four
               corners land on the corners of the four tiles
               around it
     tracks    `tracks` wires evenly spread across each channel,
               drawn only in the spans beside a tile and stopping
               at the switch box edge

   A signal is a walker on this graph. It occupies one track of one
   channel, runs to the next switch box, and there either carries
   straight on or turns onto a track of the perpendicular channel.
   It never lifts off the wires and never restarts: the head keeps
   walking and the tail follows it at a fixed distance. Walkers are
   independent of one another and may cross.
   ============================================================= */
(function (global) {
  'use strict';

  var IX = Math.cos(Math.PI / 6);
  var IY = Math.sin(Math.PI / 6);

  var DEFAULTS = {
    pitch:       220,   // cell pitch in px
    inset:       0.15,  // tile inset -> channel half-width
    tracks:      8,     // wires per channel
    spread:      0.86,  // fraction of the channel the wires occupy
    core:        0.58,  // inner block size, as a fraction of the tile
    grid:        30,    // generated grid before culling, N x N
    signals:     12,    // walkers in flight
    speed:       180,   // px per second
    trail:       1.7,   // trail length, in cell pitches
    straight:    0.5,   // probability of carrying straight on
    width:       5.0,   // width of the lit signal
    trailSteps:  16,    // slices used to fade the trail out
    colours:     ['#EAAB00'],          // Waterloo gold, level 4
    tileFill:    '#FFFFFF',
    tileStroke:  '#CFC8B6',
    coreFill:    '#F7E7AE',            // pastel gold: brand level 1, warmed toward gold
    coreStroke:  '#DFCD93',
    sboxStroke:  '#D3CCBA',
    wire:        '#CAC3B0',
    wireAlt:     '#B3AA92'
  };

  var NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function pointsAttr(pts) {
    return pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
  }
  function dAttr(pts) {
    return 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' L ');
  }
  function dist(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
  }
  function mount(host, options) {
    if (!host || !host.getBoundingClientRect) {
      throw new Error('Fabric.mount: first argument must be an element');
    }

    // keep the schedule/cancel pair coherent: if one is missing, use timers for both
    var hasRAF = !!global.requestAnimationFrame;
    var RAF = hasRAF
      ? function (cb) { return global.requestAnimationFrame(cb); }
      : function (cb) { return global.setTimeout(function () { cb(Date.now()); }, 16); };
    var CAF = hasRAF
      ? function (id) { global.cancelAnimationFrame(id); }
      : function (id) { global.clearTimeout(id); };

    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    for (var j in (options || {})) o[j] = options[j];

    var svg, raf = null, ro = null, walkers = [], last = 0, destroyed = false;
    var reduce = global.matchMedia
      ? global.matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false };

    var P = o.pitch, M = o.inset, N = o.grid;
    var VX, VY, VW, VH;
    var offs = [];
    for (var t = 0; t < o.tracks; t++) {
      offs.push((-M + 2 * M * (t + 0.5) / o.tracks) * o.spread);
    }

    function proj(c, r) { return [(c - r) * P * IX, (c + r) * P * IY]; }

    // inner block, centred in the tile and sized as a fraction of it
    var CH = (0.5 - M) * Math.max(0.1, Math.min(1, o.core));
    var CLO = 0.5 - CH, CHI = 0.5 + CH;

    function inWindow(p, pad) {
      pad = (pad === undefined) ? P : pad;
      return p[0] >= VX - pad && p[0] <= VX + VW + pad &&
             p[1] >= VY - pad && p[1] <= VY + VH + pad;
    }

    /* ---------- static geometry ---------- */
    function build() {
      var rect = host.getBoundingClientRect();
      VW = Math.max(80, Math.round(rect.width));
      VH = Math.max(80, Math.round(rect.height));
      VX = -VW / 2;
      VY = N * P * IY - VH / 2;   // window centred on the middle of the grid

      host.textContent = '';
      svg = svgEl('svg', {
        viewBox: VX + ' ' + VY + ' ' + VW + ' ' + VH,
        width: '100%', height: '100%',
        preserveAspectRatio: 'xMidYMid meet',
        'aria-hidden': 'true'
      });
      svg.style.display = 'block';

      var gTiles = svgEl('g', {}), gSbox = svgEl('g', {}),
          gWires = svgEl('g', {}), gSig = svgEl('g', {});
      svg.appendChild(gTiles); svg.appendChild(gSbox);
      svg.appendChild(gWires); svg.appendChild(gSig);
      host.appendChild(svg);

      var c, r, C, R, i;

      // logic tiles, with an inner block so a tile reads as a tile
      for (r = 0; r < N; r++) {
        for (c = 0; c < N; c++) {
          if (!inWindow(proj(c + 0.5, r + 0.5))) continue;
          gTiles.appendChild(svgEl('polygon', {
            points: pointsAttr([proj(c + M, r + M), proj(c + 1 - M, r + M),
                                proj(c + 1 - M, r + 1 - M), proj(c + M, r + 1 - M)]),
            fill: o.tileFill, stroke: o.tileStroke, 'stroke-width': 1.1
          }));
          gTiles.appendChild(svgEl('polygon', {
            points: pointsAttr([proj(c + CLO, r + CLO), proj(c + CHI, r + CLO),
                                proj(c + CHI, r + CHI), proj(c + CLO, r + CHI)]),
            fill: o.coreFill, stroke: o.coreStroke || o.tileStroke, 'stroke-width': 0.7
          }));
        }
      }

      // switch boxes: the crossing square, corners on the tile corners
      for (R = 0; R <= N; R++) {
        for (C = 0; C <= N; C++) {
          if (!inWindow(proj(C, R))) continue;
          gSbox.appendChild(svgEl('polygon', {
            points: pointsAttr([proj(C - M, R - M), proj(C + M, R - M),
                                proj(C + M, R + M), proj(C - M, R + M)]),
            fill: 'none', stroke: o.sboxStroke, 'stroke-width': 1
          }));
        }
      }

      // tracks, drawn span by span so they stop at each switch box
      function wire(a, b, idx) {
        gWires.appendChild(svgEl('line', {
          x1: a[0].toFixed(2), y1: a[1].toFixed(2),
          x2: b[0].toFixed(2), y2: b[1].toFixed(2),
          stroke: (idx % 3 === 0) ? o.wireAlt : o.wire, 'stroke-width': 0.9
        }));
      }
      for (R = 0; R <= N; R++) {
        for (c = 0; c < N; c++) {
          if (!inWindow(proj(c + 0.5, R), P * 1.4)) continue;
          for (i = 0; i < offs.length; i++) {
            wire(proj(c + M, R + offs[i]), proj(c + 1 - M, R + offs[i]), i);
          }
        }
      }
      for (C = 0; C <= N; C++) {
        for (r = 0; r < N; r++) {
          if (!inWindow(proj(C, r + 0.5), P * 1.4)) continue;
          for (i = 0; i < offs.length; i++) {
            wire(proj(C + offs[i], r + M), proj(C + offs[i], r + 1 - M), i);
          }
        }
      }

      return gSig;
    }

    /* ---------- walkers ---------- */
    // How far past the window a walker may roam. Kept tight so most of the
    // signals are on screen; the floor only matters for a host smaller than a
    // couple of cells, where the walkers would otherwise have nowhere to go.
    function roam() {
      return Math.max(P * 0.6, (3.2 * P - Math.min(VW, VH)) / 2);
    }
    function nodeOk(C, R) {
      return C >= 0 && C <= N && R >= 0 && R <= N &&
             inWindow(proj(C, R), roam());
    }

    function Walker(gSig, colour) {
      this.colour = colour;
      this.trail  = o.trail * P;
      this.speed  = o.speed * (0.85 + Math.random() * 0.3);

      // start somewhere inside the window
      var tries = 0;
      do {
        this.C = Math.round(Math.random() * N);
        this.R = Math.round(Math.random() * N);
        tries++;
      } while (!inWindow(proj(this.C, this.R), -P * 0.2) && tries < 400);

      this.horiz = Math.random() < 0.5;
      this.dir   = Math.random() < 0.5 ? -1 : 1;
      this.kh    = (Math.random() * offs.length) | 0;   // horizontal track in use
      this.kv    = (Math.random() * offs.length) | 0;   // vertical track in use

      this.pts   = [];
      this.seg   = [];
      this.total = 0;
      this.head  = 0;

      // The trail is drawn as a stack of short slices whose width and opacity
      // ramp from nothing at the tail to full at the head, which gives a
      // continuous fade along a path that bends. A single stroke cannot do
      // this: SVG gradients are defined in space, not along a polyline.
      var w = o.width, K = Math.max(4, o.trailSteps | 0), i, t;
      this.slices = [];
      for (i = 0; i < K; i++) {
        t = (i + 0.5) / K;
        this.slices.push({
          glow: svgEl('path', { fill: 'none', stroke: colour,
            'stroke-width': w * (0.55 + 0.45 * t) * 2.0,
            'stroke-opacity': (0.06 * t * t).toFixed(4),
            'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
        });
      }
      for (i = 0; i < K; i++) {
        t = (i + 0.5) / K;
        this.slices[i].core = svgEl('path', { fill: 'none', stroke: colour,
          'stroke-width': w * (0.55 + 0.45 * t),
          'stroke-opacity': (0.95 * Math.pow(t, 1.2)).toFixed(4),
          'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      }
      this.dot = svgEl('circle', { r: w * 0.55, fill: colour });
      for (i = 0; i < K; i++) gSig.appendChild(this.slices[i].glow);
      for (i = 0; i < K; i++) gSig.appendChild(this.slices[i].core);
      gSig.appendChild(this.dot);

      this.extend(this.trail + P * 1.2);
    }

    // One hop to the next switch box. A walker only ever leaves a waypoint
    // where it actually turns, so a straight run stays perfectly straight and
    // a turn is a single clean corner inside the switch box. Reversing is a
    // last resort for a walker with nowhere else to go, which by construction
    // only happens outside the visible window.
    Walker.prototype.step = function () {
      var turn = (1 - o.straight) / 2;
      var moves = [];
      if (this.horiz) {
        if (nodeOk(this.C + this.dir, this.R)) moves.push([false, this.dir, o.straight]);
        if (nodeOk(this.C, this.R + 1))        moves.push([true,  1,  turn]);
        if (nodeOk(this.C, this.R - 1))        moves.push([true, -1,  turn]);
      } else {
        if (nodeOk(this.C, this.R + this.dir)) moves.push([false, this.dir, o.straight]);
        if (nodeOk(this.C + 1, this.R))        moves.push([true,  1,  turn]);
        if (nodeOk(this.C - 1, this.R))        moves.push([true, -1,  turn]);
      }

      var turned;
      if (moves.length) {
        var sum = 0, i;
        for (i = 0; i < moves.length; i++) sum += moves[i][2];
        var pickV = Math.random() * sum, chosen = moves[moves.length - 1];
        for (i = 0; i < moves.length; i++) {
          pickV -= moves[i][2];
          if (pickV <= 0) { chosen = moves[i]; break; }
        }
        turned = chosen[0];
        if (turned) {
          this.horiz = !this.horiz;
          this.dir = chosen[1];
          if (this.horiz) this.kh = (Math.random() * offs.length) | 0;
          else            this.kv = (Math.random() * offs.length) | 0;
        }
      } else {
        // Cornered, which only happens at the edge of the roaming region and so
        // off-panel. Counts as a turn: without a waypoint here the polyline
        // stops growing and the signal freezes in place.
        this.dir = -this.dir;
        turned = true;
      }

      // a waypoint is only needed where the direction actually changes
      if (!this.pts.length || turned) {
        this.pushPoint(proj(this.C + offs[this.kv], this.R + offs[this.kh]));
      }

      if (this.horiz) this.C += this.dir; else this.R += this.dir;
    };

    Walker.prototype.pushPoint = function (p) {
      if (!this.pts.length) { this.pts.push(p); return; }   // first point, no segment yet
      var prev = this.pts[this.pts.length - 1];
      var d = dist(prev, p);
      if (d < 0.001) return;
      this.pts.push(p);
      this.seg.push(d);
      this.total += d;
    };

    Walker.prototype.extend = function (ahead) {
      var guard = 0;
      while (this.total - this.head < ahead && guard++ < 200) this.step();
    };

    Walker.prototype.prune = function () {
      while (this.seg.length > 2 && this.head - this.seg[0] > this.trail) {
        this.head  -= this.seg[0];
        this.total -= this.seg[0];
        this.seg.shift();
        this.pts.shift();
      }
    };

    // points of the polyline between two distances along it
    Walker.prototype.slice = function (d0, d1) {
      var out = [], acc = 0, i, a, b, L;
      for (i = 0; i < this.seg.length; i++) {
        a = this.pts[i]; b = this.pts[i + 1]; L = this.seg[i];
        var s = acc, e = acc + L;
        if (e >= d0 && s <= d1) {
          var t0 = Math.max(0, (d0 - s) / L), t1 = Math.min(1, (d1 - s) / L);
          var p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
          var p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
          if (!out.length) out.push(p0);
          out.push(p1);
        }
        acc = e;
        if (acc > d1) break;
      }
      return out.length > 1 ? out : null;
    };

    Walker.prototype.pointAt = function (d) {
      var acc = 0, i, L, t;
      for (i = 0; i < this.seg.length; i++) {
        L = this.seg[i];
        if (acc + L >= d) {
          t = L ? (d - acc) / L : 0;
          return [this.pts[i][0] + (this.pts[i + 1][0] - this.pts[i][0]) * t,
                  this.pts[i][1] + (this.pts[i + 1][1] - this.pts[i][1]) * t];
        }
        acc += L;
      }
      return this.pts.length ? this.pts[this.pts.length - 1] : null;
    };

    Walker.prototype.advance = function (dt) {
      this.head += this.speed * dt;
      this.extend(this.trail + P * 3);
      this.prune();

      var tail = Math.max(0, this.head - this.trail);
      var span = this.head - tail;
      var K = this.slices.length;
      if (span < 1) return;

      var over = (span / K) * 0.45;      // slices overlap so no seam shows
      for (var i = 0; i < K; i++) {
        var d0 = tail + span * i / K;
        var d1 = Math.min(this.head, tail + span * (i + 1) / K + over);
        var pts = this.slice(d0, d1);
        var sl = this.slices[i];
        var d = pts ? dAttr(pts) : '';
        sl.core.setAttribute('d', d);
        sl.glow.setAttribute('d', d);
      }

      var h = this.pointAt(this.head);
      if (h) {
        this.dot.setAttribute('cx', h[0].toFixed(1));
        this.dot.setAttribute('cy', h[1].toFixed(1));
      }
    };

    Walker.prototype.freeze = function () {
      this.head = this.trail * 1.4;
      this.advance(0);
    };

    /* ---------- lifecycle ---------- */
    function start() {
      var gSig = build();
      walkers = [];
      for (var i = 0; i < o.signals; i++) {
        var w = new Walker(gSig, o.colours[i % o.colours.length]);
        w.head = Math.random() * P * 4;
        walkers.push(w);
      }
      if (reduce.matches) {
        walkers.forEach(function (w) { w.freeze(); });
        return;
      }
      last = 0;
      raf = RAF(frame);
    }

    function frame(ts) {
      if (!last) last = ts;
      var dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      for (var i = 0; i < walkers.length; i++) walkers[i].advance(dt);
      raf = RAF(frame);
    }

    function stop() {
      if (raf) CAF(raf);
      raf = null;
    }

    function rebuild() {
      if (destroyed) return;
      stop();
      start();
    }

    var resizeTimer = null;
    function onResize() {
      global.clearTimeout(resizeTimer);
      resizeTimer = global.setTimeout(rebuild, 250);
    }
    if (global.ResizeObserver) {
      ro = new global.ResizeObserver(onResize);
      ro.observe(host);
    } else if (global.addEventListener) {
      global.addEventListener('resize', onResize);
    }

    start();

    return {
      destroy: function () {
        destroyed = true;
        stop();
        if (resizeTimer !== null) {
          global.clearTimeout(resizeTimer);
          resizeTimer = null;
        }
        if (ro) ro.disconnect();
        else if (global.removeEventListener) global.removeEventListener('resize', onResize);
        host.textContent = '';
      },
      rebuild: rebuild,
      options: o
    };
  }

  global.Fabric = { mount: mount, defaults: DEFAULTS };
})(window);
