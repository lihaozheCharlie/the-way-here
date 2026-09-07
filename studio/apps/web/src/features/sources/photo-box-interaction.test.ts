import { describe, expect, it } from "vitest";
import { drawnPhotoBox, movePhotoBox, photoPoint, resizePhotoBox } from "./photo-box-interaction";

describe("direct photo box interaction", () => {
  it("converts pointer coordinates and draws in either direction", () => {
    expect(photoPoint(150, 100, { left: 50, top: 20, width: 200, height: 160 })).toEqual({ x: .5, y: .5 });
    const box = drawnPhotoBox({ x: .7, y: .8 }, { x: .2, y: .3 })!;
    expect(box.x).toBe(.2); expect(box.y).toBe(.3); expect(box.width).toBeCloseTo(.5); expect(box.height).toBeCloseTo(.5);
    expect(drawnPhotoBox({ x: .2, y: .2 }, { x: .21, y: .5 })).toBeUndefined();
  });

  it("keeps moved and resized boxes inside the photograph", () => {
    expect(movePhotoBox({ x: .7, y: .6, width: .2, height: .3 }, { x: .5, y: -.8 })).toEqual({ x: .8, y: 0, width: .2, height: .3 });
    const expanded = resizePhotoBox({ x: .1, y: .1, width: .2, height: .2 }, "nw", { x: -.5, y: -.5 });
    expect(expanded.x).toBe(0); expect(expanded.y).toBe(0); expect(expanded.width).toBeCloseTo(.3); expect(expanded.height).toBeCloseTo(.3);
    const smallest = resizePhotoBox({ x: .1, y: .1, width: .2, height: .2 }, "se", { x: -.5, y: -.5 });
    expect(smallest.width).toBeCloseTo(.03);
    expect(smallest.height).toBeCloseTo(.03);
  });

  it("moves and resizes vertically without changing the horizontal bounds", () => {
    const box = { x: .2, y: .2, width: .3, height: .4 };
    expect(movePhotoBox(box, { x: 0, y: .15 })).toEqual({ x: .2, y: .35, width: .3, height: .4 });
    expect(resizePhotoBox(box, "se", { x: 0, y: .15 })).toEqual({ x: .2, y: .2, width: .3, height: .55 });
    const shortenedFromTop = resizePhotoBox(box, "n", { x: .4, y: .25 });
    expect(shortenedFromTop.x).toBe(.2); expect(shortenedFromTop.width).toBe(.3);
    expect(shortenedFromTop.y).toBeCloseTo(.45); expect(shortenedFromTop.height).toBeCloseTo(.15);
    const shortenedFromBottom = resizePhotoBox(box, "s", { x: -.4, y: -.2 });
    expect(shortenedFromBottom.x).toBe(.2); expect(shortenedFromBottom.y).toBe(.2); expect(shortenedFromBottom.width).toBe(.3);
    expect(shortenedFromBottom.height).toBeCloseTo(.2);
    const resizedFromTop = resizePhotoBox(box, "nw", { x: 0, y: -.1 });
    expect(resizedFromTop.x).toBe(.2); expect(resizedFromTop.width).toBe(.3);
    expect(resizedFromTop.y).toBeCloseTo(.1); expect(resizedFromTop.height).toBeCloseTo(.5);
  });
});
