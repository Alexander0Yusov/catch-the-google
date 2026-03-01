export class NumberUtil {
  static getRandomNumber(max: number): number {
    return Math.floor(Math.random() * max + 1);
  }
}
