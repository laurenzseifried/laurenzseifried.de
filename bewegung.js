/* Bewegung auf laurenzseifried.de: graue Höhenlinien hinter dem Porträt, die langsam fließen
   und der Maus leicht ausweichen, dazu Einblenden beim Scrollen.
   Ohne JS oder bei "Bewegung reduzieren" bleibt alles lesbar und still. */
(() => {
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Wertrauschen mit Oktaven, deterministisch, damit das Gelände bei jedem Laden gleich beginnt.
  function rauschen(seed) {
    let a = seed >>> 0;
    const zufall = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const perm = new Uint8Array(512), wert = new Float32Array(256);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(zufall() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) wert[i] = zufall();
    const glatt = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const n = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const aa = wert[perm[perm[X] + Y]], b = wert[perm[perm[X + 1] + Y]];
      const c = wert[perm[perm[X] + Y + 1]], d = wert[perm[perm[X + 1] + Y + 1]];
      const u = glatt(xf), v = glatt(yf);
      return aa + (b - aa) * u + (c - aa) * v + (aa - b - c + d) * u * v;
    };
    return (x, y) => (n(x, y) * 0.58 + n(x * 2.07 + 17.3, y * 2.07 - 9.1) * 0.29 + n(x * 4.3 - 3.7, y * 4.3 + 5.2) * 0.13);
  }

  // Ein Canvas mit Höhenlinien (Marching Squares über ein fließendes Rauschfeld).
  function hoehenlinien(canvas, opt) {
    const ctx = canvas.getContext('2d');
    const feld = rauschen(opt.seed);
    let w = 0, h = 0, dpr = 1, zelle = 8, spalten = 0, zeilen = 0, werte = null, verlauf = null;
    let zeit = opt.seed * 3.1, sichtbar = true, zuletzt = 0;
    const maus = { x: -9999, y: -9999, zx: -9999, zy: -9999, kraft: 0, ziel: 0 };

    function groesse() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      zelle = w < 640 ? 6 : 8;
      spalten = Math.ceil(w / zelle) + 1; zeilen = Math.ceil(h / zelle) + 1;
      werte = new Float32Array(spalten * zeilen);
      const schmal = w < 640 && opt.mobil;
      const fx = w * (schmal ? opt.mobil[0] : opt.fokusX), fy = h * (schmal ? opt.mobil[1] : opt.fokusY);
      const rad = Math.max(w, h) * (schmal ? opt.mobil[2] : opt.weite);
      verlauf = ctx.createRadialGradient(fx, fy, 0, fx, fy, rad);
      verlauf.addColorStop(0, 'rgba(255,255,255,0.30)');
      verlauf.addColorStop(0.45, 'rgba(255,255,255,0.16)');
      verlauf.addColorStop(1, 'rgba(255,255,255,0.06)');
      zeichne();
    }

    function berechne() {
      const s = opt.massstab / Math.max(w, 560);
      const tx = zeit * 0.9, ty = -zeit * 0.6;
      const sig2 = 2 * Math.pow(Math.max(w, h) * 0.11, 2);
      for (let j = 0; j < zeilen; j++) {
        const y = j * zelle;
        for (let i = 0; i < spalten; i++) {
          const x = i * zelle;
          let v = feld(x * s + tx, y * s + ty);
          if (maus.kraft > 0.001) {
            const dx = x - maus.zx, dy = y - maus.zy;
            v += maus.kraft * 0.16 * Math.exp(-(dx * dx + dy * dy) / sig2);
          }
          werte[j * spalten + i] = v;
        }
      }
    }

    // Zeichnet die Linie einer Höhe als einen Pfad.
    function linie(stufe) {
      ctx.beginPath();
      for (let j = 0; j < zeilen - 1; j++) {
        const y0 = j * zelle, o = j * spalten;
        for (let i = 0; i < spalten - 1; i++) {
          const a = werte[o + i], b = werte[o + i + 1], c = werte[o + spalten + i + 1], d = werte[o + spalten + i];
          const fall = (a > stufe ? 8 : 0) | (b > stufe ? 4 : 0) | (c > stufe ? 2 : 0) | (d > stufe ? 1 : 0);
          if (fall === 0 || fall === 15) continue;
          const x0 = i * zelle;
          const oben = () => [x0 + zelle * (stufe - a) / (b - a), y0];
          const rechts = () => [x0 + zelle, y0 + zelle * (stufe - b) / (c - b)];
          const unten = () => [x0 + zelle * (stufe - d) / (c - d), y0 + zelle];
          const links = () => [x0, y0 + zelle * (stufe - a) / (d - a)];
          const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
          switch (fall) {
            case 1: case 14: seg(links(), unten()); break;
            case 2: case 13: seg(unten(), rechts()); break;
            case 3: case 12: seg(links(), rechts()); break;
            case 4: case 11: seg(oben(), rechts()); break;
            case 5: seg(links(), oben()); seg(unten(), rechts()); break;
            case 6: case 9: seg(oben(), unten()); break;
            case 7: case 8: seg(links(), oben()); break;
            case 10: seg(oben(), rechts()); seg(links(), unten()); break;
          }
        }
      }
      ctx.stroke();
    }

    function zeichne() {
      if (!werte) return;
      berechne();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = verlauf;
      ctx.lineJoin = 'round';
      let k = 0;
      for (let stufe = 0.18; stufe < 0.86; stufe += 0.034, k++) {
        const index = k % 5 === 0;
        ctx.lineWidth = index ? 1.25 : 0.7;
        ctx.globalAlpha = Math.min(1, (index ? 0.95 : 0.62) * opt.helligkeit);
        linie(stufe);
      }
      ctx.globalAlpha = 1;
    }

    function schritt(t) {
      if (sichtbar) {
        const dt = Math.min(t - zuletzt, 60);
        if (t - zuletzt > 30) { // etwa 30 Bilder pro Sekunde reichen für langsames Fließen
          zuletzt = t;
          zeit += dt * 0.000022;
          maus.zx += (maus.x - maus.zx) * 0.06;
          maus.zy += (maus.y - maus.zy) * 0.06;
          maus.kraft += (maus.ziel - maus.kraft) * 0.04;
          zeichne();
        }
      }
      requestAnimationFrame(schritt);
    }

    new ResizeObserver(groesse).observe(canvas);
    if (ruhig) return;
    new IntersectionObserver(([e]) => { sichtbar = e.isIntersecting; }).observe(canvas);
    const ziel = canvas.parentElement;
    ziel.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      maus.x = e.clientX - r.left; maus.y = e.clientY - r.top;
      if (maus.zx < -9000) { maus.zx = maus.x; maus.zy = maus.y; }
      maus.ziel = 1;
    });
    ziel.addEventListener('pointerleave', () => { maus.ziel = 0; });
    requestAnimationFrame(schritt);
  }

  document.querySelectorAll('canvas.hoehen').forEach((c) => {
    hoehenlinien(c, { seed: 23, fokusX: 0.72, fokusY: 0.42, weite: 0.5, massstab: 2.4, helligkeit: 1, mobil: [0.5, 0.2, 0.8] });
  });

  // Leiste bekommt beim Scrollen einen Grund.
  const leiste = document.querySelector('.leiste');
  const pruefe = () => leiste.classList.toggle('fest', scrollY > 40);
  addEventListener('scroll', pruefe, { passive: true }); pruefe();

  // Einblenden, Geschwister leicht versetzt.
  const reveal = document.querySelectorAll('[data-reveal]');
  reveal.forEach((el) => {
    const geschwister = [...el.parentElement.children].filter((x) => x.hasAttribute('data-reveal'));
    el.style.setProperty('--v', `${Math.min(geschwister.indexOf(el), 6) * 0.08}s`);
  });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('da'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  reveal.forEach((el) => io.observe(el));

})();
