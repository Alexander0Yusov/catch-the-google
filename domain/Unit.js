export class Unit {
    position;
    constructor(position) {
        this.position = position;
    }
    toJSON() {
        return {
            position: this.position,
        };
    }
}
