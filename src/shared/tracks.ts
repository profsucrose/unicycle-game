import { Pose, clamp } from "."

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

    static readonly geometry = (() => {
        // const n = 200    

        // const segments = []
    
        // let x1, y1, z1
    
        // const width = 8
    
        // for (let i = 0; i < n; i++) {
        //     let t = i/(n-1) * 2 * Math.PI
    
        //     let x = FigureEight.radius * Math.cos(t) / (1 + Math.sin(t)**2)
        //     let z = (FigureEight.radius * Math.sin(t) * Math.cos(t)) / (1 + Math.sin(t)**2)
    
        //     let y = 10 * (1 - clamp(Math.abs(t - 4.72), 0, 1))
    
        //     y = clamp(y, 0, 8)
    
        //     if (i == 0) {
        //         x1 = x
        //         y1 = y
        //         z1 = z
        //         continue
        //     }
    
        //     const length = Math.hypot(x - x1, z - z1) + 0.2
            
        //     const angle = Math.atan2(x - x1, z - z1)
    
        //     const dist = Math.hypot(x - x1, y - y1, z - z1)
    
        //     const vertAngle = -Math.atan2(y - y1, 1.3)
            
        //     const heading = [0, Math.cos(vertAngle + Math.PI/2), 0]
            
        //     const segment = new THREE.PlaneGeometry(width, length)
        //         // .rotateX(degToRad(30))
        //         .rotateX(vertAngle + Math.PI/2)
        //         .rotateY(angle)
        //         .translate(x, y, z)

        //     let vertices = segment.getAttribute('position').array
    
        //     const s1 = [vertices[0], vertices[1], vertices[2]]
        //     const s2 = [vertices[3], vertices[4], vertices[5]]
        //     const s3 = [vertices[6], vertices[7], vertices[8]]
        //     const s4 = [vertices[9], vertices[10], vertices[11]]
    
        //     segments.push([
        //         s1, s2, s3, s4
        //     ])
    
        //     x1 = x
        //     y1 = y
        //     z1 = z
        // }

        // return segments
    })()

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
        return true
    }

    onFinishLine(x: number, y: number, z: number): boolean {
        return Math.abs(z) < 5
            && Math.abs(x) < 2
            && Math.abs(y) < 2
    }

    aheadFinishLine(x: number, y: number, z: number): boolean {
        return Math.abs(x - 6) < 0.5
    }

    behindFinishLine(x: number, y: number, z: number): boolean {
        return Math.abs(x - (-6)) < 0.5
    }

    generateStartingPosition(): Pose {
        return {
            x: 0,
            y: 0,
            z: 0,
            yaw: -Math.PI/4,
            roll: 0
        }        

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