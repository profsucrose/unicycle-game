// Eventually migrate to TS as monorepo in Webpack

const express = require('express');
const { createServer } = require('http');
const { join } = require('path');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const generateRandomAnimalName = require('random-animal-name-generator')

const app = express();
const server = createServer(app);
const io = new Server(server, {
   cors: {
    origin: "http://localhost:8080",
    methods: ["GET", "POST"]
  }
});
// io.set('origins', 'http://localhost:8080');


const players = []

const port = 8081

const connections = new Set()

const broadcast = (event, payload) => connections.forEach(connection => connection.emit(event, payload))

const innerTrackRadius = 20
const outerTrackRadius = 50

const eventTypes = {
  CLIENT_PLAYER_MOVE: 'client-player-move',
  CLIENT_PLAYER_INIT: 'client-player-init',

  SERVER_PLAYER_INIT: 'server-player-init',
  SERVER_PLAYER_MOVE: 'server-player-move',
  SERVER_PLAYER_JOIN: 'server-player-join',
  SERVER_PLAYER_LEAVE: 'server-player-leave',
}

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

io.on('connection', async (socket) => {
  console.log('a user connected');

  let name = generateRandomAnimalName()

  while (name in players) {
    name = generateRandomAnimalName()
  }

  connections.add(socket)

  // const initializedPlayer = await new Promise((resolve, reject) => {
  //   socket.on(eventTypes.CLIENT_PLAYER_INIT, data => {
  //     resolve(data) 
  //   })
  // })

  const x = Math.random() * (outerTrackRadius - innerTrackRadius) + innerTrackRadius
  const y = 0
  const z = Math.random() * (outerTrackRadius - innerTrackRadius) + innerTrackRadius

  const player = {
    uuid: uuidv4(),
    yaw: Math.random() * Math.PI,
    roll: 0,
    x,
    y,
    z,
    name: name
  }

  console.log('Initializing player', player, players)
  socket.emit(eventTypes.SERVER_PLAYER_INIT, {
    player,
    currentPlayers: players
  })

  for (const s of connections) {
    if (socket != s)
      s.emit(eventTypes.SERVER_PLAYER_JOIN, player)
  }

  players.push(player)

  socket.on(eventTypes.CLIENT_PLAYER_MOVE, data => {
    Object.assign(player, {
      yaw: data.yaw,
      roll: data.roll,
      x: data.x,
      y: data.y,
      z: data.z,
    })
    broadcast(eventTypes.SERVER_PLAYER_MOVE, player)
  })

  socket.on('disconnect', () => {
    console.log('user disconnected');
    broadcast(eventTypes.SERVER_PLAYER_LEAVE, {
      uuid: player.uuid
    })
    delete players[name]
  })
});

server.listen(port, () => {
  console.log('server running at http://localhost:' + port);
});