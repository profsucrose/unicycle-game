import { Pose, TrackType } from "."

export interface Player {
    uuid: string,
    name: string,
    pose: Pose,
}

// Gross distinction, between ClientLeaderboard
// for serialized leaderboard entries sent between client and server,
// and then the server has its own leaderboard type.
export interface LeaderboardEntry {
    name: string,
    lapTime: number
}

export type Leaderboard = LeaderboardEntry[]

export interface PlayerVelocities {
    wheelPitch: number
}

// Data client needs from server upon joining
export interface InitClient {
    player: Player,
    players: Player[],
    leaderboard: Leaderboard,
    trackType: TrackType
}

export interface ServerToClientEvents {
    playerJoin: (player: Player) => void
    playerLeave: (uuid: string) => void
    playerMove: (uuid: string, pose: Pose, velocities: PlayerVelocities) => void
    playerChangeName: (uuid: string, name: string) => void
    chat: (text: string) => void
    updateLeaderboard: (leaderboard: Leaderboard) => void
    changeTrack: (trackType: TrackType, poseResets: [string, Pose][]) => void
}

export interface ClientToServerEvents {
    chat: (text: string) => void
    join: (name: string | null, cb: ((data: InitClient) => void)) => void
    restart: (cb: ((newPose: Pose) => void)) => void
    playerMove: (newPose: Pose, velocities: PlayerVelocities) => void
    setName: (name: string, ack: () => void) => void
    setTrack: (track: TrackType, ack: () => void) => void
}
