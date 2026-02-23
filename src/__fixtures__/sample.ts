// Sample TypeScript file for testing

/**
 * Adds two numbers together.
 */
export function add(a: number, b: number): number {
  return a + b;
}

// No JSDoc - should be flagged as undocumented
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * A sample class with methods.
 */
export class Calculator {
  private value = 0;

  /**
   * Adds a value to the accumulator.
   */
  public add(n: number): this {
    this.value += n;
    return this;
  }

  // Undocumented method
  public getValue(): number {
    return this.value;
  }
}

export const _helper = (x: number): number => x * 2;

export const multiply = (a: number, b: number): number => a * b;
