import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { ClientToServerEvents, ServerToClientEvents, Loop, Player } from '../typings'
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

const track = new Loop()

const players: {[uuid: string]: Player} = {} 

io.on('connection', socket => {
    console.log('new connection!')

    socket.on('join', async cb => {
        const uuid = uuidv4()

        socket.data.uuid = uuid

        console.log('new player:', uuid)

        const sockets = await io.fetchSockets()

        const startingPose = track.generateStartingPosition()

        const name = generateRandomAnimalName()

        const player: Player = {
            name,
            uuid: uuid,
            pose: startingPose
        }

        console.log('sending players', players)
        cb(player, Object.values(players))

        players[uuid] = player

        for (const s of sockets) {
            if (s.id == socket.id) continue
            s.emit('playerJoin', player)
        }

        socket.on('playerMove', async (pose, velocities) => {
            const sockets = await io.fetchSockets()

            // Relay new position to all other players
            for (const s of sockets) {
                // Except for player who sent update
                if (s.id == socket.id) continue
                // console.log(s.data.uuid, socket.data.uuid)
                s.emit('playerMove', uuid, pose, velocities)
            }
        })

        socket.on('message', async text => {
            io.emit('message', text)
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