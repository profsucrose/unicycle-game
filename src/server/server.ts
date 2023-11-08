import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { ClientToServerEvents, ServerToClientEvents, Loop, Player, LeaderboardEntry, Leaderboard, formatTime, FigureEight, TrackType, trackTypeToTrack, Track } from '../shared'
import { v4 as uuidv4 } from 'uuid'
import generateRandomAnimalName from 'random-animal-name-generator'

const app = express();
const server = createServer(app);

const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents
>(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})

const port = 8082

let trackType: TrackType = 'Loop'
const track: Track = new trackTypeToTrack[trackType]()

interface PlayerEntry extends Player {
    progress: 0 | 1 | 2,
    lapTime: number
}

const players: {[uuid: string]: PlayerEntry} = {} 

const leaderboard: Leaderboard = []

setInterval(() => {
    for (const player of Object.values(players)) {
        player.lapTime += 10/1000
    }
}, 10)

io.on('connection', socket => {
    console.log('new connection!')

    socket.on('join', async (existingName, cb) => {
        const uuid = uuidv4()

        socket.data.uuid = uuid

        console.log('new player:', uuid)

        const sockets = await io.fetchSockets()

        const startingPose = track.generateStartingPosition()

        let name = existingName ?? generateRandomAnimalName()

        const player: PlayerEntry = {
            name,
            uuid: uuid,
            pose: startingPose,
            progress: 0,
            lapTime: 0
        }

        console.log('sending players', players)

        cb({
            player, 
            players: Object.values(players),
            leaderboard,
            trackType
        })

        players[uuid] = player

        const joinMessage = `${player.name} joined!`

        for (const s of sockets) {
            s.emit('chat', joinMessage)
            if (s.id == socket.id) continue
            s.emit('playerJoin', player)
        }

        socket.on('playerMove', async (pose, velocities) => {
            const sockets = await io.fetchSockets()

            // Handle track progression

            const ahead = track.aheadFinishLine(pose.x, pose.y, pose.z)
            const behind = track.behindFinishLine(pose.x, pose.y, pose.z)
            const finished = track.onFinishLine(pose.x, pose.y, pose.z)
            const progress = player.progress
            
            let finishedLap = false
            
            if (ahead && progress == 0) player.progress = 1
            if (behind && progress == 1) player.progress = 2
            if (finished) {
                // If went through ahead then behind, did a lap
                if (progress == 2) finishedLap = true

                // Otherwise, must have reversed back. So reset to 0
                else player.progress = 0
            }

            console.log('player progress', progress)

            if (finishedLap) {
                const formattedTime = formatTime(player.lapTime)
                io.emit('chat', `${player.name} finished a lap in ${formattedTime}!`)

                const i = leaderboard.findIndex(e => e.lapTime > player.lapTime)

                const entry = {
                    name,
                    lapTime: player.lapTime,
                }

                leaderboard.push(entry)

                // Should be inserted in order, but weird bug
                leaderboard.sort((a, b) => a.lapTime - b.lapTime)

                io.emit('updateLeaderboard', leaderboard)

                player.progress = 0
                player.lapTime = 0
            }

            // Relay new position to all other players
            for (const s of sockets) {
                // Except for player who sent update
                if (s.id == socket.id) continue
                // console.log(s.data.uuid, socket.data.uuid)
                s.emit('playerMove', uuid, pose, velocities)
            }
        })

        console.log('New server version')

        socket.on('setName', (newName, ack) => {
            console.log('player changing name to', newName)
            name = newName
            player.name = newName
            
            io.emit('playerChangeName', uuid, name)

            ack()
        })

        socket.on('chat', async text => {
            io.emit('chat', text)
        })

        socket.on('restart', async cb => {
            const startingPose = track.generateStartingPosition()

            cb(startingPose)

            io.emit('chat', `${name} restarted`)

            io.emit('playerMove', uuid, startingPose, {
                wheelPitch: 0
            })

            player.lapTime = 0
        })

        socket.on('disconnect', async () => {
            console.log(`${uuid} disconnected`)
            delete players[uuid]

            const sockets = await io.fetchSockets()

            for (const s of sockets) 
                s.emit('playerLeave', uuid)
        })
    })
})

server.listen(port, () => {
    console.log('server running at http://localhost:' + port);
});