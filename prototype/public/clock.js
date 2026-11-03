// Sincronía de reloj con el servidor, tipo NTP.
// Cada muestra usa 4 marcas: t0 (envío local), t1 (llegada al servidor), t2 (salida del
// servidor) y t3 (llegada local). Por ráfaga se queda con el 25 % de menor RTT y toma la
// mediana; con el historial estima la deriva (ppm) y aplica los ajustes de a poco (slew).

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export class ClockSync {
  constructor({
    send,
    localNow = () => performance.now(),
    burstSize = 48,
    resyncBurstSize = 16,
    burstGapMs = 10,
    burstTailMs = 150,
    resyncMs = 5000,
    slewMsPerS = 1,
    stepThresholdMs = 30,
    onLock = () => {},
  }) {
    Object.assign(this, {
      send,
      localNow,
      burstSize,
      resyncBurstSize,
      burstGapMs,
      burstTailMs,
      resyncMs,
      slewMsPerS,
      stepThresholdMs,
      onLock,
    });
    this.locked = false;
    this.drift = 0; // ms de offset que se acumulan por cada ms local
    this.applied = 0; // offset que se usa ahora (servidor - local)
    this.lastT = 0;
    this.anchor = null; // última estimación: { t, offset }
    this.estimates = [];
    this.samples = [];
    this.pending = new Map();
    this.nextId = 1;
    this.rtt = NaN;
    this.interval = null;
    this.burstTimer = null;
  }

  start() {
    this.stop();
    this._burst(this.burstSize);
    this.interval = setInterval(() => this._burst(this.resyncBurstSize), this.resyncMs);
  }

  stop() {
    clearInterval(this.interval);
    clearTimeout(this.burstTimer);
    this.interval = this.burstTimer = null;
    this.pending.clear();
    this.samples = [];
  }

  handlePong(msg) {
    const t3 = this.localNow();
    const t0 = this.pending.get(msg.id);
    if (t0 === undefined) return;
    this.pending.delete(msg.id);
    const rtt = t3 - t0 - (msg.t2 - msg.t1);
    const offset = (msg.t1 - t0 + (msg.t2 - t3)) / 2;
    this.samples.push({ t: (t0 + t3) / 2, rtt, offset });
  }

  get driftPpm() {
    return this.drift * 1e6;
  }

  // Offset (servidor - local) para la hora local t, con deriva y slew aplicados.
  offsetAt(t) {
    if (!this.locked) return 0;
    const dt = t - this.lastT;
    if (dt <= 0) return this.applied + this.drift * dt;
    this.applied += this.drift * dt;
    const diff = this.anchor.offset + this.drift * (t - this.anchor.t) - this.applied;
    if (Math.abs(diff) > this.stepThresholdMs) {
      this.applied += diff;
    } else {
      const maxStep = (this.slewMsPerS * dt) / 1000;
      this.applied += clamp(diff, -maxStep, maxStep);
    }
    this.lastT = t;
    return this.applied;
  }

  serverNow(t = this.localNow()) {
    return t + this.offsetAt(t);
  }

  _burst(n) {
    clearTimeout(this.burstTimer);
    this.samples = [];
    this.pending.clear();
    let sent = 0;
    const fire = () => {
      if (sent++ >= n) {
        // Margen para que lleguen los últimos pong antes de cerrar la ráfaga.
        this.burstTimer = setTimeout(() => this._finishBurst(), this.burstTailMs);
        return;
      }
      const id = this.nextId++;
      const t0 = this.localNow();
      this.pending.set(id, t0);
      this.send({ t: 'ping', id, t0 });
      this.burstTimer = setTimeout(fire, this.burstGapMs);
    };
    fire();
  }

  _finishBurst() {
    this.burstTimer = null;
    const s = this.samples.sort((a, b) => a.rtt - b.rtt);
    this.samples = [];
    this.pending.clear();
    if (s.length < 4) return;
    const best = s.slice(0, Math.max(2, Math.ceil(s.length * 0.25)));
    const estimate = { t: median(best.map((x) => x.t)), offset: median(best.map((x) => x.offset)) };
    this.rtt = best[0].rtt;
    this.estimates.push(estimate);
    if (this.estimates.length > 48) this.estimates.shift();
    this._updateDrift();
    this.anchor = estimate;
    if (!this.locked) {
      const t = this.localNow();
      this.applied = estimate.offset + this.drift * (t - estimate.t);
      this.lastT = t;
      this.locked = true;
      this.onLock();
    }
  }

  // Regresión lineal offset = a + b·t sobre las estimaciones; b es la deriva.
  // Con menos de 60 s de historial el jitter de red domina la pendiente: no se estima.
  _updateDrift() {
    const e = this.estimates;
    if (e.length < 8 || e[e.length - 1].t - e[0].t < 60000) return;
    const mt = e.reduce((a, x) => a + x.t, 0) / e.length;
    const mo = e.reduce((a, x) => a + x.offset, 0) / e.length;
    let num = 0;
    let den = 0;
    for (const x of e) {
      num += (x.t - mt) * (x.offset - mo);
      den += (x.t - mt) ** 2;
    }
    if (den > 0) this.drift = clamp(num / den, -500e-6, 500e-6);
  }
}
