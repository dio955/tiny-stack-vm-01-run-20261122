// Tiny stack VM: an exact interpreter of make.fun's tiny stack ISA v1
// (32-bit wrapping ints, 256-value stack, 64-deep call stack, 256 words of
// memory, ten traps, step/output limits). Written from ISA.md; the reference
// VM is used only as a differential-testing oracle. One run answers every
// instance in MAKEFUN_INPUT_DIR, writing <id>/stdout.bin and <id>/exit.txt
// under MAKEFUN_OUTPUT_DIR.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function run(p, inp) {
  const S = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256);
  const out = [];
  let sp = 0, cp = 0, pc = 0, ip = 0, steps = 0;
  const end = (code) => ({ out: Uint8Array.from(out), code });
  const push = (v) => { if (sp >= 256) throw 3; S[sp++] = v | 0; };
  const pop = () => { if (sp <= 0) throw 2; return S[--sp]; };
  try {
    for (;;) {
      if (steps >= 1e6) return end(10);
      if (pc < 0 || pc >= p.length) return end(9);
      const op = p[pc];
      let n = 0;
      if (op === 1) n = 1;
      else if (op === 2) n = 4;
      else if (op >= 0x30 && op <= 0x33) n = 2;
      else if (op === 0 || (op >= 3 && op <= 7) || (op >= 0x10 && op <= 0x22) || op === 0x34 || op === 0x40 || op === 0x41 || (op >= 0x50 && op <= 0x53)) n = 0;
      else return end(5);
      if (pc + 1 + n > p.length) return end(9);
      pc++;
      steps++;
      if (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b) {
        const b = pop(), a = pop();
        let r;
        if (op === 0x10) r = a + b;
        else if (op === 0x11) r = a - b;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (!b) throw 4; r = Math.trunc(a / b); }
        else if (op === 0x14) { if (!b) throw 4; r = a % b; }
        else if (op === 0x15) { if (!b) throw 4; r = Math.trunc((a >>> 0) / (b >>> 0)); }
        else if (op === 0x16) { if (!b) throw 4; r = (a >>> 0) % (b >>> 0); }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << b;
        else if (op === 0x1d) r = a >> b;
        else if (op === 0x1e) r = a >>> b;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        push(r);
        continue;
      }
      switch (op) {
        case 0x00: return end(0);
        case 0x01: push((p[pc] << 24) >> 24); pc++; break;
        case 0x02: push(p[pc] | (p[pc + 1] << 8) | (p[pc + 2] << 16) | (p[pc + 3] << 24)); pc += 4; break;
        case 0x03: pop(); break;
        case 0x04: { const a = pop(); push(a); push(a); break; }
        case 0x05: { const b = pop(), a = pop(); push(b); push(a); break; }
        case 0x06: { const b = pop(), a = pop(); push(a); push(b); push(a); break; }
        case 0x07: { const c = pop(), b = pop(), a = pop(); push(b); push(c); push(a); break; }
        case 0x17: push(-pop()); break;
        case 0x1b: push(~pop()); break;
        case 0x30: case 0x31: case 0x32: {
          const rel = ((p[pc] | (p[pc + 1] << 8)) << 16) >> 16;
          pc += 2;
          if (op === 0x30 || (op === 0x31) === (pop() === 0)) pc += rel;
          break;
        }
        case 0x33: {
          const t = p[pc] | (p[pc + 1] << 8);
          if (cp >= 64) throw 7;
          C[cp++] = pc + 2;
          pc = t;
          break;
        }
        case 0x34:
          if (cp <= 0) throw 8;
          pc = C[--cp];
          break;
        case 0x40: {
          const a = pop();
          if (a < 0 || a > 255) throw 6;
          push(M[a]);
          break;
        }
        case 0x41: {
          const a = pop(), v = pop();
          if (a < 0 || a > 255) throw 6;
          M[a] = v;
          break;
        }
        case 0x50: {
          const s = String(pop());
          if (out.length + s.length > 65536) throw 11;
          for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
          break;
        }
        case 0x51: {
          const v = pop();
          if (out.length >= 65536) throw 11;
          out.push(v & 255);
          break;
        }
        case 0x52: push(ip < inp.length ? inp[ip++] : -1); break;
        case 0x53: return end(pop() & 255);
      }
    }
  } catch (e) {
    return end(typeof e === 'number' && e >= 2 && e <= 11 ? e : 1);
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(readFileSync(join(I, id, 'program.bin')), readFileSync(join(I, id, 'input.bin')));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), r.code + '\n');
}
