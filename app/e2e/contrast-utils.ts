import { expect, type Locator, type Page } from "@playwright/test";

type ContrastSample = {
  selector: string;
  text: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  fontSize: number;
  fontWeight: string;
};

function requiredRatio(fontSize: number, fontWeight: string) {
  const weight = Number.parseInt(fontWeight, 10);
  const largeText = fontSize >= 24 || (fontSize >= 18.66 && Number.isFinite(weight) && weight >= 700);
  return largeText ? 3 : 4.5;
}

export async function getContrastSample(locator: Locator, selector: string): Promise<ContrastSample> {
  const handle = await locator.first().elementHandle();
  if (!handle) throw new Error(`No element found for contrast selector: ${selector}`);
  return await handle.evaluate((element, label) => {
    type Rgba = { r: number; g: number; b: number; a: number };

    function parseColor(value: string): Rgba | null {
      const raw = String(value || "").trim();
      if (!raw || raw === "transparent") return null;
      const rgb = raw.match(/^rgba?\(([^)]+)\)$/i);
      if (rgb) {
        const parts = rgb[1].split(",").map((part) => Number.parseFloat(part.trim()));
        if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
          return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
        }
      }
      const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hex) {
        const normalized = hex[1].length === 3
          ? hex[1].split("").map((char) => `${char}${char}`).join("")
          : hex[1];
        return {
          r: Number.parseInt(normalized.slice(0, 2), 16),
          g: Number.parseInt(normalized.slice(2, 4), 16),
          b: Number.parseInt(normalized.slice(4, 6), 16),
          a: 1,
        };
      }
      return null;
    }

    function blend(top: Rgba, bottom: Rgba): Rgba {
      const alpha = top.a + bottom.a * (1 - top.a);
      if (alpha <= 0) return { r: 255, g: 255, b: 255, a: 1 };
      return {
        r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha,
        b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha,
        a: alpha,
      };
    }

    function effectiveBackground(node: Element): Rgba {
      let current: Element | null = node;
      let resolved: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      const stack: Rgba[] = [];
      while (current) {
        const color = parseColor(window.getComputedStyle(current).backgroundColor);
        if (color && color.a > 0) stack.push(color);
        current = current.parentElement;
      }
      for (const color of stack.reverse()) {
        resolved = blend(color, resolved);
      }
      return resolved;
    }

    function luminance(color: Rgba) {
      const channel = (value: number) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    }

    function contrast(a: Rgba, b: Rgba) {
      const first = luminance(a);
      const second = luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }

    function format(color: Rgba) {
      return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
    }

    const style = window.getComputedStyle(element);
    const foreground = parseColor(style.color) || { r: 0, g: 0, b: 0, a: 1 };
    const background = effectiveBackground(element);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const required = fontSize >= 24 || (fontSize >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700) ? 3 : 4.5;
    return {
      selector: label,
      text: String(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
      foreground: format(foreground),
      background: format(background),
      ratio: Number(contrast(foreground, background).toFixed(2)),
      required,
      fontSize,
      fontWeight: style.fontWeight,
    };
  }, selector);
}

export async function expectReadable(locator: Locator, selector: string, route: string) {
  await expect(locator.first(), `${selector} should be visible on ${route}`).toBeVisible();
  const sample = await getContrastSample(locator, selector);
  const required = requiredRatio(sample.fontSize, sample.fontWeight);
  expect(
    sample.ratio,
    `${selector} on ${route} has insufficient contrast: fg ${sample.foreground}, bg ${sample.background}, ratio ${sample.ratio}, required ${required}, text "${sample.text}"`,
  ).toBeGreaterThanOrEqual(required);
  return { ...sample, required };
}
