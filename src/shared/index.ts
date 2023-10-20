export interface Pose {
    x: number,
    y: number,
    z: number,
    roll: number,
    yaw: number,
}

export const formatTime = (t: number) => {
    const minute = Math.floor(t/60)
    const seconds = t % 60
    return `${Math.floor(minute)}:${seconds < 10 ? '0' : ''}${seconds.toFixed(1)}`
}

export const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, x))

export * from './events'
export * from './tracks'

