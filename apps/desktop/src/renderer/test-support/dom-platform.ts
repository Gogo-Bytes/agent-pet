// jsdom lacks pointer-event capability detection and capture. Keep the real
// use-gesture engine; emulate only these browser platform APIs before imports.
Object.defineProperty(window, 'onpointerdown', { configurable: true, value: null });
if (!window.PointerEvent) {
  class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: PointerEvent });
}
const captures = new WeakMap<Element, Set<number>>();
Element.prototype.setPointerCapture = function (id) {
  if (!captures.has(this)) captures.set(this, new Set());
  captures.get(this)!.add(id);
};
Element.prototype.hasPointerCapture = function (id) { return captures.get(this)?.has(id) ?? false; };
Element.prototype.releasePointerCapture = function (id) { captures.get(this)?.delete(id); };
