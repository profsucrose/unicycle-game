import { Pose } from "."

type Position = {
    x: number,
    y: number,
    z: number,
}

abstract class Track {
    abstract onMap(x: number, y: number, z: number): boolean
    abstract generateStartingPosition(): Pose

    // TODO: Move to Position type
    // Returns whatever "progress" has been made over a change in position, where progress
    // is positive if the player is now closer to the end, or negative if they're closer to the beginning.
    // Sign of total progress is tracked on client (should be server) so reversing behind the finish line doesn't count as a lap.
    abstract getProgressMade(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number
}

export class Loop extends Track {
    static readonly innerRadius = 5
    static readonly outerRadius = 15

    onMap(x: number, y: number, z: number): boolean {
        const r = Math.hypot(x, z)
        return r >= Loop.innerRadius && r <= Loop.outerRadius && y <= 1e-6 && y >= -1
    }

    onFinishLine(x: number, y: number, z: number): boolean {
        const theta = Math.atan2(z, x)
        return Math.abs(theta) < 5 * Math.PI/180
    }

    getProgressMade(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
        const startAngle = Math.atan2(z1, x1)
        const endAngle = Math.atan2(z2, x2)
        return startAngle - endAngle
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

// export class FigureEight extends Track {
//     static readonly ringInnerRadius = 5
//     static readonly ringOuterRadius = 10

//     generateMesh(): THREE.Mesh {
//         const geometry = new THREE.RingGeometry(FigureEight.ringInnerRadius, FigureEight.ringOuterRadius, 32);
//         const material = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide });

//         const mesh = new THREE.Mesh(geometry, material)
//             .rotateX(Math.PI / 2);

//         return mesh
//     }

//     onMap(x: number, y: number, z: number): boolean {
//         const r = Math.hypot(x, z)
//         return r >= Loop.innerRadius && r <= Loop.outerRadius && y <= 1e-6 && y >= -1
//     }

//     onFinishLine(x: number, y: number, z: number): boolean {
//         const theta = Math.atan2(z, x)
//         return Math.abs(theta) < 5 * Math.PI/180
//     }

//     generateStartingPosition(): Pose {
//         const r = Math.random() * (Loop.outerRadius - Loop.innerRadius) + Loop.innerRadius
//         // const theta = Math.random() * 2 * Math.PI
//         const theta = 0
//         const x = Math.cos(theta) * r
//         const z = Math.sin(theta) * r
//         // const y = 1e-6
//         const y = 3

//         const yaw = Math.atan2(-Math.sin(theta), Math.cos(theta)) + Math.PI/2

//         console.log('yaw', yaw)

//         return {
//             x,
//             y,
//             z,
//             yaw,
//             roll: 0
//         }
//     }

// }