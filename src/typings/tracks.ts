import { Pose } from "."

abstract class Track {
    abstract onMap(x: number, y: number, z: number): boolean
    abstract generateStartingPosition(): Pose
}

export class Loop extends Track {
    static readonly innerRadius = 5
    static readonly outerRadius = 15

    onMap(x: number, y: number, z: number): boolean {
        const r = Math.hypot(x, y, z)
        return r >= Loop.innerRadius && r <= Loop.outerRadius && y >= 1e-6
    }

    generateStartingPosition(): Pose {
        const r = Math.random() * (Loop.outerRadius - Loop.innerRadius) + Loop.innerRadius
        const theta = Math.random() * 2 * Math.PI
        const x = Math.cos(theta) * r
        const z = Math.sin(theta) * r
        const y = 1

        return {
            x,
            y,
            z,
            yaw: Math.random() * 2 * Math.PI,
            roll: 0
        }
    }

}