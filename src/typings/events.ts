import { Pose } from "."

export interface Player {
    uuid: string,
    name: string,
    pose: Pose,
}

export interface PlayerVelocities {
    wheelPitch: number,
}

export interface ServerToClientEvents {
    playerJoin: (player: Player) => void
    playerLeave: (uuid: string) => void
    playerMove: (uuid: string, pose: Pose, velocities: PlayerVelocities) => void
    message: (text: string) => void
}

export interface ClientToServerEvents {
    message: (text: string) => void
    join: (cb: ((player: Player, players: Player[]) => void)) => void
    playerMove: (newPose: Pose, velocities: PlayerVelocities) => void
}
