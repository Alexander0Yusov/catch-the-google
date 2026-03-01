export class Position {
    x;
    y;
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    clone() {
        return new Position(this.x, this.y);
    }
    equal(otherPosition) {
        return otherPosition.x === this.x && otherPosition.y === this.y;
    }
    toJSON() {
        return { x: this.x, y: this.y };
    }
}
