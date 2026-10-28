// The few DOM calls the svg drawings in js/lib make (createElementNS, attributes, children, focus), so node can run a
// drawing and the tests can read the attributes it set. Not a test file itself.
class Node {
  constructor(tag) {
    // dataset holds strings, as the DOM's does.
    const dataset = new Proxy({}, { set: (o, k, v) => { o[k] = String(v); return true; } });
    Object.assign(this, { tagName: tag, attrs: new Map(), children: [], parentNode: null, textContent: "", dataset });
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  get id() { return this.getAttribute("id") ?? ""; }
  get firstChild() { return this.children[0] ?? null; }
  appendChild(c) { return this.insertBefore(c, null); }
  insertBefore(c, ref) {
    c.parentNode?.removeChild(c);
    const i = ref ? this.children.indexOf(ref) : -1;
    this.children.splice(i < 0 ? this.children.length : i, 0, c);
    c.parentNode = this;
    return c;
  }
  removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.parentNode = null; return c; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  focus() { globalThis.document.activeElement = this; }
  // Every element below this one, in document order, that pred accepts.
  findAll(pred) { return this.children.flatMap(c => [...(pred(c) ? [c] : []), ...c.findAll(pred)]); }
}

export function stubDom() {
  globalThis.document = { createElementNS: (ns, tag) => new Node(tag), activeElement: null };
  return id => { const svg = new Node("svg"); svg.setAttribute("id", id); return svg; };
}
