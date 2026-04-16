/**
 * Manual mock for framer-motion.
 * Strips all animation props and renders plain HTML elements so RTL tests
 * don't need a real browser animation engine.
 */
import React from "react";
import { vi } from "vitest";

const ANIMATION_PROPS = new Set([
  "initial", "animate", "exit", "transition", "variants",
  "whileHover", "whileTap", "whileFocus", "whileDrag",
  "layout", "layoutId", "drag", "dragConstraints",
]);

function stripAnimationProps(props: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(props).filter(([k]) => !ANIMATION_PROPS.has(k))
  );
}

function createMotionComponent(tag: string) {
  return React.forwardRef(function MotionComponent(
    { children, ...props }: React.PropsWithChildren<Record<string, unknown>>,
    ref: React.Ref<unknown>
  ) {
    return React.createElement(tag, { ...stripAnimationProps(props), ref }, children);
  });
}

export const motion = new Proxy({} as Record<string, ReturnType<typeof createMotionComponent>>, {
  get(_target, prop: string) {
    return createMotionComponent(prop);
  },
});

export const AnimatePresence = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);

export const useAnimation = () => ({ start: vi.fn(), stop: vi.fn(), set: vi.fn() });
export const useMotionValue = (initial: unknown) => ({
  get: () => initial,
  set: vi.fn(),
  onChange: vi.fn(),
});
export const useTransform = vi.fn(() => ({ get: vi.fn(), set: vi.fn() }));
export const useInView = () => true;
export const useReducedMotion = () => false;
