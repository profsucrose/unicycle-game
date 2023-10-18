import { Pose } from "."

type Position = {
    x: number,
    y: number,
    z: number,
}

export abstract class Track {
    abstract onMap(x: number, y: number, z: number): boolean
    abstract generateStartingPosition(): Pose
    
    // Distinguish completion based on whether player has reached
    // in front of finish line -> behind finish line -> finish line
    // in that order.
    abstract onFinishLine(x: number, y: number, z: number): boolean
    abstract aheadFinishLine(x: number, y: number, z: number): boolean
    abstract behindFinishLine(x: number, y: number, z: number): boolean
}

const radToDeg = (degrees: number) => degrees * 180/Math.PI

export class Loop extends Track {
    static readonly innerRadius = 5
    static readonly outerRadius = 15

    onMap(x: number, y: number, z: number): boolean {
        const r = Math.hypot(x, z)
        return r >= Loop.innerRadius && r <= Loop.outerRadius && y <= 1e-6 && y >= -1
    }

    aheadFinishLine(x: number, y: number, z: number): boolean {
        // At 10 degrees
        const theta = radToDeg(Math.atan2(z, x))
        console.log('t', theta)
        return Math.abs(theta - -10) < 3
    }

    behindFinishLine(x: number, y: number, z: number): boolean {
        // At -10 degrees
        const theta = radToDeg(Math.atan2(z, x))
        return Math.abs(theta - 10) < 3
    }

    onFinishLine(x: number, y: number, z: number): boolean {
        // At 0 degrees
        const theta = radToDeg(Math.atan2(z, x))
        return Math.abs(theta) < 3
    }

    tangentAt(x1: number, z1: number): [number, number] {
        const a = Math.atan2(z1, x1)
        return [-Math.sin(a), Math.cos(a)]
    }

    getProgressMade(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
        const dx = x2 - x1,
            dz = z2 - z1
        const [tx, tz] = this.tangentAt(x1, z1)
        console.log('tan', tx, tz, 'delta', dx, dz)
        const dot = -(dx * tx + dz * tz)
        console.log('dot', dot)
        return dot
    }

    generateStartingPosition(): Pose {
        const r = Math.random() * (Loop.outerRadius - Loop.innerRadius) + Loop.innerRadius
        // const theta = Math.random() * 2 * Math.PI
        const theta = 0
        const x = Math.cos(theta) * r
        const z = Math.sin(theta) * r
        // const y = 1e-6
        const y = 3

        const yaw = Math.atan2(-Math.sin(theta), Math.cos(theta)) + Math.PI/2

        console.log('yaw', yaw)

        return {
            x,
            y,
            z,
            yaw,
            roll: 0
        }
    }

}

export class FigureEight extends Track {
    static readonly radius = 50

    /*
      ----
     /    \
    | Top  |
     \    /
      -  -
     /    \
    | Bott |
     \    /
      ----
    */

    onMap(x: number, y: number, z: number): boolean {
        const r = Math.hypot(x, z)
        return r >= Loop.innerRadius && r <= Loop.outerRadius && y <= 1e-6 && y >= -1
    }

    onFinishLine(x: number, y: number, z: number): boolean {
        const dz = z - FigureEight.radius
        const dx = x

        const theta = Math.atan2(dz, dx)
        return Math.abs(theta) < 5 * Math.PI/180
    }

    aheadFinishLine(x: number, y: number, z: number): boolean {
        const dz = z - FigureEight.radius
        const dx = x

        const theta = Math.atan2(dz, dx)
        return Math.abs(theta - -10) < 5 * Math.PI/180
    }

    behindFinishLine(x: number, y: number, z: number): boolean {
        const dz = z - FigureEight.radius
        const dx = x

        const theta = Math.atan2(dz, dx)
        return Math.abs(theta - 10) < 5 * Math.PI/180
    }

    generateStartingPosition(): Pose {
        const r = Math.random() * (Loop.outerRadius - Loop.innerRadius) + Loop.innerRadius
        // const theta = Math.random() * 2 * Math.PI
        const theta = 0
        const x = Math.cos(theta) * r
        const z = Math.sin(theta) * r
        // const y = 1e-6
        const y = 3

        const yaw = Math.atan2(-Math.sin(theta), Math.cos(theta)) + Math.PI/2

        console.log('yaw', yaw)

        return {
            x,
            y,
            z,
            yaw,
            roll: 0
        }
    }

}

export type TrackType = 'FigureEight' | 'Loop'

export const trackTypeToTrack: {
    [key in TrackType]: typeof FigureEight | typeof Loop
} = {
    'FigureEight': FigureEight,
    'Loop': Loop
}